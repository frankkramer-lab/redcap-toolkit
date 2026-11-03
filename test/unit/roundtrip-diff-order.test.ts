import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";

import { compareCsvOrder } from "../roundtrip_order";
import { findRoundtripDisagreements } from "../../evaluation/check_roundtrip_consistency";

const headers = ["Variable / Field Name", "Form Name", "Section Header", "Field Type"];
const source = Papa.unparse([headers,
  ["a", "form_a", "Section", "text"],
  ["b", "form_a", "", "text"],
  ["c", "form_b", "Section", "text"],
]);

test("detects reordered fields even when each variable retains its cells", () => {
  const written = Papa.unparse([headers,
    ["b", "form_a", "", "text"],
    ["a", "form_a", "Section", "text"],
    ["c", "form_b", "Section", "text"],
  ]);
  const result = compareCsvOrder(source, written);
  assert.equal(result.fieldOrderIdentical, false);
  assert.equal(result.firstDifferentPosition, 1);
  assert.equal(result.movedFieldCount, 2);
  assert.deepEqual(result.movedFields, [
    { position: 1, source: "a", written: "b" },
    { position: 2, source: "b", written: "a" },
  ]);
  assert.equal(result.formOrderIdentical, true);
  assert.equal(result.sectionHeaderPositionsIdentical, false);
});

test("detects changed form order, header positions, and missing columns separately", () => {
  const sameFieldsDifferentForms = Papa.unparse([headers,
    ["a", "form_b", "Section", "text"],
    ["b", "form_b", "", "text"],
    ["c", "form_a", "Section", "text"],
  ]);
  const forms = compareCsvOrder(source, sameFieldsDifferentForms);
  assert.equal(forms.fieldOrderIdentical, true);
  assert.equal(forms.formOrderIdentical, false);
  const movedHeader = compareCsvOrder(source, Papa.unparse([headers,
    ["a", "form_a", "", "text"],
    ["b", "form_a", "Section", "text"],
    ["c", "form_b", "Section", "text"],
  ]));
  assert.equal(movedHeader.fieldOrderIdentical, true);
  assert.equal(movedHeader.sectionHeaderPositionsIdentical, false);
  const missingColumn = Papa.unparse([headers.slice(0, -1),
    ["a", "form_a", "Section"],
    ["b", "form_a", ""],
    ["c", "form_b", "Section"],
  ]);
  assert.equal(compareCsvOrder(missingColumn, source).rowStructureIdentical, false);
  assert.equal(compareCsvOrder(source + "\r\n", source).rowStructureIdentical, true);
});

test("consistency gate lists mismatches in either direction and missing files", () => {
  assert.deepEqual(findRoundtripDisagreements([
    { file: "equal.csv", roundTrip: { originalToExportParsedCellsEqual: true } },
    { file: "different.csv", roundTrip: { originalToExportParsedCellsEqual: false } },
  ], [
    { file: "equal.csv", equivalentUnderAllowList: false },
    { file: "different.csv", equivalentUnderAllowList: true },
    { file: "extra.csv", equivalentUnderAllowList: true },
  ]), [
    "different.csv: positionally equal=false, diff equivalent=true",
    "equal.csv: positionally equal=true, diff equivalent=false",
    "extra.csv: positionally equal=missing, diff equivalent=true",
  ]);
});
