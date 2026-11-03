import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { DataDictCSVParser, RedcapQuestionTypesEnum, validateForms, type Question, type Form } from "@frankkramer-lab/redcap-toolkit";

function makeQuestion(variableName: string, fieldType: RedcapQuestionTypesEnum, cell: string): Question {
  return {
    variableName,
    formName: "demo",
    fieldType,
    fieldLabel: variableName,
    answerChoices: [],
    choicesRaw: cell,
    required: false,
  };
}

function makeForms(questions: Question[]): Form[] {
  return [{ name: "demo", sections: [{ name: "default", questions }] }];
}

test("original PhenX malformed choice cells are reported as malformed-choice-list issues", () => {
  const parser = new DataDictCSVParser();
  const originalDir = path.resolve(process.cwd(), "resources", "PhenX_original");
  const files = ["PX030603.csv", "PX710302.csv", "PX031001.csv"].map((fileName) => path.join(originalDir, fileName));

  const issues = files.flatMap((filePath) => {
    assert.ok(fs.existsSync(filePath), `expected malformed fixture ${path.basename(filePath)} in resources/PhenX_original`);
    return validateForms(parser.readFormsFromCSV(fs.readFileSync(filePath, "utf8")));
  }).filter((issue) => issue.kind === "malformed-choice-list");

  const rules = Object.fromEntries(Object.keys({ emptyElement: 0, missingCode: 0, emptyCode: 0, duplicateCode: 0, emptyLabel: 0 }).map((key) => [key, 0]));
  for (const issue of issues) {
    if (issue.rule === "empty-element") rules.emptyElement += 1;
    if (issue.rule === "missing-code") rules.missingCode += 1;
    if (issue.rule === "empty-code") rules.emptyCode += 1;
    if (issue.rule === "duplicate-code") rules.duplicateCode += 1;
    if (issue.rule === "empty-label") rules.emptyLabel += 1;
  }

  assert.equal(rules.emptyElement, 2);
  assert.ok(rules.missingCode >= 1);
  assert.equal(issues.length, 2 + rules.missingCode);
});

test("corrected PhenX files and synthetic choice cells do not trigger malformed choice-list issues", () => {
  const parser = new DataDictCSVParser();
  const fixedFiles = ["PX030603.csv", "PX710302.csv", "PX031001.csv"].map((fileName) => path.join(process.cwd(), "resources", "PhenX", fileName));
  const fixedIssues = fixedFiles.flatMap((filePath) => validateForms(parser.readFormsFromCSV(fs.readFileSync(filePath, "utf8")))).filter((issue) => issue.kind === "malformed-choice-list");
  assert.deepEqual(fixedIssues, []);

  const csvRows = [
    '"Variable / Field Name","Form Name","Section Header","Field Type","Field Label","Choices, Calculations, OR Slider Labels","Field Note","Text Validation Type OR Show Slider Number","Text Validation Min","Text Validation Max","Identifier?","Branching Logic (Show field only if...)","Required Field?","Custom Alignment","Question Number (surveys only)","Matrix Group Name","Matrix Ranking?","Field Annotation"',
    'choices_with_commas,demo,,radio,"Choices with commas","1, Yes, definitely | 2, No",,,,,,,,,,,,',
    'non_numeric_codes,demo,,dropdown,"Non-numeric codes","a, Alpha | b, Beta",,,,,,,,,,,,',
    'slider_ok,demo,,slider,"Slider","left | middle | right",,,,,,,,,,,,',
    'calc_ok,demo,,calc,"Calc","[a] + [b]",,,,,,,,,,,,',
    'duplicate_bad,demo,,checkbox,"Duplicate code","1, Yes | 1, Again",,,,,,,,,,,,',
    'empty_code_bad,demo,,radio,"Empty code"," , Yes | 2, No",,,,,,,,,,,,',
    'empty_label_bad,demo,,radio,"Empty label","1, | 2, No",,,,,,,,,,,,',
    'empty_element_bad,demo,,radio,"Empty element","1, Yes | 2, No |",,,,,,,,,,,,',
    'yesno_ok,demo,,yesno,"YesNo",,,,,,,,,,,,',
  ].join("\n");

  const forms = parser.readFormsFromCSV(csvRows);
  const issues = validateForms(forms).filter((issue) => issue.kind === "malformed-choice-list");
  assert.ok(issues.some((issue) => issue.rule === "duplicate-code"));
  assert.ok(issues.some((issue) => issue.rule === "empty-code"));
  assert.ok(issues.some((issue) => issue.rule === "empty-label"));
  assert.ok(issues.some((issue) => issue.rule === "empty-element"));
  assert.equal(issues.filter((issue) => issue.rule === "duplicate-code").length, 1);
  assert.equal(issues.filter((issue) => issue.rule === "empty-code").length, 1);
  assert.equal(issues.filter((issue) => issue.rule === "empty-label").length, 1);
  assert.equal(issues.filter((issue) => issue.rule === "empty-element").length, 1);
  assert.ok(issues.every((issue) => issue.severity === "error"));
});
