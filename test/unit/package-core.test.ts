import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";

import { DataDictCSVParser, RedcapQuestionTypesEnum, validateForms } from "@frankkramer-lab/redcap-toolkit";

const csv = [
  '"Variable / Field Name","Form Name","Section Header","Field Type","Field Label","Choices, Calculations, OR Slider Labels","Field Note","Text Validation Type OR Show Slider Number","Text Validation Min","Text Validation Max","Identifier?","Branching Logic (Show field only if...)","Required Field?","Custom Alignment","Question Number (surveys only)","Matrix Group Name","Matrix Ranking?","Field Annotation"',
  'q1,demo,,radio,"Pick one","1, Alpha | 2, Beta",,,,,,,,,,,,',
  'q2,demo,,text,"Only for beta",,,,,,,"[q1] = \'2\'",,,,,,',
  'q3,demo,,text,"Broken reference",,,,,,,"[does_not_exist] = \'1\'",,,,,,',
  'q4,demo,,text,"Stale choice index",,,,,,,"[q1] = \'99\'",,,,,,',
  'q5,demo,,radio,"Where were you born?","UNDEFINED_CODE,United States|UNDEFINED_CODE_1,Outside the United States",,,,,,,,,,,,',
  '',
].join("\n");

test("parses REDCap CSV dictionaries into forms and preserves non-numeric choice codes", () => {
  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(csv);

  assert.equal(forms.length, 1);
  assert.equal(forms[0].name, "demo");
  assert.equal(forms[0].sections[0].questions.length, 5);
  assert.equal(forms[0].sections[0].questions[0].fieldType, RedcapQuestionTypesEnum.radio);
  assert.deepEqual(
    forms[0].sections[0].questions[4].answerChoices.map((choice) => ({ index: String(choice.index), label: choice.label })),
    [
      { index: "UNDEFINED_CODE", label: "United States" },
      { index: "UNDEFINED_CODE_1", label: "Outside the United States" },
    ],
  );
});

test("validation catches dangling references and stale choice literals", () => {
  const forms = new DataDictCSVParser().readFormsFromCSV(csv);
  const issues = validateForms(forms);

  assert.ok(issues.some((issue) => issue.kind === "dangling-reference" && issue.referencedVariableName === "does_not_exist"));
  assert.ok(issues.some((issue) => issue.kind === "possible-stale-choice-literal" && issue.literal === "99"));
  assert.ok(!issues.some((issue) => issue.kind === "dangling-reference" && issue.referencedVariableName === "q1"));
});

test("validation warns once per invalid form name and accepts lowercase underscores", () => {
  const forms = new DataDictCSVParser().readFormsFromCSV(csv);
  forms.push({ name: "px120602_PhenX_-_Eating_Disorder_Diagnostic_Scale_DSM-5", sections: [] });
  forms.push({ name: "1starts_with_digit", sections: [] });
  forms.push({ name: "valid_form_2", sections: [] });

  const issues = validateForms(forms).filter((issue) => issue.kind === "invalid-form-name");
  assert.deepEqual(issues, [
    { kind: "invalid-form-name", severity: "warning", formName: "px120602_PhenX_-_Eating_Disorder_Diagnostic_Scale_DSM-5" },
    { kind: "invalid-form-name", severity: "warning", formName: "1starts_with_digit" },
  ]);
});

test("writeFormsToCSV round-trips semantic content", () => {
  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(csv);
  const roundTrip = parser.readFormsFromCSV(parser.writeFormsToCSV(forms));

  assert.equal(roundTrip.length, forms.length);
  assert.equal(roundTrip[0].sections[0].questions[0].fieldLabel, forms[0].sections[0].questions[0].fieldLabel);
  assert.deepEqual(
    roundTrip[0].sections[0].questions[4].answerChoices.map((choice) => ({ index: String(choice.index), label: choice.label })),
    forms[0].sections[0].questions[4].answerChoices.map((choice) => ({ index: String(choice.index), label: choice.label })),
  );
});

