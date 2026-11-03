import * as fs from "node:fs";
import * as path from "node:path";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function formatMs(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(2)} ms`;
}

function formatCount(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return String(value);
}

function escapeCell(value: unknown): string {
  const text = String(value ?? "");
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_No entries._";
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length)));
  const lines: string[] = [];
  const formatRow = (cells: string[]) => `| ${cells.map((cell, index) => cell.padEnd(widths[index], " ")).join(" | ")} |`;
  lines.push(formatRow(headers));
  lines.push(`| ${widths.map((width) => "-".repeat(Math.max(3, width))).join(" | ")} |`);
  for (const row of rows) {
    lines.push(formatRow(row.map((cell) => escapeCell(cell))));
  }
  return lines.join("\n");
}

function renderFieldTypeCoverage(report: any): string {
  const totals = Object.entries(report.summary.fieldTypeCoverage ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (totals.length === 0) return "_No field types captured._";
  return renderTable(["Field Type", "Occurrences"], totals.map(([type, count]) => [type, String(count)]));
}

export function renderEvaluationMarkdown(report: any): string {
  const groups = Object.entries(report.groups ?? {});
  const nonPhenX = (report.perFile ?? []).filter((entry: any) => entry.group !== "PhenX");
  const phenXFiles = (report.perFile ?? []).filter((entry: any) => entry.group === "PhenX");
  const largest = [...phenXFiles].sort((a: any, b: any) => ((b.questionCount ?? b.package?.questionCount ?? 0) - (a.questionCount ?? a.package?.questionCount ?? 0))).slice(0, 5);
  const slowest = [...phenXFiles].sort((a: any, b: any) => ((b.runtime?.median?.total ?? 0) - (a.runtime?.median?.total ?? 0))).slice(0, 5);
  const summaryByGroup = report.summary?.byGroup ?? {};
  const totalSummary = report.summary?.total ?? {};

  const emptyChoiceCounts = Object.entries(report.summary?.emptyChoicesByGroup ?? {}).map(([group, counts]: [string, any]) => [group, String(counts.radio ?? 0), String(counts.dropdown ?? 0), String(counts.checkbox ?? 0)]);
  const lineBreakExamples = (report.summary?.choiceBreakExamples ?? []).map((entry: any) => [entry.file, entry.fieldType, entry.variableName, String(entry.parserRepresentation ?? "").slice(0, 120)]);

  const summaryRows = [
    ["Total files", formatCount(report.summary.totalFiles)],
    ["Successfully parsed", formatCount(report.summary.successfulParses)],
    ["Git commit", report.run?.gitCommit ?? report.environment?.gitCommit ?? "unknown"],
    ["Package version", report.run?.packageVersion ?? report.environment?.packageVersion ?? "unknown"],
    ["Oracle row count matches", report.summary.oracleRowCountMatches ? "yes" : "no"],
    ["Oracle form count matches", report.summary.oracleFormCountMatches ? "yes" : "no"],
    ["Oracle type histogram matches", report.summary.oracleFieldTypeHistogramMatches ? "yes" : "no"],
    ["Round-trip model equality", report.summary.roundTripModelEqual ? "yes" : "no"],
    ["Original → export (string)", report.summary.originalToExportTextEqual ? "yes" : "no"],
    ["Original → export (cell values)", report.summary.originalToExportParsedCellsEqual ? "yes" : "no"],
    ["Export → re-read → export (string)", report.summary.exportToReExportTextEqual ? "yes" : "no"],
    ["Export → re-read → export (cell values)", report.summary.exportToReExportParsedCellsEqual ? "yes" : "no"],
    ["Round-trip normalization (string)", report.summary.roundTripNormalizedTextEqual ? "yes" : "no"],
    ["Round-trip normalization (cell values)", report.summary.roundTripParsedCellsEqual ? "yes" : "no"],
  ];

  const groupSummary = groups.map(([group, stats]: [string, any]) => [
    group,
    String(stats.found),
    String(stats.expected),
    String(stats.fileCountWithSuccessfulParse ?? 0),
    String(stats.validationIssueCount ?? 0),
    formatMs(stats.runtime?.total?.median),
  ]);

  const sourceSummaryRows = Object.entries(summaryByGroup).map(([source, stats]: [string, any]) => [
    source,
    String(stats.files ?? 0),
    String(stats.forms ?? 0),
    String(stats.fields ?? 0),
    String(stats.countsAgree ?? 0),
    String(stats.modelStable ?? 0),
    String(stats.exportReExportIdentical ?? 0),
    String(stats.sourceCellsEqual ?? 0),
    `${stats.issuesBySeverity?.error ?? 0} / ${stats.issuesBySeverity?.warning ?? 0}`,
  ]);

  const totalSummaryRow = [
    "Total",
    String(totalSummary.files ?? 0),
    String(totalSummary.forms ?? 0),
    String(totalSummary.fields ?? 0),
    String(totalSummary.countsAgree ?? 0),
    String(totalSummary.modelStable ?? 0),
    String(totalSummary.exportReExportIdentical ?? 0),
    String(totalSummary.sourceCellsEqual ?? 0),
    `${totalSummary.issuesBySeverity?.error ?? 0} / ${totalSummary.issuesBySeverity?.warning ?? 0}`,
  ];

  const detailRows = nonPhenX.map((entry: any) => [
    entry.file,
    String(entry.formCount ?? entry.package?.formCount ?? 0),
    String(entry.questionCount ?? entry.package?.questionCount ?? 0),
    String(entry.validation?.totalIssues ?? 0),
    Object.entries(entry.validation?.issuesByKind ?? {}).map(([kind, value]) => `${kind}:${value}`).join(", ") || "-",
    formatMs(entry.runtime?.median?.total),
    entry.roundTrip?.modelEqual ? "equal" : "different",
    entry.roundTrip?.originalToExportTextEqual ? "equal" : "different",
    entry.roundTrip?.originalToExportParsedCellsEqual ? "equal" : "different",
    entry.roundTrip?.exportToReExportTextEqual ? "equal" : "different",
    entry.roundTrip?.exportToReExportParsedCellsEqual ? "equal" : "different",
  ]);

  const headerResolutionNotes = (report.perFile ?? []).slice(0, 10).map((entry: any) => {
    const header = entry.oracle?.headerResolution ?? {};
    return `- ${entry.file}: firstHeader=${header.firstHeaderCell ?? ""}; variableNameByHeader=${header.variableNameByHeader ?? false}; formNameByHeader=${header.formNameByHeader ?? false}; fieldTypeByHeader=${header.fieldTypeByHeader ?? false}`;
  }).join("\n");

  const deviationEntries = (report.deviations ?? []).slice(0, 10);
  const deviationGroups = Object.entries((report.deviations ?? []).reduce((groups: Record<string, number>, item: any) => {
    const key = String(item.group ?? "unknown");
    groups[key] = (groups[key] ?? 0) + 1;
    return groups;
  }, {}));

  const markdown = `# Evaluation Report

