import * as fs from "node:fs";
import * as path from "node:path";

type EvaluationEntry = { file: string; roundTrip: { originalToExportParsedCellsEqual: boolean } };
type DiffEntry = { file: string; equivalentUnderAllowList: boolean };

export function findRoundtripDisagreements(evaluation: EvaluationEntry[], diffs: DiffEntry[]): string[] {
  const evaluationByFile = new Map(evaluation.map((entry) => [entry.file, entry]));
  const diffByFile = new Map(diffs.map((entry) => [entry.file, entry]));
  const disagreements: string[] = [];
  for (const file of [...new Set([...evaluationByFile.keys(), ...diffByFile.keys()])].sort()) {
    const evaluated = evaluationByFile.get(file)?.roundTrip.originalToExportParsedCellsEqual;
    const equivalent = diffByFile.get(file)?.equivalentUnderAllowList;
    if (typeof evaluated !== "boolean" || typeof equivalent !== "boolean" || evaluated !== equivalent) {
      disagreements.push(`${file}: positionally equal=${evaluated ?? "missing"}, diff equivalent=${equivalent ?? "missing"}`);
    }
  }
  return disagreements;
}

if (require.main === module) {
  const results = path.resolve(process.cwd(), "evaluation", "results");
  const evaluation = JSON.parse(fs.readFileSync(path.join(results, "evaluation.json"), "utf8"));
  const diff = JSON.parse(fs.readFileSync(path.join(results, "roundtrip_diff.json"), "utf8"));
  const disagreements = findRoundtripDisagreements(evaluation.perFile, diff.files);
  if (disagreements.length) {
    console.error(`Round-trip report disagreement (${disagreements.length} files):\n${disagreements.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Round-trip reports agree for ${diff.files.length} files.`);
  }
}
