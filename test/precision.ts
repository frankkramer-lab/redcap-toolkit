import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import Papa from "papaparse";

import { DataDictCSVParser, validateForms } from "../src";

const parser = new DataDictCSVParser();
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")).version as string;
const SAMPLE_SEED = Number(process.env.SAMPLE_SEED ?? "20261103");
const SAMPLE_PER_STRATUM = Number(process.env.SAMPLE_PER_STRATUM ?? "30");
const ISSUE_KINDS = ["dangling-reference", "possible-stale-choice-literal", "invalid-form-name", "malformed-choice-list"] as const;
const SAMPLE_KINDS = ["dangling-reference", "possible-stale-choice-literal"] as const;
const RESULTS_DIR = path.resolve(process.cwd(), "evaluation", "results");
const SOURCE_PATH = path.resolve(process.cwd(), "resources", "test_data", "all_options_dictionary.csv");

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRowsToString(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function sha1(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function parseCsvRows(rawText: string): string[][] {
  return (Papa.parse<string[]>(rawText, { delimiter: ",", skipEmptyLines: false }).data ?? []) as string[][];
}

function getFieldByVariableName(forms: any[], variableName: string): any {
  for (const form of forms) {
    for (const section of form.sections ?? []) {
      for (const question of section.questions ?? []) {
        if (question.variableName === variableName) return question;
      }
    }
  }
  return undefined;
}

function getFormNameForVariable(forms: any[], variableName: string): string {
  const field = getFieldByVariableName(forms, variableName);
  return field?.formName ?? "";
}

function getRowByVariableName(rawText: string, variableName: string): string[] | null {
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) return null;
  const header = rows[0];
  const variableIndex = header.findIndex((cell) => /Variable\s*\/\s*Field\s*Name/i.test(String(cell ?? "")));
  if (variableIndex < 0) return null;
  for (const row of rows.slice(1)) {
    if ((row[variableIndex] ?? "") === variableName) return row;
  }
  return null;
}

function getRawChoiceCodesForField(field: any): string {
  if (!field) return "";
  if (Array.isArray(field.answerChoices) && field.answerChoices.length > 0) {
    return field.answerChoices.map((choice: any) => String(choice.rawIndex ?? choice.index ?? "")).filter(Boolean).join("|");
  }
  if (typeof field.choicesRaw === "string" && field.choicesRaw.trim()) {
    return field.choicesRaw
      .split("|")
      .map((entry: string) => entry.trim())
      .filter(Boolean)
      .map((entry: string) => entry.split(",")[0].trim())
      .filter(Boolean)
      .join("|");
  }
  return "";
}

function getCaseInsensitiveMatch(forms: any[], variableName: string): string | undefined {
  const normalized = variableName.toLowerCase();
  for (const form of forms) {
    for (const section of form.sections ?? []) {
      for (const question of section.questions ?? []) {
        if (question.variableName.toLowerCase() === normalized) {
          return question.variableName;
        }
      }
    }
  }
  return undefined;
}

function getAutoLabel(issue: any): string {
  const literal = String(issue.literal ?? "").trim();
  const referencedVariable = String(issue.referencedVariableName ?? "").trim();
  const kind = issue.kind;

  if (referencedVariable && /^([A-Za-z0-9_]+)\(([^)]+)\)$/.test(referencedVariable)) {
    const match = /^([A-Za-z0-9_]+)\(([^)]+)\)$/.exec(referencedVariable);
    if (match) {
      const baseName = match[1];
      const suffixCode = match[2];
      const field = getFieldByVariableName(issue._forms ?? [], baseName);
      if (field && field.fieldType === "checkbox" && suffixCode && field.answerChoices.some((choice: any) => String(choice.index) === String(suffixCode))) {
        return "FP_checkbox_option";
      }
    }
  }

  if (literal && (/[<>!=]/.test(literal) || /^[A-Za-z0-9_]+\)$/.test(literal) || /^(?:>|<|=|<>|<=|>=|!=)$/.test(literal))) {
    return "FP_operator_fragment";
  }

  if (kind === "invalid-form-name" && issue.formName && !/^[a-z][a-z0-9_]*$/.test(issue.formName)) {
    return "RULE_form_name";
  }

  if (kind === "malformed-choice-list" && issue.raw) {
    const rawCell = String(issue.raw);
    const parts = rawCell.split("|");
    if (rawCell.includes("||") || rawCell.endsWith("|") || parts.some((entry) => entry.trim() === "") || parts.some((entry) => !entry.includes(",")) || parts.some((entry) => {
      const [code = "", label = ""] = entry.split(",");
      return !code.trim() || !label.trim();
    })) {
      return "RULE_choice_list";
    }
  }

  return "";
}

