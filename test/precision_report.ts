import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Papa from "papaparse";

const RESULTS_DIR = path.resolve(process.cwd(), "evaluation", "results");
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")).version as string;
const SAMPLE_PATH = path.join(RESULTS_DIR, "precision_sample.csv");
const ISSUE_PATH = path.join(RESULTS_DIR, "issues.csv");
const RECALL_PATH = path.join(RESULTS_DIR, "precision_recall.json");
const PHENX_PATH = path.join(RESULTS_DIR, "PHENX_ORIGINAL.md");
const METADATA_PATH = path.join(RESULTS_DIR, "precision_metadata.json");

function parseCsvFile(filePath: string): any[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse<any[]>(raw, { header: true, skipEmptyLines: true });
  return (parsed.data ?? []) as any[];
}

function wilsonInterval(successes: number, total: number): { lower: number; upper: number; p: number } {
  if (total <= 0) return { lower: 0, upper: 0, p: 0 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total));
  return {
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
    p,
  };
}

function clampPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value * 100));
}

function formatPercent(value: number | null | undefined): string {
  const clamped = clampPercent(value);
  if (clamped === null) return "n/a";
  return `${clamped.toFixed(1)}%`;
}

function formatPrecisionState(tp: number, fp: number): { precision: string; lower: string; upper: string } {
  const totalClear = tp + fp;
  if (totalClear <= 0) return { precision: "n/a", lower: "n/a", upper: "n/a" };
  const precision = tp / totalClear;
  const interval = wilsonInterval(tp, totalClear);
  return {
    precision: formatPercent(precision),
    lower: formatPercent(interval.lower),
    upper: formatPercent(interval.upper),
  };
}

function buildTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_No entries._";
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length)));
  const formatRow = (cells: string[]) => `| ${cells.map((cell, index) => String(cell).padEnd(widths[index], " ")).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(Math.max(3, width))).join(" | ")} |`;
  return [formatRow(headers), separator, ...rows.map((row) => formatRow(row))].join("\n");
}

function computeAgreement(sampleRows: any[]): { agreement: number; total: number; matching: number } {
  let matching = 0;
  let total = 0;
  for (const row of sampleRows) {
    const label = String(row.label ?? "").trim().toUpperCase();
    const auto = String(row.auto_label ?? "").trim();
    if (!label || label === "UNCLEAR" || label === "UNLABELLED") continue;
    total += 1;
    const autoPositive = auto === "";
    const manualPositive = label === "TP";
    if (autoPositive === manualPositive) matching += 1;
  }
  return { agreement: total > 0 ? matching / total : 0, total, matching };
}

function computeCohenKappa(sampleRows: any[]): { kappa: number | null; total: number } {
  const labels = sampleRows.filter((row) => {
    const a = String(row.label ?? "").trim();
    const b = String(row.label_2 ?? "").trim();
    return a !== "" && b !== "";
  });
  if (labels.length < 10) return { kappa: null, total: labels.length };

  const categories = ["TP", "FP", "unclear"] as const;
  const counts = new Map<string, number>();
  const counts1 = new Map<string, number>();
  const counts2 = new Map<string, number>();

  for (const row of labels) {
    const a = String(row.label).trim().toUpperCase();
    const b = String(row.label_2).trim().toUpperCase();
    const aa = a === "TP" ? "TP" : a === "FP" ? "FP" : "unclear";
    const bb = b === "TP" ? "TP" : b === "FP" ? "FP" : "unclear";
    counts.set(`${aa}|${bb}`, (counts.get(`${aa}|${bb}`) ?? 0) + 1);
    counts1.set(aa, (counts1.get(aa) ?? 0) + 1);
    counts2.set(bb, (counts2.get(bb) ?? 0) + 1);
  }

  const total = labels.length;
  const observed = categories.reduce((sum, category) => sum + (counts.get(`${category}|${category}`) ?? 0), 0) / total;
  const expected = categories.reduce((sum, category) => {
    const p1 = (counts1.get(category) ?? 0) / total;
    const p2 = (counts2.get(category) ?? 0) / total;
    return sum + (p1 * p2);
  }, 0);

  const kappa = expected < 1 ? (observed - expected) / (1 - expected) : 0;
  return { kappa, total };
}

