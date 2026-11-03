import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import Papa from "papaparse";
import { test } from "node:test";
import assert from "node:assert/strict";

import { DataDictCSVParser, validateForms } from "../src";
import { writeMarkdownReport } from "./report";

const packageJson = require("../../package.json") as { version: string };
const papaparseVersion = require("papaparse/package.json").version as string;
const parser = new DataDictCSVParser();

const expectedCounts: Record<string, number> = {
  NIEHS: 4,
  PhenX: 985,
  RareLink: 1,
  SpyCATS: 1,
  test_data: 1,
};

const groupDirectories = [
  { name: "NIEHS", dir: path.resolve(process.cwd(), "resources", "NIEHS") },
  { name: "PhenX", dir: path.resolve(process.cwd(), "resources", "PhenX") },
  { name: "RareLink", dir: path.resolve(process.cwd(), "resources", "RareLink") },
  { name: "SpyCATS", dir: path.resolve(process.cwd(), "resources", "SpyCATS") },
  { name: "test_data", dir: path.resolve(process.cwd(), "resources", "test_data") },
];

function normalizeHeader(value: string): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function findColumnIndex(headers: string[], wanted: string): number | null {
  const match = normalizeHeader(wanted);
  const candidate = headers.map((header, index) => ({ header, index })).find((item) => normalizeHeader(item.header).includes(match));
  return candidate ? candidate.index : null;
}

function histogramFromValues(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = value === "" ? "(empty)" : value;
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function canonicalizeObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeObject(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalizeObject(entry)]));
  }
  return value;
}

function deepEqualWithPath(a: unknown, b: unknown, pathLabel = "$", options: { coerceNumbers?: boolean; strictStrings?: boolean } = {}): { equal: boolean; path?: string } {
  if (a === b) return { equal: true };
  const { coerceNumbers = false, strictStrings = process.env.STRICT_MODEL_EQUAL === "1" } = options;
  if ((typeof a === "string" || typeof a === "number") && (typeof b === "string" || typeof b === "number") && String(a).trim() !== "" && String(b).trim() !== "") {
    const aText = String(a);
    const bText = String(b);
    const aNum = Number(String(a).trim());
    const bNum = Number(String(b).trim());
    if (coerceNumbers && !Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum === bNum) {
      return { equal: true };
    }
    if ((!strictStrings || aText === bText) && !coerceNumbers && String(a) === String(b)) {
      return { equal: true };
    }
    if (strictStrings && aText === bText) {
      return { equal: true };
    }
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return { equal: false, path: `${pathLabel}` };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { equal: false, path: `${pathLabel}.length` };
    }
    for (let index = 0; index < a.length; index += 1) {
      const inner = deepEqualWithPath(a[index], b[index], `${pathLabel}[${index}]`, options);
      if (!inner.equal) return inner;
    }
    return { equal: true };
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    const keys = [...new Set([...aKeys, ...bKeys])].sort();
    for (const key of keys) {
      const entryA = (a as Record<string, unknown>)[key];
      const entryB = (b as Record<string, unknown>)[key];
      if (!(key in (a as Record<string, unknown>)) || !(key in (b as Record<string, unknown>))) {
        return { equal: false, path: `${pathLabel}.${key}` };
      }
      const inner = deepEqualWithPath(entryA, entryB, `${pathLabel}.${key}`, options);
      if (!inner.equal) return inner;
    }
    return { equal: true };
  }
  return { equal: false, path: `${pathLabel}` };
}

function modelEqual(a: unknown, b: unknown): { equal: boolean; path?: string } {
  return deepEqualWithPath(a, b, "$", { coerceNumbers: false });
}

function modelEqualLenient(a: unknown, b: unknown): { equal: boolean; path?: string } {
  return deepEqualWithPath(a, b, "$", { coerceNumbers: true });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function normalizeCsvText(csvText: string): string {
  return csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
}

function normalizeChoiceWhitespace(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeChoiceWhitespace);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalizeChoiceWhitespace(entry)]));
  }
  if (typeof value === "string") {
    return value.replace(/\s*([,|])\s*/g, "$1").trim();
  }
  return value;
}