function getBaseInfo(issue: any, forms: any[]): {
  referencedBase: string;
  baseExists: boolean;
  baseExistsCaseInsensitive: boolean;
  baseFieldType: string;
  baseChoiceCodes: string;
  rawChoiceCodes: string;
  suffixCode: string;
  suffixCodeValid: boolean;
  literalInChoices: boolean;
  caseMismatchOf: string;
} {
  const referencedVariable = issue.referencedVariableName ?? "";
  const referencedBase = referencedVariable.replace(/\([^)]*\)$/, "");
  const baseField = getFieldByVariableName(forms, referencedBase);
  const baseExists = Boolean(baseField);
  const baseExistsCaseInsensitive = baseExists || Boolean(getCaseInsensitiveMatch(forms, referencedBase));
  const baseChoiceCodes = Array.isArray(baseField?.answerChoices) ? baseField.answerChoices.map((choice: any) => String(choice.index)).join("|") : "";
  const rawChoiceCodes = getRawChoiceCodesForField(baseField);
  const suffixMatch = referencedVariable.match(/^([A-Za-z0-9_]+)\(([^)]+)\)$/);
  const suffixCode = suffixMatch ? suffixMatch[2] : "";
  const suffixCodeValid = Boolean(suffixCode && baseChoiceCodes.split("|").filter(Boolean).includes(suffixCode));
  const literalInChoices = Boolean(issue.literal && baseChoiceCodes.split("|").filter(Boolean).includes(String(issue.literal)));

  return {
    referencedBase,
    baseExists,
    baseExistsCaseInsensitive,
    baseFieldType: baseField?.fieldType ?? "",
    baseChoiceCodes,
    rawChoiceCodes,
    suffixCode,
    suffixCodeValid,
    literalInChoices,
    caseMismatchOf: issue.caseMismatchOf ?? "",
  };
}

