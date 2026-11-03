import test from "node:test";
import assert from "node:assert/strict";

import { DataDictCSVParser, RedcapQuestionTypesEnum, validateForms, type Form, type Question } from "@frankkramer-lab/redcap-toolkit";

function makeQuestion(variableName: string, fieldType: RedcapQuestionTypesEnum, answerChoices: Array<{ index: number | string; label: string }>, branchingLogic?: string): Question {
  return {
    variableName,
    formName: "demo",
    fieldType,
    fieldLabel: variableName,
    answerChoices,
    required: false,
    branchingLogic,
  };
}

function makeForms(questions: Question[]): Form[] {
  return [{ name: "demo", sections: [{ name: "default", questions }] }];
}

test("validation ignores checkbox option references and operator fragments in branching logic", () => {
  const forms = makeForms([
    makeQuestion("ch_cond2", RedcapQuestionTypesEnum.checkbox, [{ index: 1, label: "One" }, { index: 96, label: "Ninety Six" }], "[ch_cond2(96)] = '1'"),
    makeQuestion("vaxhx_effect_first_spfy", RedcapQuestionTypesEnum.checkbox, [{ index: 1, label: "Yes" }, { index: 96, label: "Option 96" }], "[vaxhx_effect_first_spfy(96)] = '1'"),
    makeQuestion("mc_checkbox_bl", RedcapQuestionTypesEnum.checkbox, [{ index: 1, label: "Opt1" }, { index: 2, label: "Opt2" }, { index: 3, label: "Opt3" }], "[mc_checkbox_bl(2)] = '1'"),
    makeQuestion("x", RedcapQuestionTypesEnum.dropdown, [{ index: 1, label: "One" }, { index: 2, label: "Two" }, { index: 3, label: "Three" }], "[x] <> ''"),
    makeQuestion("x2", RedcapQuestionTypesEnum.dropdown, [{ index: 1, label: "One" }, { index: 2, label: "Two" }, { index: 3, label: "Three" }], "[x2] >= 3"),
    makeQuestion("x3", RedcapQuestionTypesEnum.dropdown, [{ index: 1, label: "One" }, { index: 2, label: "Two" }, { index: 3, label: "Three" }], "[x3] <= 3"),
    makeQuestion("x4", RedcapQuestionTypesEnum.dropdown, [{ index: 1, label: "One" }, { index: 2, label: "Two" }, { index: 3, label: "Three" }], "[x4] != '2'"),
    makeQuestion("a", RedcapQuestionTypesEnum.dropdown, [{ index: 1, label: "A1" }], "[a] = '1' and ([b(3)] = '0' or [c] <> '2')"),
    makeQuestion("b", RedcapQuestionTypesEnum.checkbox, [{ index: 1, label: "One" }, { index: 3, label: "Three" }], "[b(3)] = '0'"),
    makeQuestion("c", RedcapQuestionTypesEnum.dropdown, [{ index: 1, label: "One" }, { index: 2, label: "Two" }], "[c] <> '2'"),
  ]);

  const issues = validateForms(forms);

  assert.deepEqual(
    issues.filter((issue) => issue.kind === "dangling-reference"),
    [],
  );
  assert.deepEqual(
    issues.filter((issue) => issue.kind === "possible-stale-choice-literal"),
    [],
  );
});

test("validation keeps true positives for renamed fields, stale choice codes, and invalid form names", () => {
  const forms = makeForms([
    makeQuestion("checkbox_field", RedcapQuestionTypesEnum.checkbox, [{ index: 1, label: "One" }, { index: 2, label: "Two" }, { index: 3, label: "Three" }], "[checkbox_field(2)] = '1'"),
    makeQuestion("radio_field", RedcapQuestionTypesEnum.radio, [{ index: 1, label: "One" }, { index: 2, label: "Two" }], "[radio_field] = '3'"),
    makeQuestion("cb", RedcapQuestionTypesEnum.checkbox, [{ index: 1, label: "One" }, { index: 2, label: "Two" }], "[cb(99)] = '1'"),
  ]);

  const renamedForms = [...forms];
  renamedForms[0].sections[0].questions[0].variableName = "checkbox_field_renamed";

  const issues = validateForms(renamedForms);

  assert.ok(issues.some((issue) => issue.kind === "dangling-reference" && issue.referencedVariableName === "checkbox_field"));
  assert.ok(issues.some((issue) => issue.kind === "possible-stale-choice-literal" && issue.literal === "3" && issue.referencedVariableName === "radio_field"));
  assert.ok(issues.some((issue) => issue.kind === "possible-stale-choice-literal" && issue.literal === "99" && issue.referencedVariableName === "cb"));

  const invalidNameForms = [...forms];
  invalidNameForms.push({ name: "DemoForm", sections: [] });
  const invalidNameIssues = validateForms(invalidNameForms).filter((issue) => issue.kind === "invalid-form-name");
  assert.deepEqual(invalidNameIssues, [{ kind: "invalid-form-name", severity: "warning", formName: "DemoForm" }]);
});

test("adjacent event references and case mismatches follow REDCap semantics", () => {
  const forms = makeForms([
    makeQuestion("age", RedcapQuestionTypesEnum.radio, [{ index: "1", label: "Yes" }, { index: "0", label: "No" }], "[event_1_arm_1][age] = '1'"),
    makeQuestion("mixed_case", RedcapQuestionTypesEnum.radio, [{ index: "1", label: "Yes" }], "[Mixed_Case] = '1'"),
    makeQuestion("instance_field", RedcapQuestionTypesEnum.radio, [{ index: "1", label: "Yes" }], "[age][2] = '1'"),
    makeQuestion("missing_ref", RedcapQuestionTypesEnum.text, [], "[event_1_arm_1][missing] = '1'"),
    makeQuestion("choice_01", RedcapQuestionTypesEnum.radio, [{ index: "01", label: "Yes" }], "[choice_01] = '01'"),
    makeQuestion("choice_1", RedcapQuestionTypesEnum.radio, [{ index: "1", label: "Yes" }], "[choice_1] = '01'"),
  ]);

  const issues = validateForms(forms);

  assert.ok(!issues.some((issue) => issue.kind === "dangling-reference" && issue.sourceVariableName === "age"));
  assert.ok(!issues.some((issue) => issue.kind === "dangling-reference" && issue.sourceVariableName === "instance_field"));
  assert.ok(issues.some((issue) => issue.kind === "dangling-reference" && issue.referencedVariableName === "missing" && issue.sourceVariableName === "missing_ref"));
  assert.ok(issues.some((issue) => issue.kind === "dangling-reference" && issue.referencedVariableName === "Mixed_Case" && issue.caseMismatchOf === "mixed_case"));
  assert.ok(!issues.some((issue) => issue.kind === "possible-stale-choice-literal" && issue.sourceVariableName === "choice_01"));
  assert.ok(issues.some((issue) => issue.kind === "possible-stale-choice-literal" && issue.sourceVariableName === "choice_1" && issue.literal === "01"));
});