test("round-trips all standard CSV columns and preserves leading-zero choice codes", () => {
  const fullCsv = [
    '"Variable / Field Name","Form Name","Section Header","Field Type","Field Label","Choices, Calculations, OR Slider Labels","Field Note","Text Validation Type OR Show Slider Number","Text Validation Min","Text Validation Max","Identifier?","Branching Logic (Show field only if...)","Required Field?","Custom Alignment","Question Number (surveys only)","Matrix Group Name","Matrix Ranking?","Field Annotation"',
    'q_full,demo,,radio,"A question","01, One | 1, Not one","A note","number","0","9","y","[q_other] = \'x\'","y","Center","7","matrix_a","0","note text"',
    'q_other,demo,,text,"Other","","Note two","date_ymd","-1","5","","","","Left","9","","",""',
  ].join("\n");

  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(fullCsv);
  const csvOut = parser.writeFormsToCSV(forms);
  const roundTrip = parser.readFormsFromCSV(csvOut);

  assert.equal(roundTrip[0].sections[0].questions[0].answerChoices.map((choice) => String(choice.index)).join("|"), "01|1");
  assert.equal(roundTrip[0].sections[0].questions[0].fieldNote, "A note");
  assert.equal(roundTrip[0].sections[0].questions[0].textValidationMin, "0");
  assert.equal(roundTrip[0].sections[0].questions[0].textValidationMax, "9");
  assert.equal(roundTrip[0].sections[0].questions[0].identifier, "y");
  assert.equal(roundTrip[0].sections[0].questions[0].requiredRaw, "y");
  assert.equal(roundTrip[0].sections[0].questions[0].customAlignment, "Center");
  assert.equal(roundTrip[0].sections[0].questions[0].questionNumber, "7");
  assert.equal(roundTrip[0].sections[0].questions[0].matrixGroupName, "matrix_a");
  assert.equal(roundTrip[0].sections[0].questions[0].matrixRanking, "0");
  assert.equal(roundTrip[0].sections[0].questions[0].fieldAnnotation, "note text");
  assert.equal(roundTrip[0].sections[0].questions[1].fieldAnnotation, "");

  const sourceForms = parser.readFormsFromCSV(fullCsv);
  const sourceQuestion = sourceForms[0].sections[0].questions[0];
  const roundTripQuestion = roundTrip[0].sections[0].questions[0];
  assert.deepEqual(
    {
      answerChoices: roundTripQuestion.answerChoices.map((choice) => String(choice.index)),
      fieldNote: roundTripQuestion.fieldNote,
      textValidationMin: roundTripQuestion.textValidationMin,
      textValidationMax: roundTripQuestion.textValidationMax,
      identifier: roundTripQuestion.identifier,
      requiredRaw: roundTripQuestion.requiredRaw,
      customAlignment: roundTripQuestion.customAlignment,
      questionNumber: roundTripQuestion.questionNumber,
      matrixGroupName: roundTripQuestion.matrixGroupName,
      matrixRanking: roundTripQuestion.matrixRanking,
      fieldAnnotation: roundTripQuestion.fieldAnnotation,
    },
    {
      answerChoices: sourceQuestion.answerChoices.map((choice) => String(choice.index)),
      fieldNote: sourceQuestion.fieldNote,
      textValidationMin: sourceQuestion.textValidationMin,
      textValidationMax: sourceQuestion.textValidationMax,
      identifier: sourceQuestion.identifier,
      requiredRaw: sourceQuestion.requiredRaw,
      customAlignment: sourceQuestion.customAlignment,
      questionNumber: sourceQuestion.questionNumber,
      matrixGroupName: sourceQuestion.matrixGroupName,
      matrixRanking: sourceQuestion.matrixRanking,
      fieldAnnotation: sourceQuestion.fieldAnnotation,
    },
  );
});