function buildIssueRowsForFile(filePath: string, group: string): any[] {
  const rawText = fs.readFileSync(filePath, "utf8");
  const forms = parser.readFormsFromCSV(rawText);
  const issues = validateForms(forms);
  const rows: any[] = [];

  for (const issue of issues) {
    const sourceQuestion = issue.sourceVariableName ? getFieldByVariableName(forms, issue.sourceVariableName) : undefined;
    const baseInfo = getBaseInfo(issue, forms);
    const autoLabel = getAutoLabel(issue);
    const issueIdSeed = [path.relative(process.cwd(), filePath), issue.kind, issue.sourceVariableName ?? "", issue.referencedVariableName ?? "", issue.literal ?? "", issue.formName ?? ""].join("|");
    rows.push({
      issue_id: sha1(issueIdSeed),
      group,
      file: path.relative(process.cwd(), filePath),
      form: issue.formName ?? (issue.sourceVariableName ? getFormNameForVariable(forms, issue.sourceVariableName) : ""),
      kind: issue.kind,
      severity: issue.severity,
      source_variable: issue.sourceVariableName ?? "",
      referenced_variable: issue.referencedVariableName ?? "",
      literal: issue.literal ?? "",
      raw: issue.raw ?? "",
      branching_logic: sourceQuestion?.branchingLogic ?? "",
      referenced_base: baseInfo.referencedBase,
      base_exists: baseInfo.baseExists,
      base_exists_case_insensitive: baseInfo.baseExistsCaseInsensitive,
      case_mismatch_of: baseInfo.caseMismatchOf,
      caseMismatchOf: baseInfo.caseMismatchOf,
      base_field_type: baseInfo.baseFieldType,
      base_choice_codes: baseInfo.baseChoiceCodes,
      raw_choice_codes: baseInfo.rawChoiceCodes,
      suffix_code: baseInfo.suffixCode,
      suffix_code_valid: baseInfo.suffixCodeValid,
      literal_in_choices: baseInfo.literalInChoices,
      auto_label: autoLabel,
      _forms: forms,
      _source_row: sourceQuestion ? getRowByVariableName(rawText, sourceQuestion.variableName) ?? [] : [],
      _referenced_row: issue.referencedVariableName ? getRowByVariableName(rawText, baseInfo.referencedBase) ?? [] : [],
    });
  }

  return rows;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleStratified(rows: any[], samplePerStratum: number, seed: number): any[] {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const stratumKey = `${row.kind}|${row.group}`;
    const bucket = grouped.get(stratumKey) ?? [];
    bucket.push(row);
    grouped.set(stratumKey, bucket);
  }

  const selected: any[] = [];
  const seenIds = new Set<string>();
  for (const [stratumKey, bucket] of [...grouped.entries()].sort()) {
    const [kind, group] = stratumKey.split("|");
    if (!SAMPLE_KINDS.includes(kind as any)) continue;
    const limit = Math.min(bucket.length, samplePerStratum);
    if (limit <= 0) continue;
    const random = seededRandom((seed + hashString(stratumKey)) >>> 0);
    const indexes = new Set<number>();
    while (indexes.size < limit) {
      const index = Math.floor(random() * bucket.length);
      const item = bucket[index];
      if (!item || seenIds.has(item.issue_id)) {
        continue;
      }
      indexes.add(index);
      seenIds.add(item.issue_id);
    }
    for (const index of indexes) {
      const item = bucket[index];
      if (item) selected.push({ ...item, _sample_group: `${kind}|${group}` });
    }
  }
  return selected;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function writeIssueCsv(rows: any[]): void {
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
    "base_exists_case_insensitive",
    "case_mismatch_of",
    "base_field_type",
    "base_choice_codes",
    "raw_choice_codes",
    "suffix_code",
    "suffix_code_valid",
    "literal_in_choices",
    "auto_label",
  ];
  const data = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
  fs.writeFileSync(path.join(RESULTS_DIR, "issues.csv"), csvRowsToString(data), "utf8");
}