function readIssuesByStratum(): Map<string, number> {
  const rows = parseCsvFile(ISSUE_PATH);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.kind}|${row.group}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function countDanglingCaseMismatches(issues: Array<{ kind?: string; group?: string; case_mismatch_of?: string }>): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(["NIEHS", "PhenX", "RareLink", "SpyCATS", "test_data"].map((group) => [group, 0]));
  for (const issue of issues) {
    if (issue.kind === "dangling-reference" && String(issue.case_mismatch_of ?? "").trim()) {
      counts[String(issue.group ?? "unknown")] = (counts[String(issue.group ?? "unknown")] ?? 0) + 1;
    }
  }
  return counts;
}

export function formatRecallStats(kind: string, result: { total?: number; distinctMutants?: number; detected?: number; undetected?: any[] }): string[] {
  const total = Number(result.total ?? 0);
  const detected = Number(result.detected ?? 0);
  const distinct = Number(result.distinctMutants ?? total);
  const interval = distinct >= 10 && total > 0 ? wilsonInterval(detected, total) : null;
  return [
    kind, String(total), String(distinct), String(detected),
    interval ? formatPercent(detected / total) : total > 0 && detected === total ? `all ${total} detected` : "n/a",
    interval ? formatPercent(interval.lower) : "n/a",
    interval ? formatPercent(interval.upper) : "n/a",
    (result.undetected ?? []).length > 0 ? (result.undetected ?? []).map((item: any) => `${item.baseFile ?? "unknown file"}: ${item.mutationApplied ?? item.target ?? "unknown"}`).join("; ") : "-",
  ];
}