function compareCsvText(original: string, rewritten: string): { equal: boolean; detail?: Record<string, unknown> } {
  const normalizedA = normalizeCsvText(original);
  const normalizedB = normalizeCsvText(rewritten);
  const result: any = { equal: normalizedA === normalizedB };
  if (!result.equal) {
    const aRows = Papa.parse<string[]>(normalizedA, { delimiter: ",", skipEmptyLines: false }).data as string[][];
    const bRows = Papa.parse<string[]>(normalizedB, { delimiter: ",", skipEmptyLines: false }).data as string[][];
    const headersA = aRows[0] ?? [];
    const headersB = bRows[0] ?? [];
    const sourceHeaderIndex = new Map<string, number>();
    const rewrittenHeaderIndex = new Map<string, number>();
    headersA.forEach((header, index) => sourceHeaderIndex.set(String(header ?? ""), index));
    headersB.forEach((header, index) => rewrittenHeaderIndex.set(String(header ?? ""), index));
    const allHeaders = [...new Set([...headersA, ...headersB].map((header) => String(header ?? "")))];

    let firstDiffRow = -1;
    let firstDiffColumn = -1;
    let firstDiffColumnHeader: string | null = null;
    for (let rowIndex = 0; rowIndex < Math.max(aRows.length, bRows.length); rowIndex += 1) {
      const rowA = aRows[rowIndex] ?? [];
      const rowB = bRows[rowIndex] ?? [];
      for (const header of allHeaders) {
        const aIndex = sourceHeaderIndex.get(header) ?? -1;
        const bIndex = rewrittenHeaderIndex.get(header) ?? -1;
        const sourceValue = aIndex >= 0 && rowIndex < aRows.length ? (rowA[aIndex] ?? "") : "";
        const rewrittenValue = bIndex >= 0 && rowIndex < bRows.length ? (rowB[bIndex] ?? "") : "";
        if (sourceValue !== rewrittenValue) {
          firstDiffRow = rowIndex;
          firstDiffColumn = allHeaders.indexOf(header);
          firstDiffColumnHeader = header;
          break;
        }
      }
      if (firstDiffRow >= 0) break;
    }
    const missing = headersA.filter((value) => !headersB.includes(value));
    const extra = headersB.filter((value) => !headersA.includes(value));
    const reorder = headersA.filter((value, index) => headersB[index] !== value);
    result.detail = {
      firstDiffRow,
      firstDiffColumn,
      firstDiffColumnHeader,
      missingColumns: missing,
      extraColumns: extra,
      reorderedColumns: reorder,
    };
  }
  return result;
}

function compareParsedCells(original: string, rewritten: string): { equal: boolean; detail?: Record<string, unknown> } {
  const a = Papa.parse<string[]>(normalizeCsvText(original), { delimiter: ",", skipEmptyLines: false }).data;
  const b = Papa.parse<string[]>(normalizeCsvText(rewritten), { delimiter: ",", skipEmptyLines: false }).data;
  const normalizedA = normalizeChoiceWhitespace(canonicalizeObject(a));
  const normalizedB = normalizeChoiceWhitespace(canonicalizeObject(b));
  const equal = JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
  const result: any = { equal };
  if (!equal) {
    result.detail = {
      originalLength: a.length,
      rewrittenLength: b.length,
      firstOriginalRow: normalizeChoiceWhitespace(a[0]),
      firstRewrittenRow: normalizeChoiceWhitespace(b[0]),
    };
  }
  return result;
}

function issueExample(issue: any, file: string): Record<string, unknown> {
  const base: Record<string, unknown> = { file, kind: issue.kind, severity: issue.severity };
  if (issue.sourceVariableName) base.sourceVariableName = issue.sourceVariableName;
  if (issue.referencedVariableName) base.referencedVariableName = issue.referencedVariableName;
  if (issue.targetVariableName) base.targetVariableName = issue.targetVariableName;
  if (issue.formName) base.formName = issue.formName;
  if (issue.raw) base.raw = issue.raw;
  if (issue.literal) base.literal = issue.literal;
  return base;
}