function writeSampleCsv(rows: any[]): void {
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
    "base_exists_case_insensitive",
    "case_mismatch_of",
    "caseMismatchOf",
    "base_field_type",
    "base_choice_codes",
    "raw_choice_codes",
    "suffix_code",
    "suffix_code_valid",
    "literal_in_choices",
    "auto_label",
    "source_row_raw",
    "referenced_row_raw",
    "label",
    "rater",
    "comment",
    "label_2",
    "rater_2",
  ];
  const sampleOutputPath = path.join(RESULTS_DIR, "precision_sample.csv");
  const sampleNewPath = path.join(RESULTS_DIR, "precision_sample.new.csv");
  const data = rows.map((row) => ({
    ...Object.fromEntries(columns.filter((column) => column !== "source_row_raw" && column !== "referenced_row_raw" && column !== "label" && column !== "rater" && column !== "comment" && column !== "label_2" && column !== "rater_2").map((column) => [column, row[column]])),
    source_row_raw: JSON.stringify(row._source_row ?? []),
    referenced_row_raw: JSON.stringify(row._referenced_row ?? []),
    label: "",
    rater: "",
    comment: "",
    label_2: "",
    rater_2: "",
  }));

  const existingSamplePath = sampleOutputPath;
  if (fs.existsSync(existingSamplePath)) {
    const existingText = fs.readFileSync(existingSamplePath, "utf8");
    const existingRows = parseCsvRows(existingText);
    const existingHeader = existingRows[0] ?? [];
    const issueIdIndex = existingHeader.findIndex((cell) => String(cell ?? "").trim().toLowerCase() === "issue_id");
    const labelIndex = existingHeader.findIndex((cell) => String(cell ?? "").trim().toLowerCase() === "label");
    const label2Index = existingHeader.findIndex((cell) => String(cell ?? "").trim().toLowerCase() === "label_2");
    const labelledIssueIds = new Set<string>();
    for (const row of existingRows.slice(1)) {
      const issueId = String(row[issueIdIndex] ?? "").trim();
      const label = String(row[labelIndex] ?? "").trim();
      const label2 = String(row[label2Index] ?? "").trim();
      if (issueId && (label || label2)) {
        labelledIssueIds.add(issueId);
      }
    }
    if (labelledIssueIds.size > 0) {
      const stillPresent = data.filter((row) => labelledIssueIds.has(String(row.issue_id ?? ""))).length;
      fs.writeFileSync(sampleNewPath, csvRowsToString(data), "utf8");
      console.log(`precision_sample.csv already has labels; wrote ${stillPresent} issue_ids still present to ${path.relative(process.cwd(), sampleNewPath)} and left the labelled sample untouched.`);
      return;
    }
  }
  fs.writeFileSync(sampleOutputPath, csvRowsToString(data), "utf8");
}

function parseChoiceCodes(rawCell: string): string[] {
  if (!rawCell || !rawCell.trim()) return [];
  return rawCell
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(",")[0].trim())
    .filter(Boolean);
}

function collectBranchingLogicCodes(branchingLogic: string): string[] {
  const codes = new Set<string>();
  const regex = /\[([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]+)\))?\]\s*(?:<>|!=|<=|>=|=|<|>)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))/g;
  for (const match of branchingLogic.matchAll(regex)) {
    const directCode = match[2] ?? match[3] ?? match[4] ?? match[5];
    if (directCode !== undefined && directCode !== "") {
      codes.add(String(directCode).trim());
    }
  }
  return [...codes];
}