## 1. Runtime environment and data basis

- Runtime: ${report.run.generatedAt}
- Container: Docker container; runtime numbers here are not comparable with earlier host runs.
- Node version: ${report.environment.nodeVersion}
- Platform: ${report.environment.platform} / ${report.environment.release}
- CPU: ${report.environment.cpuModel} (${report.environment.cpuCount} cores)
- Memory: ${report.environment.totalMemoryGb} GB
- Package version: ${report.environment.packageVersion}
- Git commit: ${report.environment.gitCommit ?? report.run?.gitCommit ?? "unknown"}
- papaparse version: ${report.environment.papaparseVersion}
- EVAL_RUNS: ${report.environment.evalRuns}
- Download script: ${report.environment.downloadScript}
- Git status: ${report.environment.gitStatus || "clean"}
- Git dirty: ${report.environment.gitDirty ? "yes" : "no"}

### Expected and observed file counts

${renderTable(["Group", "Expected", "Found", "Status"], groups.map(([group, stats]: [string, any]) => [group, String(stats.expected), String(stats.found), stats.found === stats.expected ? "matches" : "mismatch"]))}

## 2. Overall result

${renderTable(["Metric", "Value"], summaryRows)}

## 3. Group summary table

${renderTable(["Source", "Files", "Forms", "Fields", "Counts agree", "Model stable", "Re-export identical", "Source cells equal", "Issues (E / W)"], [...sourceSummaryRows, totalSummaryRow])}

## 4. Group overview

${renderTable(["Group", "Files", "Expected", "Successfully parsed", "Validation issues", "Median runtime"], groupSummary)}

## 5. Individual files except PhenX

