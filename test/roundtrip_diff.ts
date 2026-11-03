import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import Papa from "papaparse";

const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")).version as string;

import { DataDictCSVParser } from "../src";
import { compareCsvOrder, type OrderComparison } from "./roundtrip_order";

const DEFAULT_ALLOW_LIST = ["equal_after_trim", "line_breaks", "choice_spacing"] as const;
const DIFF_CLASSES = [
  "equal_after_trim",
  "whitespace_internal",
  "line_breaks",
  "choice_spacing",
  "case_only",
  "numeric_format",
  "html_entity",
  "value_lost",
  "value_added",
  "other",
] as const;

type DiffClass = (typeof DIFF_CLASSES)[number];

type ExamplePair = {
  file: string;
  variable: string;
  source: string;
  written: string;
};

type ColumnClassAggregates = {
  count: number;
  filesAffected: Set<string>;
  examples: ExamplePair[];
};

type FileDiff = {
  file: string;
  group: string;
  variable: string;
  column: string;
  className: DiffClass;
  source: string;
  written: string;
};

type FileSummary = OrderComparison & {
  file: string;
  group: string;
  differingCells: number;
  classes: string[];
  cellDifferencesAllowed: boolean;
  equivalentUnderAllowList: boolean;
};

const groupDirectories = [
  { name: "NIEHS", dir: path.resolve(process.cwd(), "resources", "NIEHS") },
  { name: "PhenX", dir: path.resolve(process.cwd(), "resources", "PhenX") },
  { name: "RareLink", dir: path.resolve(process.cwd(), "resources", "RareLink") },
  { name: "SpyCATS", dir: path.resolve(process.cwd(), "resources", "SpyCATS") },
  { name: "test_data", dir: path.resolve(process.cwd(), "resources", "test_data") },
];

function normalizeHeader(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function findHeaderIndex(headers: string[], wanted: string): number {
  const target = normalizeHeader(wanted);
  const index = headers.findIndex((header) => normalizeHeader(header).includes(target));
  return index >= 0 ? index : -1;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeChoiceSpacing(value: string): string {
  return value.replace(/\s*([,|])\s*/g, "$1").trim();
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function decodeHtmlEntities(value: string): string {
  const replacements: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x27;": "'",
    "&#x2F;": "/",
  };
  let text = value;
  for (const [entity, replacement] of Object.entries(replacements)) {
    text = text.replace(new RegExp(entity, "gi"), replacement);
  }
  return text;
}

function parseNumeric(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyDiff(source: string, written: string): DiffClass {
  if (source.trim() === written.trim()) return "equal_after_trim";
  if (collapseWhitespace(source) === collapseWhitespace(written)) return "whitespace_internal";
  if (normalizeLineBreaks(source) === normalizeLineBreaks(written)) return "line_breaks";
  if (normalizeChoiceSpacing(source) === normalizeChoiceSpacing(written)) return "choice_spacing";
  if (source.toLowerCase() === written.toLowerCase()) return "case_only";
  const sourceNumber = parseNumeric(source);
  const writtenNumber = parseNumeric(written);
  if (sourceNumber !== null && writtenNumber !== null && sourceNumber === writtenNumber) return "numeric_format";
  if (decodeHtmlEntities(source) === decodeHtmlEntities(written)) return "html_entity";
  if (source !== "" && written === "") return "value_lost";
  if (source === "" && written !== "") return "value_added";
  return "other";
}

function readAllowList(): string[] {
  const defaultList = [...DEFAULT_ALLOW_LIST];
  const allowListPath = path.resolve(process.cwd(), "evaluation", "roundtrip_equivalence.json");
  if (!fs.existsSync(allowListPath)) {
    return defaultList;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(allowListPath, "utf8"));
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed as string[];
    }
  } catch {
    // keep default list quietly
  }
  return defaultList;
}

function getCommitHash(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function parseCsvRows(csvText: string): { headers: string[]; rows: string[][] } {
  const parsed = Papa.parse<string[]>(csvText, {
    delimiter: ",",
    skipEmptyLines: false,
    quoteChar: '"',
  });
  const rows = (parsed.data ?? []) as string[][];
  const headers = rows.length > 0 ? rows[0].map((header) => String(header ?? "")) : [];
  return { headers, rows };
}

function rowsToHeaderMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    if (!map.has(normalized)) {
      map.set(normalized, header);
    }
  }
  return map;
}