export function buildMutants(): any[] {
  const baseText = fs.readFileSync(SOURCE_PATH, "utf8");
  const rows = parseCsvRows(baseText);
  const header = rows[0] ?? [];
  const variableIndex = header.findIndex((cell) => /Variable\s*\/\s*Field\s*Name/i.test(String(cell ?? "")));
  const formIndex = header.findIndex((cell) => /Form\s*Name/i.test(String(cell ?? "")));
  const choicesIndex = header.findIndex((cell) => /Choices/i.test(String(cell ?? "")));
  const branchingIndex = header.findIndex((cell) => /Branching Logic/i.test(String(cell ?? "")));
  const sourceFile = path.relative(process.cwd(), SOURCE_PATH);
  const niehsFile = "resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv";

  const rowsByVariable = new Map<string, string[]>();
  for (const row of rows.slice(1)) {
    const variableName = row[variableIndex] ?? "";
    if (variableName) rowsByVariable.set(variableName, row);
  }

  const mutants: any[] = [];
  const seen = new Set<string>();
  const addMutant = (mutant: any, baseFile: string, mutatedRows: string[][]): void => {
    const text = Papa.unparse(mutatedRows);
    const id = sha1(`${mutant.kind}|${baseFile}|${text}`);
    if (seen.has(id)) return;
    seen.add(id);
    mutants.push({ ...mutant, id, baseFile, text });
  };

  const nameVariants = [
    { type: "uppercase letter", rename: (name: string) => `X${name.slice(1)}` },
    { type: "hyphen", rename: (name: string) => `${name}-mutant` },
    { type: "leading digit", rename: (name: string) => `1${name}` },
    { type: "space", rename: (name: string) => `${name} mutant` },
    { type: "slash", rename: (name: string) => `${name}/mutant` },
    { type: "non-ASCII letter", rename: (name: string) => `${name}é` },
  ];
  const addFormMutants = (baseRows: string[][], baseFile: string, limit: number): void => {
    const formColumn = baseRows[0].findIndex((cell) => /Form\s*Name/i.test(String(cell ?? "")));
    const names = [...new Set(baseRows.slice(1).map((row) => row[formColumn] ?? ""))].filter((name) => /^[a-z][a-z0-9_]*$/.test(name));
    for (const originalForm of names) {
      for (const variant of nameVariants) {
        if (mutants.filter((mutant) => mutant.kind === "invalid-form-name").length >= limit) return;
        const invalidName = variant.rename(originalForm);
        const mutatedRows = baseRows.map((row) => [...row]);
        for (const row of mutatedRows.slice(1)) {
          if (row[formColumn] === originalForm) row[formColumn] = invalidName;
        }
        addMutant({ kind: "invalid-form-name", expected: "invalid-form-name", mutatedVariable: "", mutatedForm: invalidName,
          target: originalForm, mutationApplied: `${variant.type}: ${originalForm} → ${invalidName}` }, baseFile, mutatedRows);
      }
    }
  };
  addFormMutants(rows, sourceFile, 10);

  const danglingCandidates = [...new Set(rows.slice(1).flatMap((row) => {
    const branch = row[branchingIndex] ?? "";
    const refs = [...branch.matchAll(/\[([A-Za-z][A-Za-z0-9_]*)\]/g)].map((match) => match[1]);
    return refs;
  }))].filter((name) => name && rowsByVariable.has(name));
  for (const variableName of danglingCandidates.slice(0, 10)) {
    const rowIndex = rows.findIndex((row, idx) => idx > 0 && (row[variableIndex] ?? "") === variableName);
    if (rowIndex < 0) continue;
    const mutatedRows = rows.map((row) => [...row]);
    const mutatedRow = mutatedRows[rowIndex];
    const renamed = `${variableName}_mutant_${sha1(variableName).slice(0, 6)}`;
    mutatedRow[variableIndex] = renamed;
    addMutant({
      kind: "dangling-reference",
      expected: "dangling-reference",
      mutatedVariable: variableName,
      mutatedForm: mutatedRow[formIndex] ?? "",
      target: variableName,
      mutationApplied: `renamed variable ${variableName} to ${renamed}`,
    }, sourceFile, mutatedRows);
  }

  const addStaleMutants = (baseRows: string[][], baseFile: string, limit: number): void => {
    const header = baseRows[0];
    const variableColumn = header.findIndex((cell) => /Variable\s*\/\s*Field\s*Name/i.test(cell));
    const formColumn = header.findIndex((cell) => /Form\s*Name/i.test(cell));
    const typeColumn = header.findIndex((cell) => /Field\s*Type/i.test(cell));
    const choicesColumn = header.findIndex((cell) => /Choices/i.test(cell));
    const branchColumn = header.findIndex((cell) => /Branching Logic/i.test(cell));
    const targets = new Map(baseRows.slice(1).map((row, index) => [row[variableColumn], index + 1]));
    const comparedCodes = new Set<string>();
    for (const row of baseRows.slice(1)) {
      for (const match of String(row[branchColumn] ?? "").matchAll(/\[([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]+)\))?\]\s*(<>|!=|<=|>=|=|<|>)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))/g)) {
        const [, variableName, checkboxCode, operator, single, double, number] = match;
        if (["<", ">", "<=", ">="].includes(operator)) continue;
        const targetIndex = targets.get(variableName);
        if (targetIndex === undefined) continue;
        const targetRow = baseRows[targetIndex];
        if (!["radio", "dropdown", "checkbox"].includes(String(targetRow[typeColumn] ?? "").trim().toLowerCase())) continue;
        const code = String(checkboxCode ?? single ?? double ?? number ?? "").trim();
        const entries = String(targetRow[choicesColumn] ?? "").split("|").map((entry) => entry.trim()).filter(Boolean);
        if (!code || entries.length < 2 || !parseChoiceCodes(targetRow[choicesColumn]).includes(code)) continue;
        const key = `${variableName}|${code}`;
        if (comparedCodes.has(key)) continue;
        comparedCodes.add(key);
        const mutatedRows = baseRows.map((sourceRow) => [...sourceRow]);
        mutatedRows[targetIndex][choicesColumn] = entries.filter((entry) => entry.split(",")[0].trim() !== code).join(" | ");
        addMutant({ kind: "possible-stale-choice-literal", expected: "possible-stale-choice-literal",
          mutatedVariable: variableName, mutatedForm: targetRow[formColumn] ?? "", target: variableName,
          expectedCode: code, mutationApplied: `removed compared option code ${code} from ${variableName}` }, baseFile, mutatedRows);
        if (mutants.filter((mutant) => mutant.kind === "possible-stale-choice-literal").length >= limit) return;
      }
    }
  };
  addStaleMutants(rows, sourceFile, 10);

  const malformedRules = [
    { rule: "empty-element", apply: (cell: string) => `${cell.trim()}|` },
    { rule: "missing-code", apply: (cell: string) => {
      const parts = cell.split("|").map((entry) => entry.trim()).filter(Boolean);
      if (parts.length === 0) return cell;
      parts[0] = parts[0].replace(/^[^,]+,\s*/, "");
      return parts.join(" | ");
    } },
    { rule: "empty-code", apply: (cell: string) => {
      const parts = cell.split("|").map((entry) => entry.trim()).filter(Boolean);
      if (parts.length === 0) return cell;
      parts[0] = parts[0].replace(/^[^,]+/, "");
      return parts.join(" | ");
    } },
    { rule: "duplicate-code", apply: (cell: string) => {
      const parts = cell.split("|").map((entry) => entry.trim()).filter(Boolean);
      if (parts.length === 0) return cell;
      const firstCode = parts[0].split(",")[0].trim();
      parts.push(`${firstCode}, Duplicate Answer`);
      return parts.join(" | ");
    } },
    { rule: "empty-label", apply: (cell: string) => {
      const parts = cell.split("|").map((entry) => entry.trim()).filter(Boolean);
      if (parts.length === 0) return cell;
      parts[0] = parts[0].replace(/,[^,]*$/, ",");
      return parts.join(" | ");
    } },
  ];

  const malformedTargets = [...new Set(rows.slice(1).filter((row) => ["radio", "dropdown", "checkbox"].includes(String(row[3] ?? "").trim().toLowerCase())).map((row) => row[variableIndex] ?? ""))].filter(Boolean);
  for (const targetName of malformedTargets) {
    const rowIndex = rows.findIndex((row, idx) => idx > 0 && (row[variableIndex] ?? "") === targetName);
    if (rowIndex < 0) continue;
    for (const rule of malformedRules) {
      const mutatedRows = rows.map((row) => [...row]);
      const targetRow = mutatedRows[rowIndex];
      const input = String(targetRow[choicesIndex] ?? "");
      if (!input.trim()) continue;
      targetRow[choicesIndex] = rule.apply(input);
      if (targetRow[choicesIndex] === input) continue;
      addMutant({ kind: "malformed-choice-list", expected: "malformed-choice-list", expectedRule: rule.rule,
        mutatedVariable: targetName, mutatedForm: targetRow[formIndex] ?? "", target: targetName,
        mutationApplied: `rule=${rule.rule} on ${targetName}` }, sourceFile, mutatedRows);
    }
  }

  if (mutants.filter((mutant) => mutant.kind === "invalid-form-name").length < 10
    || mutants.filter((mutant) => mutant.kind === "possible-stale-choice-literal").length < 10) {
    // Each mutant is an in-memory copy; the NIEHS fixture itself is never changed.
    const niehsRows = parseCsvRows(fs.readFileSync(path.resolve(process.cwd(), niehsFile), "utf8"));
    if (mutants.filter((mutant) => mutant.kind === "invalid-form-name").length < 10) addFormMutants(niehsRows, niehsFile, 10);
    if (mutants.filter((mutant) => mutant.kind === "possible-stale-choice-literal").length < 10) addStaleMutants(niehsRows, niehsFile, 10);
  }
  return mutants;
}

