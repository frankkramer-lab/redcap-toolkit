import test from "node:test";
import assert from "node:assert/strict";

import { buildMutants, runRecallCheck } from "../precision";
import { countDanglingCaseMismatches, formatRecallStats } from "../precision_report";

test("recall mutations are distinct, traceable to fixtures, and detect their injected defects", () => {
  const mutants = buildMutants();
  const results = runRecallCheck();
  const kinds = ["dangling-reference", "possible-stale-choice-literal", "invalid-form-name", "malformed-choice-list"];

  for (const kind of kinds) {
    const entries = mutants.filter((mutant) => mutant.kind === kind);
    assert.ok(entries.length >= 10, `${kind}: expected at least ten mutants`);
    assert.equal(new Set(entries.map((mutant) => mutant.id)).size, entries.length);
    assert.ok(entries.every((mutant) => mutant.baseFile.startsWith("resources/") && mutant.text));
    assert.equal(results.resultsByKind[kind].distinctMutants, entries.length);
    assert.equal(results.resultsByKind[kind].detected, entries.length,
      `${kind}: ${JSON.stringify(results.resultsByKind[kind].undetected)}`);
  }

  const malformed = mutants.filter((mutant) => mutant.kind === "malformed-choice-list");
  const byTarget = new Map<string, Set<string>>();
  for (const mutant of malformed) {
    const rules = byTarget.get(mutant.target) ?? new Set<string>();
    rules.add(mutant.expectedRule);
    byTarget.set(mutant.target, rules);
  }
  assert.ok(byTarget.size >= 2);
  for (const rules of byTarget.values()) {
    assert.deepEqual([...rules].sort(), ["duplicate-code", "empty-code", "empty-element", "empty-label", "missing-code"]);
  }
  for (const kind of ["possible-stale-choice-literal", "invalid-form-name"]) {
    assert.ok(mutants.some((mutant) => mutant.kind === kind && mutant.baseFile.startsWith("resources/NIEHS/")));
  }
});

test("recall intervals require ten distinct mutants and case mismatches count only dangling issues", () => {
  const small = formatRecallStats("invalid-form-name", { total: 4, distinctMutants: 4, detected: 4 });
  assert.equal(small[4], "all 4 detected");
  assert.deepEqual(small.slice(5, 7), ["n/a", "n/a"]);
  const missed = formatRecallStats("invalid-form-name", { total: 3, distinctMutants: 3, detected: 2,
    undetected: [{ baseFile: "resources/NIEHS/example.csv", mutationApplied: "hyphen" }] });
  assert.equal(missed[4], "n/a");
  assert.match(missed[7], /resources\/NIEHS\/example\.csv: hyphen/);
  const large = formatRecallStats("invalid-form-name", { total: 10, distinctMutants: 10, detected: 10 });
  assert.equal(large[4], "100.0%");
  assert.notEqual(large[5], "n/a");

  const counts = countDanglingCaseMismatches([
    { kind: "dangling-reference", group: "PhenX", case_mismatch_of: "Mixed_Case" },
    { kind: "dangling-reference", group: "PhenX", case_mismatch_of: "" },
    { kind: "possible-stale-choice-literal", group: "PhenX", case_mismatch_of: "Other" },
  ]);
  assert.equal(counts.PhenX, 1);
  assert.equal(counts.NIEHS, 0);
});