function buildVariableMap(rows: string[][], variableIndex: number): Map<string, Record<string, string>> {
  const result = new Map<string, Record<string, string>>();
  const headers = rows[0] ?? [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const variableName = String(row[variableIndex] ?? "").trim();
    if (!variableName) continue;
    const rowObject: Record<string, string> = {};
    for (let colIndex = 0; colIndex < headers.length; colIndex += 1) {
      rowObject[headers[colIndex] ?? `__col_${colIndex}`] = String(row[colIndex] ?? "");
    }
    result.set(variableName, rowObject);
  }
  return result;
}

function collectFileDiffs(filePath: string, group: string, allowList: string[]): { diffs: FileDiff[]; order: OrderComparison; cellDifferencesAllowed: boolean; equivalentUnderAllowList: boolean; diffClasses: Set<string> } {
  const rawText = fs.readFileSync(filePath, "utf8");
  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(rawText);
  const writtenText = parser.writeFormsToCSV(forms);
  const order = compareCsvOrder(rawText, writtenText);
  const sourceCsv = parseCsvRows(rawText);
  const writtenCsv = parseCsvRows(writtenText);

  const sourceHeaders = sourceCsv.headers;
  const writtenHeaders = writtenCsv.headers;
  const sourceHeaderMap = rowsToHeaderMap(sourceHeaders);
  const writtenHeaderMap = rowsToHeaderMap(writtenHeaders);
  const allHeaderNames = [...new Set([...sourceHeaderMap.keys(), ...writtenHeaderMap.keys()])];

  const sourceVariableIndex = findHeaderIndex(sourceHeaders, "Variable / Field Name");
  const writtenVariableIndex = findHeaderIndex(writtenHeaders, "Variable / Field Name");
  const sourceRows = sourceVariableIndex >= 0 ? buildVariableMap(sourceCsv.rows, sourceVariableIndex) : new Map();
  const writtenRows = writtenVariableIndex >= 0 ? buildVariableMap(writtenCsv.rows, writtenVariableIndex) : new Map();

  const diffs: FileDiff[] = [];
  const diffClasses = new Set<string>();
  const allVariables = new Set([...sourceRows.keys(), ...writtenRows.keys()]);

  for (const variable of allVariables) {
    const sourceRow = sourceRows.get(variable);
    const writtenRow = writtenRows.get(variable);
    if (!sourceRow || !writtenRow) continue;
    for (const canonicalHeader of allHeaderNames) {
      const sourceActualHeader = sourceHeaderMap.get(canonicalHeader) ?? canonicalHeader;
      const writtenActualHeader = writtenHeaderMap.get(canonicalHeader) ?? canonicalHeader;
      const sourceValue = String(sourceRow[sourceActualHeader] ?? "");
      const writtenValue = String(writtenRow[writtenActualHeader] ?? "");
      if (sourceValue === writtenValue) continue;
      const className = classifyDiff(sourceValue, writtenValue);
      diffClasses.add(className);
      diffs.push({
        file: path.relative(process.cwd(), filePath),
        group,
        variable,
        column: sourceActualHeader || writtenActualHeader || canonicalHeader,
        className,
        source: sourceValue,
        written: writtenValue,
      });
    }
  }

  const cellDifferencesAllowed = [...allVariables].every((variable) => sourceRows.has(variable) && writtenRows.has(variable))
    && diffs.every((diff) => allowList.includes(diff.className));
  const equivalentUnderAllowList = cellDifferencesAllowed && order.fieldOrderIdentical
    && order.formOrderIdentical && order.sectionHeaderPositionsIdentical && order.rowStructureIdentical;
  return { diffs, order, cellDifferencesAllowed, equivalentUnderAllowList, diffClasses };
}

function addExample(summary: ColumnClassAggregates, file: string, variable: string, source: string, written: string): void {
  if (summary.examples.length < 5) {
    summary.examples.push({ file, variable, source, written });
  }
}