function issueSignature(issue: any): string {
  return [
    issue.kind ?? "",
    issue.sourceVariableName ?? "",
    issue.referencedVariableName ?? "",
    issue.formName ?? "",
    issue.rule ?? "",
    String(issue.literal ?? ""),
    String(issue.raw ?? ""),
  ].join("|");
}

const baselineIssuesByFile = new Map<string, Set<string>>();

function evaluateMutant(mutant: any): { detected: boolean; matchingIssue: any | null } {
  let baselineSet = baselineIssuesByFile.get(mutant.baseFile);
  if (!baselineSet) {
    const baselineForms = parser.readFormsFromCSV(fs.readFileSync(path.resolve(process.cwd(), mutant.baseFile), "utf8"));
    baselineSet = new Set(validateForms(baselineForms).map((issue: any) => issueSignature(issue)));
    baselineIssuesByFile.set(mutant.baseFile, baselineSet);
  }

  const mutatedForms = parser.readFormsFromCSV(mutant.text);
  const mutatedIssues = validateForms(mutatedForms);
  const newMutatedIssues = mutatedIssues.filter((issue: any) => issue.kind === mutant.expected && !baselineSet.has(issueSignature(issue)));

  const match = newMutatedIssues.find((issue: any) => {
    if (mutant.kind === "invalid-form-name") return Boolean(mutant.mutatedForm && issue.formName === mutant.mutatedForm);
    if (mutant.kind === "possible-stale-choice-literal") {
      return issue.referencedVariableName === mutant.target && issue.literal === mutant.expectedCode;
    }
    if (mutant.kind === "malformed-choice-list") {
      return issue.sourceVariableName === mutant.target && issue.rule === mutant.expectedRule;
    }
    return mutant.kind === "dangling-reference" && issue.referencedVariableName === mutant.target;
  }) ?? null;

  return {
    detected: Boolean(match),
    matchingIssue: match,
  };
}

