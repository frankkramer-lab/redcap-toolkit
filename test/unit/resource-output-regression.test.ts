import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { DataDictCSVParser, validateForms } from "@frankkramer-lab/redcap-toolkit";

function listResourceCsvFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listResourceCsvFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".csv")) {
      files.push(fullPath);
    }
  }

  return files;
}

function issueSortKey(issue: Record<string, unknown>): string {
  return [
    issue.kind ?? "",
    issue.severity ?? "",
    issue.sourceVariableName ?? "",
    issue.referencedVariableName ?? "",
    issue.literal ?? "",
    issue.raw ?? "",
    issue.rule ?? "",
    issue.formName ?? "",
  ].join("\u0000");
}

test("resource validation output stays stable across every CSV in resources/", () => {
  const parser = new DataDictCSVParser();
  const resourceDir = path.resolve(process.cwd(), "resources");
  const files = listResourceCsvFiles(resourceDir);

  const output = files.map((filePath) => {
    const issues = validateForms(parser.readFormsFromCSV(fs.readFileSync(filePath, "utf8")))
      .map((issue) => ({ ...issue }))
      .sort((left, right) => issueSortKey(left).localeCompare(issueSortKey(right)));

    return {
      file: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
      issues,
    };
  });

  const snapshotPath = path.resolve(process.cwd(), "test", "unit", "resources-issues.snapshot.json");
  assert.ok(fs.existsSync(snapshotPath), `missing snapshot at ${snapshotPath}`);

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  assert.deepEqual(output, snapshot);
});