test("missing Field Annotation is empty and reported without reading another column", () => {
  const csvWithoutAnnotation = [
    '"Variable / Field Name","Form Name","Section Header","Field Type","Field Label","Choices, Calculations, OR Slider Labels","Field Note","Text Validation Type OR Show Slider Number","Text Validation Min","Text Validation Max","Identifier?","Branching Logic (Show field only if...)","Required Field?","Custom Alignment","Question Number (surveys only)","Matrix Group Name","Matrix Ranking?"',
    'q_only,demo,,text,"Only one",,,,,,,,"",,,,',
  ].join("\n");

  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(csvWithoutAnnotation);
  const q = forms[0].sections[0].questions[0];

  assert.equal(q.fieldAnnotation, "");
  assert.equal(q.fieldNote, "");
  assert.ok(parser.diagnostics.some((diagnostic) => diagnostic.column === "Field Annotation" && diagnostic.kind === "missing-column"));
});

test("sections preserve field order, repeated headers, initial unheaded fields, and header cells", () => {
  const headers = (Papa.parse<string[]>(csv).data as string[][])[0];
  const sourceRows = [
    ["before", "demo", "", "text", "Before"],
    ["first", "demo", "Repeated", "text", "First"],
    ["second", "demo", "", "text", "Second"],
    ["third", "demo", "Other", "text", "Third"],
    ["fourth", "demo", "", "text", "Fourth"],
    ["fifth", "demo", "Repeated", "text", "Fifth"],
    ["sixth", "demo", "", "text", "Sixth"],
  ].map((cells) => [...cells, ...Array(headers.length - cells.length).fill("")]);
  const source = Papa.unparse([headers, ...sourceRows]);
  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(source);

  assert.deepEqual(forms[0].sections.map((section) => ({
    header: section.header,
    fields: section.questions.map((question) => question.variableName),
  })), [
    { header: "", fields: ["before"] },
    { header: "Repeated", fields: ["first", "second"] },
    { header: "Other", fields: ["third", "fourth"] },
    { header: "Repeated", fields: ["fifth", "sixth"] },
  ]);
  const writtenRows = Papa.parse<string[]>(parser.writeFormsToCSV(forms)).data;
  assert.deepEqual(writtenRows, [headers, ...sourceRows]);
  assert.deepEqual(parser.readFormsFromCSV(parser.writeFormsToCSV(forms)), forms);
});

test("interleaved form rows produce a diagnostic with the file and row numbers", () => {
  const headers = (Papa.parse<string[]>(csv).data as string[][])[0];
  const source = Papa.unparse([headers,
    ["a1", "form_a", "", "text"],
    ["b1", "form_b", "", "text"],
    ["a2", "form_a", "", "text"],
  ]);
  const parser = new DataDictCSVParser();
  const forms = parser.readFormsFromCSV(source, "interleaved.csv");

  assert.deepEqual(forms.map((form) => form.name), ["form_a", "form_b"]);
  assert.deepEqual(forms[0].sections[0].questions.map((question) => question.variableName), ["a1", "a2"]);
  assert.ok(parser.diagnostics.some((diagnostic) => diagnostic.kind === "noncontiguous-form"
    && diagnostic.file === "interleaved.csv" && diagnostic.rowNumber === 4
    && diagnostic.message.includes("row 2") && diagnostic.message.includes("row 4")));
});

test("blank rows are silent, but a nonempty row missing its eighteenth cell is diagnosed", () => {
  const headers = (Papa.parse<string[]>(csv).data as string[][])[0];
  const row = ["q", "demo", "", "text", "Question", ...Array(headers.length - 5).fill("")];
  const parser = new DataDictCSVParser();

  const forms = parser.readFormsFromCSV(`${Papa.unparse([headers, row])}\r\n`);
  assert.equal(forms[0].sections[0].questions.length, 1);
  assert.deepEqual(parser.diagnostics, []);

  parser.readFormsFromCSV(`${Papa.unparse([headers, row])}\r\n  ,  `);
  assert.deepEqual(parser.diagnostics, []);

  parser.readFormsFromCSV(Papa.unparse([headers, row.slice(0, -1)]));
  assert.deepEqual(parser.diagnostics.filter((diagnostic) => diagnostic.kind === "row-length-mismatch").map((diagnostic) => diagnostic.rowNumber), [2]);
});