export function runRecallCheck(): any {
  const mutants = buildMutants();
  const perKind: Record<string, { total: number; distinctMutants: number; detected: number; undetected: any[]; mutants: any[] }> = {};

  for (const kind of ISSUE_KINDS) {
    const bucket = mutants.filter((mutant) => mutant.expected === kind);
    const enriched = bucket.map((mutant) => {
      const result = evaluateMutant(mutant);
      return {
        kind: mutant.kind,
        id: mutant.id,
        baseFile: mutant.baseFile,
        target: mutant.target ?? mutant.mutatedVariable ?? mutant.mutatedForm ?? "",
        expectedRule: mutant.expectedRule ?? "",
        expectedCode: mutant.expectedCode ?? "",
        mutationApplied: mutant.mutationApplied ?? "",
        detected: result.detected,
        matchingIssue: result.matchingIssue ? {
          kind: result.matchingIssue.kind,
          sourceVariableName: result.matchingIssue.sourceVariableName ?? "",
          referencedVariableName: result.matchingIssue.referencedVariableName ?? "",
          formName: result.matchingIssue.formName ?? "",
          literal: result.matchingIssue.literal ?? "",
          rule: result.matchingIssue.rule ?? "",
          raw: result.matchingIssue.raw ?? "",
        } : null,
      };
    });
    perKind[kind] = {
      total: bucket.length,
      distinctMutants: new Set(bucket.map((entry) => entry.id)).size,
      detected: enriched.filter((entry) => entry.detected).length,
      undetected: enriched.filter((entry) => !entry.detected),
      mutants: enriched,
    };
  }

  return {
    mutants: Object.values(perKind).flatMap((entry) => entry.mutants),
    resultsByKind: Object.fromEntries(Object.entries(perKind).map(([kind, value]) => [kind, {
      total: value.total,
      distinctMutants: value.distinctMutants,
      detected: value.detected,
      undetected: value.undetected,
    }])),
  };
}

