export enum RedcapQuestionTypesEnum {
  checkbox = "checkbox",
  descriptive = "descriptive",
  dropdown = "dropdown",
  notes = "notes",
  radio = "radio",
  text = "text",
  yesno = "yesno",
  truefalse = "truefalse",
  file = "file",
  calc = "calc",
  slider = "slider",
  sql = "sql",
}

export const CHOICE_BASED_TYPES: ReadonlySet<RedcapQuestionTypesEnum> = new Set([
  RedcapQuestionTypesEnum.radio,
  RedcapQuestionTypesEnum.dropdown,
  RedcapQuestionTypesEnum.checkbox,
]);

export const FIXED_CHOICE_TYPES: ReadonlySet<RedcapQuestionTypesEnum> = new Set([
  RedcapQuestionTypesEnum.yesno,
  RedcapQuestionTypesEnum.truefalse,
]);

export const FIXED_CHOICES: Record<string, { index: number; label: string }[]> = {
  [RedcapQuestionTypesEnum.yesno]: [
    { index: 1, label: "Yes" },
    { index: 0, label: "No" },
  ],
  [RedcapQuestionTypesEnum.truefalse]: [
    { index: 1, label: "True" },
    { index: 0, label: "False" },
  ],
};

export const CALC_TYPES: ReadonlySet<RedcapQuestionTypesEnum> = new Set([RedcapQuestionTypesEnum.calc]);
export const SLIDER_TYPES: ReadonlySet<RedcapQuestionTypesEnum> = new Set([RedcapQuestionTypesEnum.slider]);
export const NON_EXPORTED_TYPES: ReadonlySet<RedcapQuestionTypesEnum> = new Set([RedcapQuestionTypesEnum.descriptive]);
export const MULTI_COLUMN_EXPORT_TYPES: ReadonlySet<RedcapQuestionTypesEnum> = new Set([RedcapQuestionTypesEnum.checkbox]);

export interface AnswerChoice {
  index: number | string;
  numericIndex?: number;
  rawIndex?: string;
  label: string;
}

export interface ParserDiagnostic {
  kind: "missing-column" | "row-length-mismatch" | "unknown-field-type" | "malformed-value" | "noncontiguous-form";
  severity: "warning" | "error";
  file?: string;
  rowNumber?: number;
  column?: string;
  message: string;
  value?: string;
}

export interface Question {
  variableName: string;
  formName: string;
  fieldType: RedcapQuestionTypesEnum | string;
  fieldTypeRaw?: string;
  fieldLabel: string;
  answerChoices: AnswerChoice[];
  choicesRaw?: string;
  fieldNote?: string;
  textValidationType?: string;
  textValidationMin?: string;
  textValidationMax?: string;
  identifier?: string;
  required: boolean;
  requiredRaw?: string;
  customAlignment?: string;
  questionNumber?: string;
  matrixGroupName?: string;
  matrixRanking?: string;
  validation?: string;
  branchingLogic?: string;
  fieldAnnotation?: string;
  extraColumns?: Record<string, string>;
  parserDiagnostics?: ParserDiagnostic[];
}

export interface Section {
  name: string;
  /** Raw Section Header cell on the first field; empty for the initial unheaded section. */
  header?: string;
  questions: Question[];
}

export interface Form {
  name: string;
  sections: Section[];
}

export type MalformedChoiceRule = "empty-element" | "missing-code" | "empty-code" | "duplicate-code" | "empty-label";

export interface ValidationIssue {
  kind: "dangling-reference" | "possible-stale-choice-literal" | "invalid-form-name" | "malformed-choice-list";
  severity: "error" | "warning";
  sourceVariableName?: string;
  referencedVariableName?: string;
  caseMismatchOf?: string;
  literal?: string;
  raw?: string;
  rule?: MalformedChoiceRule;
  formName?: string;
}