function main(): void {
  const allowList = readAllowList();
  const commitHash = getCommitHash();
  const gitDirty = (() => {
    try {
      return execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf8" }).trim().length > 0 || process.env.ALLOW_DIRTY === "1";
    } catch {
      return process.env.ALLOW_DIRTY === "1";
    }
  })();
  console.log(`Git commit: ${commitHash}`);
  console.log(`Package version: ${PACKAGE_VERSION}`);
  console.log("Published npm version must equal package.json version before the numbers are used in the paper.");
  const outputDir = path.resolve(process.cwd(), "evaluation", "results");
  fs.mkdirSync(outputDir, { recursive: true });

  const allDiffs: FileDiff[] = [];
  const byColumn = new Map<string, Map<DiffClass, ColumnClassAggregates>>();
  const byGroup = new Map<string, Map<string, Map<DiffClass, ColumnClassAggregates>>>();
  const fileSummaries: FileSummary[] = [];

  for (const group of groupDirectories) {
    const files = fs.readdirSync(group.dir)
      .filter((entry) => entry.toLowerCase().endsWith(".csv"))
      .sort();

    const groupByColumn = new Map<string, Map<DiffClass, ColumnClassAggregates>>();
    for (const fileName of files) {
      const filePath = path.join(group.dir, fileName);
      const { diffs, order, cellDifferencesAllowed, equivalentUnderAllowList, diffClasses } = collectFileDiffs(filePath, group.name, allowList);
      const relativeFile = path.relative(process.cwd(), filePath);
      fileSummaries.push({
        file: relativeFile,
        group: group.name,
        differingCells: diffs.length,
        classes: [...diffClasses],
        ...order,
        cellDifferencesAllowed,
        equivalentUnderAllowList,
      });
      allDiffs.push(...diffs);

      for (const diff of diffs) {
        if (!byColumn.has(diff.column)) byColumn.set(diff.column, new Map());
        const columnMap = byColumn.get(diff.column)!;
        if (!columnMap.has(diff.className)) {
          columnMap.set(diff.className, { count: 0, filesAffected: new Set<string>(), examples: [] });
        }
        const summary = columnMap.get(diff.className)!;
        summary.count += 1;
        const fileLabel = path.relative(process.cwd(), filePath);
        summary.filesAffected.add(fileLabel);
        addExample(summary, fileLabel, diff.variable, diff.source, diff.written);

        if (!groupByColumn.has(diff.column)) groupByColumn.set(diff.column, new Map());
        const groupColumnMap = groupByColumn.get(diff.column)!;
        if (!groupColumnMap.has(diff.className)) {
          groupColumnMap.set(diff.className, { count: 0, filesAffected: new Set<string>(), examples: [] });
        }
        const groupSummary = groupColumnMap.get(diff.className)!;
        groupSummary.count += 1;
        groupSummary.filesAffected.add(path.relative(process.cwd(), filePath));
        addExample(groupSummary, path.relative(process.cwd(), filePath), diff.variable, diff.source, diff.written);
      }
    }
    byGroup.set(group.name, groupByColumn);
  }

  const orderedColumns = [...byColumn.keys()].sort((left, right) => left.localeCompare(right));
  const orderedClasses = [...DIFF_CLASSES];

  const columnCountsJson = Object.fromEntries(
    orderedColumns.map((column) => {
      const perClass: Record<string, unknown> = {};
      for (const className of orderedClasses) {
        const summary = byColumn.get(column)?.get(className as DiffClass) ?? { count: 0, filesAffected: new Set<string>(), examples: [] };
        perClass[className] = {
          count: summary.count,
          filesAffected: summary.filesAffected.size,
          examples: summary.examples.slice(0, 5),
        };
      }
      return [column, perClass];
    }),
  );

  const byGroupJson: Record<string, unknown> = {};
  for (const [groupName, groupValue] of byGroup.entries()) {
    const groupColumns: Record<string, unknown> = {};
    for (const column of [...groupValue.keys()].sort()) {
      const perClass: Record<string, unknown> = {};
      for (const className of orderedClasses) {
        const summary = groupValue.get(column)?.get(className as DiffClass) ?? { count: 0, filesAffected: new Set<string>(), examples: [] };
        perClass[className] = {
          count: summary.count,
          filesAffected: summary.filesAffected.size,
          examples: summary.examples.slice(0, 5),
        };
      }
      groupColumns[column] = perClass;
    }
    byGroupJson[groupName] = groupColumns;
  }

  const equivalentFiles = fileSummaries.filter((entry) => entry.equivalentUnderAllowList).map((entry) => entry.file);
  const groupOrderSummary = Object.fromEntries(groupDirectories.map((group) => {
    const files = fileSummaries.filter((entry) => entry.group === group.name);
    return [group.name, {
      files: files.length,
      filesWithChangedFieldOrder: files.filter((entry) => !entry.fieldOrderIdentical).length,
      movedFields: files.reduce((sum, entry) => sum + entry.movedFieldCount, 0),
      filesWithChangedFormOrder: files.filter((entry) => !entry.formOrderIdentical).length,
      filesWithChangedSectionHeaderPositions: files.filter((entry) => !entry.sectionHeaderPositionsIdentical).length,
      filesWithAllowedCellDifferences: files.filter((entry) => entry.cellDifferencesAllowed).length,
      filesWithMatchingRowStructure: files.filter((entry) => entry.rowStructureIdentical).length,
      filesEquivalentUnderAllowList: files.filter((entry) => entry.equivalentUnderAllowList).length,
    }];
  }));

  const summary = {
    totalFilesScanned: fileSummaries.length,
    totalDifferingCells: allDiffs.length,
    filesWithDifferences: fileSummaries.filter((entry) => entry.differingCells > 0).length,
    filesEquivalentUnderAllowList: equivalentFiles.length,
    filesWithChangedFieldOrder: fileSummaries.filter((entry) => !entry.fieldOrderIdentical).length,
    movedFields: fileSummaries.reduce((sum, entry) => sum + entry.movedFieldCount, 0),
    filesWithChangedFormOrder: fileSummaries.filter((entry) => !entry.formOrderIdentical).length,
    filesWithChangedSectionHeaderPositions: fileSummaries.filter((entry) => !entry.sectionHeaderPositionsIdentical).length,
    filesWithAllowedCellDifferences: fileSummaries.filter((entry) => entry.cellDifferencesAllowed).length,
    filesWithMatchingRowStructure: fileSummaries.filter((entry) => entry.rowStructureIdentical).length,
    allowList,
    commitHash,
    packageVersion: PACKAGE_VERSION,
    gitDirty,
    environment: { container: "Docker", nodeVersion: process.version, cpuModel: os.cpus()[0]?.model ?? "unknown", cpuCount: os.cpus().length, memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)) },
  };

  const jsonOutput = {
    commitHash,
    allowList,
    summary,
    byColumn: columnCountsJson,
    byGroup: byGroupJson,
    groupOrderSummary,
    filesEquivalentUnderAllowList: equivalentFiles,
    filesWithOnlyAllowedDifferences: fileSummaries.filter((entry) => entry.cellDifferencesAllowed).map((entry) => entry.file),
    files: fileSummaries,
  };

  const markdownLines: string[] = [
    "# Round-trip diff analysis",
    "",
    `- Commit hash: ${commitHash}`,
    `- Package version: ${PACKAGE_VERSION}`,
    `- Environment: Docker container; Node ${process.version}; CPU ${os.cpus()[0]?.model ?? "unknown"} (${os.cpus().length} CPUs); memory ${(os.totalmem() / 1024 ** 3).toFixed(2)} GiB visible. Runtime numbers from this container are not comparable with earlier host runs.`,
    `- Dirty working tree: ${gitDirty ? "yes" : "no"}`,
    `- Allow-list used: ${JSON.stringify(allowList)}`,
    `- Files scanned: ${summary.totalFilesScanned}`,
    `- Files with cell-value differences (matched by variable): ${summary.filesWithDifferences}`,
    `- Total differing cells: ${summary.totalDifferingCells}`,
    `- Files equivalent under allow-list: ${summary.filesEquivalentUnderAllowList}`,
    `- Files with identical field order: ${summary.totalFilesScanned - summary.filesWithChangedFieldOrder}`,
    `- Fields at different positions: ${summary.movedFields}`,
    `- Files with identical form order: ${summary.totalFilesScanned - summary.filesWithChangedFormOrder}`,
    `- Files with identical Section Header positions: ${summary.totalFilesScanned - summary.filesWithChangedSectionHeaderPositions}`,
    `- Files with only allowed cell differences (matched by variable): ${summary.filesWithAllowedCellDifferences}`,
    `- Files with matching row/column structure: ${summary.filesWithMatchingRowStructure}`,
    "",
    "## Order and equivalence by group",
    "",
    "Group | Files | Field order changed | Fields at different positions | Form order changed | Header positions changed | Allowed cells | Matching structure | Equivalent",
    "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...Object.entries(groupOrderSummary).map(([name, counts]) => {
      const group = counts as (typeof groupOrderSummary)[string];
      return `${name} | ${group.files} | ${group.filesWithChangedFieldOrder} | ${group.movedFields} | ${group.filesWithChangedFormOrder} | ${group.filesWithChangedSectionHeaderPositions} | ${group.filesWithAllowedCellDifferences} | ${group.filesWithMatchingRowStructure} | ${group.filesEquivalentUnderAllowList}`;
    }),
    "",
    "## Files with order or structure differences",
    "",
    ...fileSummaries.filter((entry) => !entry.fieldOrderIdentical || !entry.formOrderIdentical
      || !entry.sectionHeaderPositionsIdentical || !entry.rowStructureIdentical).map((entry) =>
      `- ${entry.file}: moved fields=${entry.movedFieldCount}, first differing position=${entry.firstDifferentPosition ?? "none"}, examples=${JSON.stringify(entry.movedFields.slice(0, 5))}; form order=${entry.formOrderIdentical ? "equal" : "changed"} (${JSON.stringify(entry.sourceForms)} → ${JSON.stringify(entry.writtenForms)}); Section Header positions=${entry.sectionHeaderPositionsIdentical ? "equal" : "changed"} (${JSON.stringify(entry.sourceSectionHeaderPositions)} → ${JSON.stringify(entry.writtenSectionHeaderPositions)}); row/column structure=${entry.rowStructureIdentical ? "equal" : "changed"}`),
    "",
    "## Summary by class",
    "",
  ];

  const classSummaryRows = orderedClasses.map((className) => {
    const totalCount = orderedColumns.reduce((sum, column) => sum + (byColumn.get(column)?.get(className as DiffClass)?.count ?? 0), 0);
    const filesAffected = new Set<string>();
    for (const column of orderedColumns) {
      const summary = byColumn.get(column)?.get(className as DiffClass);
      if (summary) {
        for (const file of summary.filesAffected) filesAffected.add(file);
      }
    }
    return [className, String(totalCount), String(filesAffected.size)];
  });

  markdownLines.push(
    ["Class", "Differing cells", "Files affected"].join(" | "),
    ["---", "---", "---"].join(" | "),
    ...classSummaryRows.map((row) => row.join(" | ")),
    "",
    "## Summary by column and class",
    "",
  );

  for (const column of orderedColumns) {
    const rows = orderedClasses.map((className) => {
      const summary = byColumn.get(column)?.get(className as DiffClass) ?? { count: 0, filesAffected: new Set<string>(), examples: [] };
      return [className, String(summary.count), String(summary.filesAffected.size)];
    });
    markdownLines.push(`### ${column}`);
    markdownLines.push(["Class", "Count", "Files affected"].join(" | "));
    markdownLines.push(["---", "---", "---"].join(" | "));
    markdownLines.push(...rows.map((row) => row.join(" | ")));
    markdownLines.push("");
  }

  markdownLines.push("## Files equivalent under allow-list");
  markdownLines.push("");
  if (equivalentFiles.length === 0) {
    markdownLines.push("_No files are equivalent under the configured allow-list._");
  } else {
    markdownLines.push(...equivalentFiles.map((entry) => `- ${entry}`));
  }
  markdownLines.push("");

  markdownLines.push("## Example pairs by column and class");
  markdownLines.push("");
  for (const column of orderedColumns) {
    for (const className of orderedClasses) {
      const summary = byColumn.get(column)?.get(className as DiffClass);
      if (!summary || summary.examples.length === 0) continue;
      markdownLines.push(`### ${column} / ${className}`);
      for (const example of summary.examples) {
        markdownLines.push(`- ${example.file} | variable=${example.variable} | source=${JSON.stringify(example.source)} | written=${JSON.stringify(example.written)}`);
      }
      markdownLines.push("");
    }
  }

  fs.writeFileSync(path.join(outputDir, "roundtrip_diff.json"), JSON.stringify(jsonOutput, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(outputDir, "ROUNDTRIP_DIFF.md"), markdownLines.join("\n") + "\n", "utf8");
}

main();