function main(): void {
  const gitCommit = (() => {
    try {
      return require("node:child_process").execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })();
  const gitDirty = (() => {
    try {
      return require("node:child_process").execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf8" }).trim().length > 0 || process.env.ALLOW_DIRTY === "1";
    } catch {
      return process.env.ALLOW_DIRTY === "1";
    }
  })();
  console.log(`Git commit: ${gitCommit}`);
  console.log(`Package version: ${PACKAGE_VERSION}`);
  console.log("Published npm version must equal package.json version before the numbers are used in the paper.");
  const sampleRows = parseCsvFile(SAMPLE_PATH);
  const issueCounts = readIssuesByStratum();
  const danglingCaseCounts = countDanglingCaseMismatches(parseCsvFile(ISSUE_PATH));
  const metadata = fs.existsSync(METADATA_PATH) ? JSON.parse(fs.readFileSync(METADATA_PATH, "utf8")) : {};
  const gitHead = (() => {
    try {
      return require("node:child_process").execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })();
  const metadataCommit = String(metadata.commit ?? "unknown");
  const metadataGenerated = String(metadata.generatedAt ?? "unknown");
  const warning = metadataCommit !== "unknown" && gitHead !== "unknown" && metadataCommit !== gitHead ? `> Warning: precision metadata was generated from ${metadataCommit}, but current HEAD is ${gitHead}.` : "";
  const dirtyWarning = gitDirty ? `> Warning: working tree is dirty (ALLOW_DIRTY=1).` : "";

  const strata = new Map<string, any[]>();
  for (const row of sampleRows) {
    const key = `${row.kind}|${row.group}`;
    const bucket = strata.get(key) ?? [];
    bucket.push(row);
    strata.set(key, bucket);
  }

  const stratumRows: string[][] = [];
  const perKindRows: string[][] = [];
  const kindMap = new Map<string, { tp: number; fp: number; unclear: number; unlabelled: number; total: number; n_h: number }>();

  for (const [key, bucket] of [...strata.entries()].sort()) {
    const [kind, group] = key.split("|");
    const tp = bucket.filter((row) => String(row.label ?? "").trim().toUpperCase() === "TP").length;
    const fp = bucket.filter((row) => String(row.label ?? "").trim().toUpperCase() === "FP").length;
    const unclear = bucket.filter((row) => String(row.label ?? "").trim().toUpperCase() === "UNCLEAR").length;
    const unlabelled = bucket.filter((row) => String(row.label ?? "").trim() === "").length;
    const totalClear = tp + fp;
    const precision = totalClear > 0 ? tp / totalClear : null;
    const interval = totalClear > 0 ? wilsonInterval(tp, totalClear) : null;
    const nh = issueCounts.get(key) ?? bucket.length;
    const entry = kindMap.get(kind) ?? { tp: 0, fp: 0, unclear: 0, unlabelled: 0, total: 0, n_h: 0 };
    entry.tp += tp;
    entry.fp += fp;
    entry.unclear += unclear;
    entry.unlabelled += unlabelled;
    entry.total += bucket.length;
    entry.n_h += nh;
    kindMap.set(kind, entry);
    const precisionState = totalClear > 0 ? formatPrecisionState(tp, fp) : { precision: "n/a", lower: "n/a", upper: "n/a" };
    stratumRows.push([
      kind,
      group,
      String(nh),
      String(bucket.length),
      String(tp),
      String(fp),
      String(unclear),
      String(unlabelled),
      precisionState.precision,
      precisionState.lower,
      precisionState.upper,
    ]);
  }

  const kinds = ["dangling-reference", "possible-stale-choice-literal"];
  for (const kind of kinds) {
    const stats = kindMap.get(kind) ?? { tp: 0, fp: 0, unclear: 0, unlabelled: 0, total: 0, n_h: 0 };
    const totalClear = stats.tp + stats.fp;
    const pooled = totalClear > 0 ? stats.tp / totalClear : null;
    const pooledInterval = totalClear > 0 ? wilsonInterval(stats.tp, totalClear) : null;
    const weighted = (() => {
      const stratumEntries = [...strata.entries()].filter(([key]) => key.startsWith(`${kind}|`));
      if (stratumEntries.length === 0) return null;
      const totalN = [...stratumEntries].reduce((sum, [, bucket]) => sum + (issueCounts.get(`${kind}|${bucket[0]?.group ?? ""}`) ?? bucket.length), 0);
      let weightedSum = 0;
      let seen = 0;
      for (const [key, bucket] of stratumEntries) {
        const [stratumKind, group] = key.split("|");
        if (stratumKind !== kind) continue;
        const tp = bucket.filter((row) => String(row.label ?? "").trim().toUpperCase() === "TP").length;
        const fp = bucket.filter((row) => String(row.label ?? "").trim().toUpperCase() === "FP").length;
        const clear = tp + fp;
        if (clear <= 0) continue;
        const nh = issueCounts.get(key) ?? bucket.length;
        weightedSum += (nh / Math.max(1, totalN)) * (tp / clear);
        seen += 1;
      }
      return seen > 0 ? weightedSum : null;
    })();
    const pooledState = totalClear > 0 ? { precision: formatPercent(pooled), lower: formatPercent(pooledInterval?.lower ?? null), upper: formatPercent(pooledInterval?.upper ?? null) } : { precision: "n/a", lower: "n/a", upper: "n/a" };
    const weightedState = weighted === null ? { precision: "n/a", lower: "n/a", upper: "n/a" } : { precision: formatPercent(weighted), lower: "n/a", upper: "n/a" };
    perKindRows.push([
      kind,
      String(stats.n_h),
      String(stats.total),
      String(stats.tp),
      String(stats.fp),
      String(stats.unclear),
      pooledState.precision,
      pooledState.lower,
      pooledState.upper,
      weightedState.precision,
    ]);
  }

  const agreement = computeAgreement(sampleRows);
  const kappa = computeCohenKappa(sampleRows);

  const recallJson = fs.existsSync(RECALL_PATH) ? JSON.parse(fs.readFileSync(RECALL_PATH, "utf8")) : { resultsByKind: {} };
  const recallRows: string[][] = [];
  const mutantRows: string[][] = (recallJson.mutants ?? []).map((mutant: any) => [
    String(mutant.kind ?? ""), String(mutant.id ?? ""), String(mutant.baseFile ?? ""),
    String(mutant.target ?? ""), String(mutant.mutationApplied ?? ""), mutant.detected ? "yes" : "no",
  ]);
  for (const kind of ["dangling-reference", "possible-stale-choice-literal", "invalid-form-name", "malformed-choice-list"]) {
    const result = recallJson.resultsByKind?.[kind] ?? { total: 0, detected: 0, undetected: [] };
    recallRows.push(formatRecallStats(kind, result));
  }

  const unlabelledRows = sampleRows.filter((row) => String(row.label ?? "").trim() === "").length;
  const originalPhenXReport = fs.existsSync(PHENX_PATH) ? fs.readFileSync(PHENX_PATH, "utf8") : "_No original PhenX fixtures found._\n";
  const warningBlock = unlabelledRows > 0 ? `> Warning: ${unlabelledRows} row(s) are unlabelled.` : "";
  const kappaText = kappa.kappa === null ? "n/a" : kappa.kappa.toFixed(3);
  const markdown = `# Precision Report

- Environment: Docker container; Node ${process.version}; CPU ${os.cpus()[0]?.model ?? "unknown"} (${os.cpus().length} CPUs); memory ${(os.totalmem() / 1024 ** 3).toFixed(2)} GiB visible. Runtime numbers from this container are not comparable with earlier host runs.
- Sample seed: ${metadata.seed ?? "20261103"}
- Sample size per stratum: ${metadata.samplePerStratum ?? "30"}
- Metadata generation time: ${metadataGenerated}
- Metadata commit: ${metadataCommit}
- Git HEAD: ${gitHead}
- Package version: ${PACKAGE_VERSION}
- Git dirty: ${gitDirty ? "yes" : "no"}
${warning || ""}
${dirtyWarning || ""}
- Precision refers to the sample and its strata drawn from the full issue set and is not a corpus-wide claim.
- Sample size: ${sampleRows.length} rows, issue strata: ${[...strata.keys()].length}
- Total issues in corpus: ${Array.from(issueCounts.values()).reduce((sum, value) => sum + value, 0)}
${warningBlock ? `\n${warningBlock}\n` : ""}

## 1. Precision by stratum

${buildTable(["Kind", "Group", "N_h", "Sample n", "TP", "FP", "Unclear", "Unlabelled", "Precision", "95% CI lower", "95% CI upper"], stratumRows)}

## 2. Precision by kind (weighted by stratum size; Wilson 95% CI)

${buildTable(["Kind", "N_h total", "Sample total", "TP", "FP", "Unclear", "Pooled precision", "Pooled CI lower", "Pooled CI upper", "Weighted precision"], perKindRows)}

- Weighted precision: $\sum_h (N_h / N) \times p_h$ across labelled strata.
- Pooled precision is the overall TP/(TP+FP) ratio; weighted precision is the stratum-size-weighted average of stratum precisions.

## 3. Auto-label vs. manual label agreement

- Agreement rate: ${formatPercent(agreement.agreement)} (${agreement.matching}/${agreement.total})
- Auto-labels considered: empty means TP-like prelabel; non-empty means FP-like prelabel.

## 4. Cohen's kappa (second rater)

- Rows with both raters: ${kappa.total}
- Cohen's kappa: ${kappaText}

## 5. Dangling references with caseMismatchOf

${buildTable(["Group", "Dangling-reference issues with caseMismatchOf"], Object.entries(danglingCaseCounts).map(([group, count]) => [group, String(count)]))}

- The labelling sample includes the caseMismatchOf column alongside case_mismatch_of for review.

## 6. Recall on injected defects

${buildTable(["Kind", "Mutants", "Distinct mutants", "Detected", "Recall / small sample", "95% CI lower", "95% CI upper", "Undetected"], recallRows)}

### Mutants and their base files

${buildTable(["Kind", "Mutation ID", "Base file", "Target", "Mutation", "Detected"], mutantRows)}

## 7. Original PhenX validation notes

${originalPhenXReport}
`;

  fs.writeFileSync(path.join(RESULTS_DIR, "PRECISION.md"), markdown, "utf8");
}

if (require.main === module) main();