function writeRecallSummary(summary: any): void {
  fs.writeFileSync(path.join(RESULTS_DIR, "precision_recall.json"), JSON.stringify(summary, null, 2), "utf8");
}

function writePhenxOriginalReport(): any[] {
  const baseDir = path.resolve(process.cwd(), "resources", "PhenX_original");
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const results: any[] = [];
  for (const file of fs.readdirSync(baseDir).filter((entry) => entry.toLowerCase().endsWith(".csv")).sort()) {
    const filePath = path.join(baseDir, file);
    const rawText = fs.readFileSync(filePath, "utf8");
    let forms: any[] = [];
    let parseError: string | null = null;
    try {
      forms = parser.readFormsFromCSV(rawText);
    } catch (error: any) {
      parseError = `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`;
    }
    const issues = parseError ? [] : validateForms(forms);
    const issueKinds = issues.map((issue: any) => issue.kind);
    const malformed = issueKinds.includes("malformed-choice-list") || (parseError ? /malformed|choice/i.test(parseError) : false);
    results.push({ file, throws: Boolean(parseError), message: parseError ?? null, issues, malformed });
  }
  return results;
}

function writePhenxOriginalReportToMarkdown(rows: any[]): void {
  const reportPath = path.join(RESULTS_DIR, "PHENX_ORIGINAL.md");
  const content = rows.length === 0
    ? "No original PhenX fixtures were found in resources/PhenX_original/.\n"
    : [
        "# Original PhenX validation notes",
        "",
        ...rows.map((entry) => [
          `## ${entry.file}`,
          `- readFormsFromCSV throws: ${entry.throws ? "yes" : "no"}`,
          `- message: ${entry.message ?? "n/a"}`,
          `- issues: ${entry.issues.length > 0 ? entry.issues.map((issue: any) => `${issue.kind}:${issue.sourceVariableName ?? issue.formName ?? ""}`).join(", ") : "none"}`,
          `- malformed-choice-list implicated: ${entry.malformed ? "yes" : "no"}`,
          "",
        ].join("\n")),
      ].join("\n");
  fs.writeFileSync(reportPath, content, "utf8");
}

function main(): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const allIssueRows: any[] = [];
  for (const group of [
    { name: "NIEHS", dir: path.resolve(process.cwd(), "resources", "NIEHS") },
    { name: "PhenX", dir: path.resolve(process.cwd(), "resources", "PhenX") },
    { name: "RareLink", dir: path.resolve(process.cwd(), "resources", "RareLink") },
    { name: "SpyCATS", dir: path.resolve(process.cwd(), "resources", "SpyCATS") },
    { name: "test_data", dir: path.resolve(process.cwd(), "resources", "test_data") },
  ]) {
    for (const entry of fs.readdirSync(group.dir).filter((candidate) => candidate.toLowerCase().endsWith(".csv")).sort()) {
      const filePath = path.join(group.dir, entry);
      allIssueRows.push(...buildIssueRowsForFile(filePath, group.name));
    }
  }
  writeIssueCsv(allIssueRows);
  const sampleRows = sampleStratified(allIssueRows, SAMPLE_PER_STRATUM, SAMPLE_SEED);
  writeSampleCsv(sampleRows);

  const recallSummary = runRecallCheck();
  writeRecallSummary(recallSummary);
  writePhenxOriginalReportToMarkdown(writePhenxOriginalReport());

  const metadata = {
    seed: SAMPLE_SEED,
    samplePerStratum: SAMPLE_PER_STRATUM,
    generatedAt: new Date().toISOString(),
    commit: (() => {
      try {
        return require("node:child_process").execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
      } catch {
        return "unknown";
      }
    })(),
    issueCount: allIssueRows.length,
    sampleCount: sampleRows.length,
  };
  fs.writeFileSync(path.join(RESULTS_DIR, "precision_metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
}

if (require.main === module) main();