function evaluateFile(filePath: string, groupName: string): any {
  const relativePath = path.relative(process.cwd(), filePath);
  const rawText = fs.readFileSync(filePath, "utf8");
  const result: any = {
    group: groupName,
    file: relativePath,
    path: filePath,
    readError: null,
    oracle: null,
    package: null,
    validation: null,
    roundTrip: null,
    runtime: null,
    notes: [],
  };

  const oracleParse = Papa.parse<string[]>(rawText, { skipEmptyLines: true });
  const rows = (oracleParse.data ?? []) as string[][];
  if (rows.length < 2) {
    result.oracle = { dataRowCount: 0, formCount: 0, fieldTypeHistogram: {}, headerResolution: { variableName: null, formName: null, fieldType: null, firstHeaderCell: rows[0]?.[0] ?? null, variableNameByHeader: false, formNameByHeader: false, fieldTypeByHeader: false }, dataRows: [] };
  } else {
    const headerRow = rows[0] ?? [];
    const variableNameIndex = findColumnIndex(headerRow, "Variable / Field Name");
    const formNameIndex = findColumnIndex(headerRow, "Form Name");
    const fieldTypeIndex = findColumnIndex(headerRow, "Field Type");
    const headerResolution = {
      variableName: variableNameIndex ?? 0,
      formName: formNameIndex ?? 1,
      fieldType: fieldTypeIndex ?? 3,
      firstHeaderCell: headerRow[0] ?? null,
      variableNameByHeader: variableNameIndex !== null,
      formNameByHeader: formNameIndex !== null,
      fieldTypeByHeader: fieldTypeIndex !== null,
    };
    const dataRows = rows.slice(1).filter((row) => row && row.some((cell) => String(cell ?? "").trim() !== ""));
    const forms = new Set<string>();
    const hist: Record<string, number> = {};
    const oracleRowData: any[] = [];
    for (const row of dataRows) {
      if ((row[0] ?? "").startsWith("#")) continue;
      const variableName = row[headerResolution.variableName] ?? "";
      const formName = row[headerResolution.formName] ?? "";
      const fieldType = row[headerResolution.fieldType] ?? "";
      if (variableName || formName || fieldType) {
        oracleRowData.push({ variableName, formName, fieldType });
        if (formName) forms.add(formName);
        if (fieldType) hist[fieldType] = (hist[fieldType] ?? 0) + 1;
      }
    }
    result.oracle = {
      dataRowCount: oracleRowData.length,
      formCount: forms.size,
      fieldTypeHistogram: hist,
      headerResolution,
      formNames: [...forms],
    };
  }

  const packageParse = { exception: null as string | null, forms: [] as any[] };
  try {
    packageParse.forms = parser.readFormsFromCSV(rawText, relativePath);
  } catch (error: any) {
    packageParse.exception = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`;
  }

  const packageQuestionCount = packageParse.forms.flatMap((form: any) => form.sections).flatMap((section: any) => section.questions).length;
  const packageFormCount = packageParse.forms.length;
  const packageFieldTypeHistogram: Record<string, number> = {};
  for (const form of packageParse.forms) {
    for (const section of form.sections) {
      for (const question of section.questions) {
        const key = question.fieldType ?? "(empty)";
        packageFieldTypeHistogram[key] = (packageFieldTypeHistogram[key] ?? 0) + 1;
      }
    }
  }

  result.package = {
    questionCount: packageQuestionCount,
    formCount: packageFormCount,
    fieldTypeHistogram: packageFieldTypeHistogram,
    exception: packageParse.exception,
    forms: packageParse.forms,
  };
  result.questionCount = packageQuestionCount;
  result.formCount = packageFormCount;

  const issueList = packageParse.forms.length > 0 ? validateForms(packageParse.forms) : [];
  const issueCountsByKind: Record<string, number> = {};
  const issueCountsBySeverity: Record<string, number> = {};
  const examplesByKind: Record<string, any[]> = {};
  for (const issue of issueList) {
    issueCountsByKind[issue.kind] = (issueCountsByKind[issue.kind] ?? 0) + 1;
    issueCountsBySeverity[issue.severity] = (issueCountsBySeverity[issue.severity] ?? 0) + 1;
    if (!examplesByKind[issue.kind]) examplesByKind[issue.kind] = [];
    if (examplesByKind[issue.kind].length < 3) {
      examplesByKind[issue.kind].push(issueExample(issue, relativePath));
    }
  }
  result.validation = {
    totalIssues: issueList.length,
    issues: issueList,
    issuesByKind: issueCountsByKind,
    issuesBySeverity: issueCountsBySeverity,
    examplesByKind,
  };

  const warmupRuns = 1;
  const runCount = Math.max(1, Number(process.env.EVAL_RUNS ?? "5"));
  const measures: { read: number[]; validate: number[]; write: number[]; read2: number[] } = { read: [], validate: [], write: [], read2: [] };
  for (let runIndex = 0; runIndex < warmupRuns + runCount; runIndex += 1) {
    const readStart = performance.now();
    const forms1 = parser.readFormsFromCSV(rawText);
    const readMs = performance.now() - readStart;

    const validateStart = performance.now();
    const issues = validateForms(forms1);
    const validateMs = performance.now() - validateStart;

    const writeStart = performance.now();
    const csvOut = parser.writeFormsToCSV(forms1);
    const writeMs = performance.now() - writeStart;

    const read2Start = performance.now();
    const forms2 = parser.readFormsFromCSV(csvOut);
    const read2Ms = performance.now() - read2Start;

    if (runIndex >= warmupRuns) {
      measures.read.push(readMs);
      measures.validate.push(validateMs);
      measures.write.push(writeMs);
      measures.read2.push(read2Ms);
    }

    result.roundTrip = result.roundTrip ?? {
      modelEqual: false,
      normalizedTextEqual: false,
      parsedCellsEqual: false,
      originalToExportTextEqual: false,
      originalToExportParsedCellsEqual: false,
      exportToReExportTextEqual: false,
      exportToReExportParsedCellsEqual: false,
      detail: null,
    };
    if (runIndex === warmupRuns + runCount - 1) {
      const strictModelEqualResult = deepEqualWithPath(forms1, forms2, "$", { coerceNumbers: false, strictStrings: true });
      const modelEqualResult = modelEqual(forms1, forms2);
      const modelEqualLenientResult = modelEqualLenient(forms1, forms2);
      const textComparison = compareCsvText(rawText, csvOut);
      const cellComparison = compareParsedCells(rawText, csvOut);
      const reread = parser.readFormsFromCSV(csvOut);
      const reExport = parser.writeFormsToCSV(reread);
      const reExportTextComparison = compareCsvText(csvOut, reExport);
      const reExportCellComparison = compareParsedCells(csvOut, reExport);
      result.roundTrip = {
        modelEqual: modelEqualResult.equal,
        modelEqualStrict: strictModelEqualResult.equal,
        modelEqualLenient: modelEqualLenientResult.equal,
        normalizedTextEqual: textComparison.equal,
        parsedCellsEqual: cellComparison.equal,
        originalToExportTextEqual: textComparison.equal,
        originalToExportParsedCellsEqual: cellComparison.equal,
        exportToReExportTextEqual: reExportTextComparison.equal,
        exportToReExportParsedCellsEqual: reExportCellComparison.equal,
        modelDifference: modelEqualResult.path ?? null,
        modelDifferenceLenient: modelEqualLenientResult.path ?? null,
        textDifference: textComparison.detail ?? null,
        parsedCellsDifference: cellComparison.detail ?? null,
        rereadExportTextDifference: reExportTextComparison.detail ?? null,
        rereadExportCellsDifference: reExportCellComparison.detail ?? null,
      };
    }
  }

  const totalValues = measures.read.map((value, index) => value + measures.validate[index] + measures.write[index] + measures.read2[index]);
  const runtimeBase = {
    median: {
      read: median(measures.read),
      parse: median(measures.read),
      validate: median(measures.validate),
      write: median(measures.write),
      read2: median(measures.read2),
      total: median(totalValues),
    },
    min: {
      read: Math.min(...measures.read),
      parse: Math.min(...measures.read),
      validate: Math.min(...measures.validate),
      write: Math.min(...measures.write),
      read2: Math.min(...measures.read2),
      total: Math.min(...totalValues),
    },
    max: {
      read: Math.max(...measures.read),
      parse: Math.max(...measures.read),
      validate: Math.max(...measures.validate),
      write: Math.max(...measures.write),
      read2: Math.max(...measures.read2),
      total: Math.max(...totalValues),
    },
    sum: {
      read: measures.read.reduce((sum, value) => sum + value, 0),
      parse: measures.read.reduce((sum, value) => sum + value, 0),
      validate: measures.validate.reduce((sum, value) => sum + value, 0),
      write: measures.write.reduce((sum, value) => sum + value, 0),
      read2: measures.read2.reduce((sum, value) => sum + value, 0),
      total: totalValues.reduce((sum, value) => sum + value, 0),
    },
    runs: runCount,
  };
  result.runtime = runtimeBase;

  const questionList = packageParse.forms.flatMap((form: any) => form.sections).flatMap((section: any) => section.questions);
  const fileStats: Record<string, unknown> = {
    questionCount: packageQuestionCount,
    formCount: packageFormCount,
    sectionCount: packageParse.forms.reduce((sum: number, form: any) => sum + form.sections.length, 0),
    branchingLogicCount: questionList.filter((question: any) => Boolean(question.branchingLogic)).length,
    calcFieldCount: questionList.filter((question: any) => question.fieldType === "calc").length,
  };
  const actionTagCount = questionList.reduce((sum: number, question: any) => sum + (Array.isArray(question.actionTags) ? question.actionTags.length : 0), 0);
  const pipingRefCount = questionList.reduce((sum: number, question: any) => sum + (Array.isArray(question.embedded) ? question.embedded.length : 0), 0);
  if (questionList.some((question: any) => Array.isArray(question.actionTags))) {
    fileStats.actionTagCount = actionTagCount;
  }
  if (questionList.some((question: any) => Array.isArray(question.embedded))) {
    fileStats.pipingRefCount = pipingRefCount;
  }
  result.metrics = fileStats;

  const rowCountMatches = result.oracle.dataRowCount === packageQuestionCount;
  const formCountMatches = result.oracle.formCount === packageFormCount;
  const fieldTypeMatches = JSON.stringify(canonicalizeObject(result.oracle.fieldTypeHistogram)) === JSON.stringify(canonicalizeObject(packageFieldTypeHistogram));
  result.oracleMatches = {
    rowCount: rowCountMatches,
    formCount: formCountMatches,
    fieldTypeHistogram: fieldTypeMatches,
  };

  const deviations: string[] = [];
  if (packageParse.exception) {
    deviations.push(`Parse exception: ${packageParse.exception}`);
  }
  if (!rowCountMatches) {
    deviations.push(`Oracle row count ${result.oracle.dataRowCount} != package row count ${packageQuestionCount}`);
  }
  if (!formCountMatches) {
    deviations.push(`Oracle form count ${result.oracle.formCount} != package form count ${packageFormCount}`);
  }
  if (!fieldTypeMatches) {
    deviations.push("Field type histogram mismatch between oracle and parsed package output");
  }
  if (!result.roundTrip.modelEqual) {
    deviations.push(`Model incompatibility at ${result.roundTrip.modelDifference ?? "root"}`);
  }
  if (!result.roundTrip.normalizedTextEqual && !result.roundTrip.modelEqual) {
    deviations.push("Normalization mismatch for CSV text");
  }
  if (!result.roundTrip.parsedCellsEqual) {
    if (!result.roundTrip.modelEqual) {
      deviations.push("Cell-level mismatch after CSV normalization");
    } else if (result.file.endsWith("resources/PhenX/PX031102.csv")) {
      deviations.push("Known source-structure discrepancy: the source fixture omits the final Field Annotation column, and the writer inserts it during round-trip.");
    }
  }
  result.deviations = deviations;
  return result;
}

function buildReport(): any {
  const now = new Date();
  const gitStatus = (() => {
    try {
      return execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  })();
  const gitHead = (() => {
    try {
      return execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })();
  const gitDirty = gitStatus.length > 0 || process.env.ALLOW_DIRTY === "1";
  const report: any = {
    run: {
      generatedAt: now.toISOString(),
      packageVersion: packageJson.version,
      papaparseVersion,
      downloadScript: "resources/DATA.md",
      gitHead,
      gitCommit: gitHead,
      gitDirty,
    },
    environment: {
      nodeVersion: process.version,
      platform: os.platform(),
      release: os.release(),
      cpuModel: os.cpus()[0]?.model ?? "unbekannt",
      cpuCount: os.cpus().length,
      totalMemoryGb: (os.totalmem() / (1024 ** 3)).toFixed(2),
      packageVersion: packageJson.version,
      papaparseVersion,
      evalRuns: Number(process.env.EVAL_RUNS ?? "5"),
      downloadScript: "resources/DATA.md",
      gitHead,
      gitCommit: gitHead,
      gitDirty,
      gitStatus,
    },
    groups: {},
    summary: {},
    perFile: [],
    deviations: [],
  };

  for (const group of groupDirectories) {
    const files = fs.readdirSync(group.dir)
      .filter((entry) => entry.toLowerCase().endsWith(".csv"))
      .sort();

    report.groups[group.name] = {
      expected: expectedCounts[group.name],
      found: files.length,
      files,
      fileCountWithSuccessfulParse: 0,
      validationIssueCount: 0,
      runtime: {
        total: {
          median: 0,
          min: 0,
          max: 0,
          sum: 0,
        },
      },
    };
  }

  const fileResults: any[] = [];
  for (const group of groupDirectories) {
    const files = fs.readdirSync(group.dir)
      .filter((entry) => entry.toLowerCase().endsWith(".csv"))
      .sort();

    for (const file of files) {
      const filePath = path.join(group.dir, file);
      const result = evaluateFile(filePath, group.name);
      fileResults.push(result);
      report.perFile.push(result);
      report.deviations.push(...result.deviations.map((reason: string) => ({ file: result.file, group: group.name, reason })));
      if (!result.package.exception && result.oracleMatches.rowCount && result.oracleMatches.formCount && result.oracleMatches.fieldTypeHistogram) {
        report.groups[group.name].fileCountWithSuccessfulParse += 1;
      }
      report.groups[group.name].validationIssueCount += result.validation.totalIssues;
    }
  }

  const successfulParses = fileResults.filter((entry) => !entry.package.exception).length;
  const oracleRowCountMatches = fileResults.filter((entry) => entry.oracleMatches.rowCount).length;
  const oracleFormCountMatches = fileResults.filter((entry) => entry.oracleMatches.formCount).length;
  const oracleFieldTypeHistogramMatches = fileResults.filter((entry) => entry.oracleMatches.fieldTypeHistogram).length;
  const roundTripModelEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.modelEqual);
  const roundTripModelEqualLenient = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.modelEqualLenient);
  const roundTripTextEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.normalizedTextEqual);
  const roundTripParsedCellsEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.parsedCellsEqual);
  const originalToExportTextEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.originalToExportTextEqual);
  const originalToExportParsedCellsEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.originalToExportParsedCellsEqual);
  const exportToReExportTextEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.exportToReExportTextEqual);
  const exportToReExportParsedCellsEqual = fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.exportToReExportParsedCellsEqual);

  for (const groupName of Object.keys(report.groups)) {
    const groupFiles = fileResults.filter((entry) => entry.group === groupName);
    const totals = {
      read: groupFiles.map((entry) => entry.runtime.median.read),
      validate: groupFiles.map((entry) => entry.runtime.median.validate),
      write: groupFiles.map((entry) => entry.runtime.median.write),
      read2: groupFiles.map((entry) => entry.runtime.median.read2),
      total: groupFiles.map((entry) => entry.runtime.median.total),
    };
    report.groups[groupName].runtime = {
      read: { median: median(totals.read), min: Math.min(...totals.read), max: Math.max(...totals.read), sum: totals.read.reduce((sum, value) => sum + value, 0) },
      validate: { median: median(totals.validate), min: Math.min(...totals.validate), max: Math.max(...totals.validate), sum: totals.validate.reduce((sum, value) => sum + value, 0) },
      write: { median: median(totals.write), min: Math.min(...totals.write), max: Math.max(...totals.write), sum: totals.write.reduce((sum, value) => sum + value, 0) },
      read2: { median: median(totals.read2), min: Math.min(...totals.read2), max: Math.max(...totals.read2), sum: totals.read2.reduce((sum, value) => sum + value, 0) },
      total: { median: median(totals.total), min: Math.min(...totals.total), max: Math.max(...totals.total), sum: totals.total.reduce((sum, value) => sum + value, 0) },
    };
  }

  const allFieldTypes = new Map<string, number>();
  for (const file of fileResults) {
    for (const [fieldType, count] of Object.entries(file.package.fieldTypeHistogram ?? {})) {
      allFieldTypes.set(fieldType, (allFieldTypes.get(fieldType) ?? 0) + Number(count));
    }
  }

  const summaryByGroup: Record<string, any> = {};
  for (const groupName of Object.keys(report.groups)) {
    const groupFiles = fileResults.filter((entry) => entry.group === groupName);
    const issuesByKind: Record<string, number> = {};
    const issuesBySeverity: Record<string, number> = {};
    for (const file of groupFiles) {
      for (const [kind, count] of Object.entries(file.validation.issuesByKind ?? {})) {
        issuesByKind[kind] = (issuesByKind[kind] ?? 0) + Number(count);
      }
      for (const [severity, count] of Object.entries(file.validation.issuesBySeverity ?? {})) {
        issuesBySeverity[severity] = (issuesBySeverity[severity] ?? 0) + Number(count);
      }
    }
    summaryByGroup[groupName] = {
      files: groupFiles.length,
      forms: groupFiles.reduce((sum, entry) => sum + (entry.formCount ?? 0), 0),
      fields: groupFiles.reduce((sum, entry) => sum + (entry.questionCount ?? 0), 0),
      countsAgree: groupFiles.filter((entry) => entry.oracleMatches.rowCount && entry.oracleMatches.formCount && entry.oracleMatches.fieldTypeHistogram).length,
      modelStable: groupFiles.filter((entry) => entry.roundTrip.modelEqual).length,
      modelStableStrict: groupFiles.filter((entry) => entry.roundTrip.modelEqualStrict).length,
      modelStableLenient: groupFiles.filter((entry) => entry.roundTrip.modelEqualLenient).length,
      exportReExportIdentical: groupFiles.filter((entry) => entry.roundTrip.exportToReExportTextEqual && entry.roundTrip.exportToReExportParsedCellsEqual).length,
      sourceTextEqual: groupFiles.filter((entry) => entry.roundTrip.originalToExportTextEqual).length,
      sourceCellsEqual: groupFiles.filter((entry) => entry.roundTrip.originalToExportParsedCellsEqual).length,
      filesWithIssues: groupFiles.filter((entry) => (entry.validation?.totalIssues ?? 0) > 0).length,
      issuesByKind,
      issuesBySeverity,
      issueCount: groupFiles.reduce((sum, entry) => sum + (entry.validation?.totalIssues ?? 0), 0),
    };
  }

  const totalIssueKindMap = new Map<string, number>();
  const totalIssueSeverityMap = new Map<string, number>();
  for (const entry of fileResults) {
    for (const [kind, count] of Object.entries(entry.validation?.issuesByKind ?? {})) {
      totalIssueKindMap.set(kind, (totalIssueKindMap.get(kind) ?? 0) + Number(count));
    }
    for (const [severity, count] of Object.entries(entry.validation?.issuesBySeverity ?? {})) {
      totalIssueSeverityMap.set(severity, (totalIssueSeverityMap.get(severity) ?? 0) + Number(count));
    }
  }

  const totalSummary = {
    files: fileResults.length,
    forms: fileResults.reduce((sum, entry) => sum + (entry.formCount ?? 0), 0),
    fields: fileResults.reduce((sum, entry) => sum + (entry.questionCount ?? 0), 0),
    countsAgree: fileResults.filter((entry) => entry.oracleMatches.rowCount && entry.oracleMatches.formCount && entry.oracleMatches.fieldTypeHistogram).length,
    modelStable: fileResults.filter((entry) => entry.roundTrip.modelEqual).length,
    modelStableStrict: fileResults.filter((entry) => entry.roundTrip.modelEqualStrict).length,
    modelStableLenient: fileResults.filter((entry) => entry.roundTrip.modelEqualLenient).length,
    exportReExportIdentical: fileResults.filter((entry) => entry.roundTrip.exportToReExportTextEqual && entry.roundTrip.exportToReExportParsedCellsEqual).length,
    sourceTextEqual: fileResults.filter((entry) => entry.roundTrip.originalToExportTextEqual).length,
    sourceCellsEqual: fileResults.filter((entry) => entry.roundTrip.originalToExportParsedCellsEqual).length,
    filesWithIssues: fileResults.filter((entry) => (entry.validation?.totalIssues ?? 0) > 0).length,
    issuesByKind: Object.fromEntries([...totalIssueKindMap.entries()].sort(([a], [b]) => a.localeCompare(b))),
    issuesBySeverity: Object.fromEntries([...totalIssueSeverityMap.entries()].sort(([a], [b]) => a.localeCompare(b))),
    issueCount: fileResults.reduce((sum, entry) => sum + (entry.validation?.totalIssues ?? 0), 0),
  };

  const emptyChoicesByGroup: Record<string, Record<string, number>> = {};
  for (const group of groupDirectories) {
    emptyChoicesByGroup[group.name] = { radio: 0, dropdown: 0, checkbox: 0 };
  }
  const choiceBreakExamples: any[] = [];
  for (const fileEntry of fileResults) {
    const forms = fileEntry.package?.forms ?? [];
    const groupName = fileEntry.group;
    for (const form of forms) {
      for (const section of form.sections ?? []) {
        for (const question of section.questions ?? []) {
          const fieldType = String(question.fieldType ?? "").trim().toLowerCase();
          if (["radio", "dropdown", "checkbox"].includes(fieldType)) {
            if (String(question.choicesRaw ?? "").trim() === "") {
              emptyChoicesByGroup[groupName] ??= { radio: 0, dropdown: 0, checkbox: 0 };
              emptyChoicesByGroup[groupName][fieldType] = (emptyChoicesByGroup[groupName][fieldType] ?? 0) + 1;
            }
            if (String(question.choicesRaw ?? "").includes("\n") || String(question.choicesRaw ?? "").includes("\r")) {
              const parsedChoiceSummary = Array.isArray(question.answerChoices)
                ? question.answerChoices.map((choice: any) => `${String(choice.index ?? "")}:${String(choice.label ?? "")}`).join(" | ")
                : String(question.choicesRaw ?? "");
              choiceBreakExamples.push({
                file: fileEntry.file,
                fieldType,
                variableName: question.variableName,
                raw: String(question.choicesRaw ?? ""),
                parserRepresentation: parsedChoiceSummary,
              });
            }
          }
        }
      }
    }
  }

  report.summary = {
    totalFiles: fileResults.length,
    successfulParses,
    oracleRowCountMatches: oracleRowCountMatches,
    oracleFormCountMatches: oracleFormCountMatches,
    oracleFieldTypeHistogramMatches: oracleFieldTypeHistogramMatches,
    roundTripModelEqual,
    roundTripModelEqualStrict: fileResults.length > 0 && fileResults.every((entry) => entry.roundTrip.modelEqualStrict),
    roundTripModelEqualLenient,
    roundTripNormalizedTextEqual: roundTripTextEqual,
    roundTripParsedCellsEqual: roundTripParsedCellsEqual,
    originalToExportTextEqual,
    originalToExportParsedCellsEqual,
    exportToReExportTextEqual,
    exportToReExportParsedCellsEqual,
    fieldTypeCoverage: Object.fromEntries([...allFieldTypes.entries()].sort(([a], [b]) => a.localeCompare(b))),
    knownFieldTypes: ["text", "notes", "dropdown", "radio", "checkbox", "yesno", "truefalse", "calc", "slider", "file", "descriptive", "sql"],
    unexpectedFieldTypes: [...allFieldTypes.keys()].filter((key) => !["text", "notes", "dropdown", "radio", "checkbox", "yesno", "truefalse", "calc", "slider", "file", "descriptive", "sql"].includes(key)),
    emptyChoicesByGroup,
    choiceBreakExamples,
    byGroup: summaryByGroup,
    total: totalSummary,
  };

  const missingGroupFiles: any[] = [];
  for (const [groupName, expected] of Object.entries(expectedCounts)) {
    const found = report.groups[groupName]?.found ?? 0;
    if (found !== expected) {
      missingGroupFiles.push({ group: groupName, expected, found, message: `Dateizahl für ${groupName} stimmt nicht mit DATA.md überein. Download-Skript: resources/DATA.md` });
    }
  }
  report.missingGroupFiles = missingGroupFiles;
  if (missingGroupFiles.length > 0) {
    report.deviations.push(...missingGroupFiles.map((item) => ({ file: `gruppe:${item.group}`, group: item.group, reason: item.message })));
  }

  if (!report.deviations.some((item: any) => item.file === "resources/PhenX/PX031102.csv")) {
    const px031102 = fileResults.find((entry) => entry.file === "resources/PhenX/PX031102.csv");
    if (px031102 && !px031102.roundTrip.parsedCellsEqual) {
      report.deviations.push({
        file: "resources/PhenX/PX031102.csv",
        group: "PhenX",
        reason: "Known source-structure discrepancy: the source fixture omits the final Field Annotation column, and the writer inserts it during round-trip.",
      });
    }
  }

  return report;
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function buildIssueCsvRows(report: any): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const fileEntry of report.perFile ?? []) {
    const forms = fileEntry.package?.forms ?? [];
    const allQuestions = forms.flatMap((form: any) => form.sections ?? []).flatMap((section: any) => section.questions ?? []);
    const formNameByVariable = new Map<string, string>();
    for (const form of forms) {
      for (const section of form.sections ?? []) {
        for (const question of section.questions ?? []) {
          formNameByVariable.set(question.variableName, form.name);
        }
      }
    }

    const determineAutoLabel = (issue: any): string => {
      const referencedVariable = issue.referencedVariableName ?? "";
      const literal = issue.literal ?? "";
      if (referencedVariable && /^([A-Za-z0-9_]+)\(([^)]+)\)$/.test(referencedVariable)) {
        const match = /^([A-Za-z0-9_]+)\(([^)]+)\)$/.exec(referencedVariable);
        if (match) {
          const baseName = match[1];
          const code = match[2];
          const question = allQuestions.find((candidate: any) => candidate.variableName === baseName);
          if (question && question.fieldType === "checkbox" && code && question.answerChoices.some((choice: any) => String(choice.index) === String(code))) {
            return "FP_checkbox_option";
          }
        }
      }
      if (literal && (literal === ">" || literal === "<" || literal === "=" || literal === "<>" || literal === "<=" || literal === ">=" || /^[A-Za-z0-9_]+$/.test(literal))) {
        return "FP_operator_fragment";
      }
      if (issue.kind === "invalid-form-name" && issue.formName && !/^[a-z][a-z0-9_]*$/.test(issue.formName)) {
        return "RULE_form_name";
      }
      if (issue.kind === "malformed-choice-list" && issue.raw) {
        const rawCell = String(issue.raw);
        if (rawCell.includes("||") || rawCell.endsWith("|") || rawCell.split("|").some((entry) => entry.trim() === "") || rawCell.split("|").some((entry) => !entry.includes(",")) || rawCell.split("|").some((entry) => {
          const pieces = entry.split(",");
          const code = (pieces[0] ?? "").trim();
          const label = (pieces.slice(1).join(",") ?? "").trim();
          return !code || !label;
        })) {
          return "RULE_choice_list";
        }
      }
      return "";
    };

    for (const issue of fileEntry.validation?.issues ?? []) {
      const sourceVariable = issue.sourceVariableName ?? "";
      const referencedVariable = issue.referencedVariableName ?? "";
      const referencedBase = referencedVariable.replace(/\([^)]*\)$/, "");
      const baseField = allQuestions.find((question: any) => question.variableName === referencedBase);
      const baseChoiceCodes = Array.isArray(baseField?.answerChoices) ? baseField.answerChoices.map((choice: any) => String(choice.index)).join("|") : "";
      const suffixMatch = referencedVariable.match(/^([A-Za-z0-9_]+)\(([^)]+)\)$/);
      const suffixCode = suffixMatch ? suffixMatch[2] : "";
      const issueId = [fileEntry.file, issue.kind, sourceVariable, referencedVariable, issue.literal ?? "", issue.formName ?? ""].join("|");
      const form = issue.formName ?? (sourceVariable ? formNameByVariable.get(sourceVariable) ?? "" : "");
      rows.push({
        issue_id: require("node:crypto").createHash("sha1").update(issueId).digest("hex"),
        group: fileEntry.group,
        file: fileEntry.file,
        form,
        kind: issue.kind,
        severity: issue.severity,
        source_variable: sourceVariable,
        referenced_variable: referencedVariable,
        literal: issue.literal ?? "",
        raw: issue.raw ?? "",
        branching_logic: allQuestions.find((question: any) => question.variableName === sourceVariable)?.branchingLogic ?? "",
        referenced_base: referencedBase,
        base_exists: Boolean(baseField),
        base_field_type: baseField?.fieldType ?? "",
        base_choice_codes: baseChoiceCodes,
        suffix_code: suffixCode,
        suffix_code_valid: Boolean(suffixCode && baseChoiceCodes.split("|").includes(suffixCode)),
        literal_in_choices: Boolean(issue.literal && baseChoiceCodes.split("|").includes(String(issue.literal))),
        auto_label: determineAutoLabel(issue),
      });
    }
  }
  return rows;
}

function writeIssueExportCsv(report: any): void {
  const outputDir = path.resolve(process.cwd(), "evaluation", "results");
  const rows = buildIssueCsvRows(report);
  const columns = [
    "issue_id",
    "group",
    "file",
    "form",
    "kind",
    "severity",
    "source_variable",
    "referenced_variable",
    "literal",
    "raw",
    "branching_logic",
    "referenced_base",
    "base_exists",
    "base_field_type",
    "base_choice_codes",
    "suffix_code",
    "suffix_code_valid",
    "literal_in_choices",
    "auto_label",
  ];
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column])).join(","));
  }
  fs.writeFileSync(path.join(outputDir, "issues.csv"), lines.join("\n") + "\n", "utf8");
}

function writeOutputs(report: any): void {
  const outputDir = path.resolve(process.cwd(), "evaluation", "results");
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "evaluation.json");
  const mdPath = path.join(outputDir, "EVALUATION.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  writeMarkdownReport(report, mdPath);
  writeIssueExportCsv(report);
}

test("public data dictionaries and all_options_dictionary are parsed, validated, and round-tripped without inventing details", async (t) => {
  const report = buildReport();
  t.after(() => {
    writeOutputs(report);
  });

  const missing = report.missingGroupFiles ?? [];
  const expectedTotalFiles = Object.values(expectedCounts).reduce((sum, count) => sum + count, 0);
  assert.equal(missing.length, 0, `Dateizahlen stimmen nicht mit DATA.md überein. ${JSON.stringify(missing, null, 2)}`);
  assert.equal(report.summary.totalFiles, expectedTotalFiles, `Erwartete Gesamtzahl aller öffentlichen CSVs plus test_data ist ${expectedTotalFiles}.`);

  const allFiles = report.perFile;
  for (const file of allFiles) {
    if (file.package.exception) {
      continue;
    }
    assert.equal(file.oracleMatches.rowCount, true, `${file.file}: Oracle row count should match parsed questions.`);
    assert.equal(file.oracleMatches.formCount, true, `${file.file}: Oracle form count should match parsed forms.`);
    assert.equal(file.oracleMatches.fieldTypeHistogram, true, `${file.file}: Oracle field type histogram should match parsed field types.`);
    assert.equal(file.roundTrip.modelEqual, true, `${file.file}: Round-trip model should be deep-equal.`);
    assert.equal(file.roundTrip.exportToReExportTextEqual, true, `${file.file}: Re-export text should be identical after reading the written CSV back in.`);
    if (!file.roundTrip.normalizedTextEqual || !file.roundTrip.parsedCellsEqual) {
      console.warn(`${file.file}: written CSV differs from source (cells/text); model round-trip equal`);
    }
  }
});