${renderTable(["File", "Forms", "Questions", "Validation issues", "Issue categories", "Median total runtime", "Round-trip model", "Original → export (string)", "Original → export (cells)", "Export → re-read → export (string)", "Export → re-read → export (cells)"], detailRows)}

## 6. PhenX aggregates and anomalies

### Aggregate

${renderTable(["Group", "Files", "Forms", "Questions", "Median total runtime", "Min total runtime", "Max total runtime", "Total runtime"], [["PhenX", String(phenXFiles.length), String(phenXFiles.reduce((sum: number, file: any) => sum + (file.formCount ?? 0), 0)), String(phenXFiles.reduce((sum: number, file: any) => sum + (file.questionCount ?? 0), 0)), formatMs(phenXFiles.reduce((sum: number, file: any) => sum + (file.runtime?.median?.total ?? 0), 0) / Math.max(1, phenXFiles.length)), formatMs(Math.min(...phenXFiles.map((file: any) => file.runtime?.median?.total ?? 0))), formatMs(Math.max(...phenXFiles.map((file: any) => file.runtime?.median?.total ?? 0))), formatMs(phenXFiles.reduce((sum: number, file: any) => sum + (file.runtime?.median?.total ?? 0), 0))]])}

### Largest 5 PhenX files by question count

${renderTable(["File", "Questions", "Forms", "Median total runtime"], largest.map((entry: any) => [entry.file, String(entry.questionCount ?? 0), String(entry.formCount ?? 0), formatMs(entry.runtime?.median?.total)]))}

### 5 slowest PhenX files

${renderTable(["File", "Median total runtime", "Questions", "Forms"], slowest.map((entry: any) => [entry.file, formatMs(entry.runtime?.median?.total), String(entry.questionCount ?? 0), String(entry.formCount ?? 0)]))}

## 7. Empty choices by field type and group

${renderTable(["Group", "Radio empty", "Dropdown empty", "Checkbox empty"], emptyChoiceCounts.length === 0 ? [] : emptyChoiceCounts.map(([group, radio, dropdown, checkbox]) => [group, radio, dropdown, checkbox]))}

## 8. Choice cells containing line breaks

${lineBreakExamples.length === 0 ? "_No choice cells with embedded line breaks were found._" : renderTable(["File", "Field type", "Variable", "Parser representation"], lineBreakExamples.map(([file, fieldType, variableName, parserRepresentation]) => [file, fieldType, variableName, parserRepresentation]))}

## 9. Field type coverage

${renderFieldTypeCoverage(report)}

## 10. Deviations and errors

${deviationGroups.length === 0 ? "_No deviations or exceptions detected._" : renderTable(["Group", "Deviation count"], deviationGroups.map(([group, count]) => [group, String(count)]))}

${deviationEntries.length === 0 ? "_No individual deviations._" : deviationEntries.map((item: any) => `- ${item.file}: ${item.reason}`).join("\n")}

## 11. Header resolution notes

${headerResolutionNotes || "_No per-file header notes._"}

## 12. Limits of the evaluation

- No import of the written CSV into a REDCap instance; REDCap compatibility of the output is not checked.
- No comparison with other tools.
- Validator accuracy was not manually verified.
- Only public CSV files plus the locally authored test dictionary were evaluated.
- Runtime figures come from a machine without targeted GC control.
- Round-trip checks consistency within the package and not substantive correctness against REDCap.

## 13. Supporting findings from the run

- The run used the public files documented in DATA.md and the repository-local test dictionary.
- All individual values in the JSON file come from the current run and were not extrapolated.
`;

  return markdown;
}

export function writeMarkdownReport(report: any, outputPath: string): void {
  const markdown = renderEvaluationMarkdown(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, "utf8");
}

export function readJsonReport(inputPath: string): any {
  return JSON.parse(fs.readFileSync(inputPath, "utf8"));
}

if (require.main === module) {
  const inputPath = process.argv[2] ?? path.resolve(process.cwd(), "evaluation", "results", "evaluation.json");
  const outputPath = process.argv[3] ?? path.resolve(process.cwd(), "evaluation", "results", "EVALUATION.md");
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input JSON not found: ${inputPath}`);
  }
  const report = readJsonReport(inputPath);
  writeMarkdownReport(report, outputPath);
  console.log(`Wrote markdown report to ${outputPath}`);
}
