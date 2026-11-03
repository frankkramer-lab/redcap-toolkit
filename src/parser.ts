import Papa from "papaparse";

import type { AnswerChoice, Form, ParserDiagnostic, Question, RedcapQuestionTypesEnum, Section } from "./types";
import { RedcapQuestionTypesEnum as QuestionType } from "./types";

const DEFAULT_HEADERS = [
  "Variable / Field Name",
  "Form Name",
  "Section Header",
  "Field Type",
  "Field Label",
  "Choices, Calculations, OR Slider Labels",
  "Field Note",
  "Text Validation Type OR Show Slider Number",
  "Text Validation Min",
  "Text Validation Max",
  "Identifier?",
  "Branching Logic (Show field only if...)",
  "Required Field?",
  "Custom Alignment",
  "Question Number (surveys only)",
  "Matrix Group Name",
  "Matrix Ranking?",
  "Field Annotation",
] as const;

const STANDARD_HEADER_KEYS = new Map<string, string>(
  DEFAULT_HEADERS.map((header) => [normalizeHeaderName(header), header]),
);

function normalizeHeaderName(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseChoiceCell(value: string): AnswerChoice[] {
  if (!value || !value.trim()) return [];

  return value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const firstComma = entry.indexOf(",");
      if (firstComma === -1) {
        return { index: entry, rawIndex: entry, label: entry };
      }

      const rawIndex = entry.slice(0, firstComma).trim();
      const label = entry.slice(firstComma + 1).trim();
      const numericIndex = /^-?\d+$/.test(rawIndex) ? Number(rawIndex) : undefined;
      return {
        index: rawIndex,
        rawIndex,
        numericIndex,
        label,
      };
    });
}

function parseRequiredValue(value: string): { required: boolean; requiredRaw?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { required: false, requiredRaw: trimmed };
  }
  return {
    required: /^(1|y|yes|true)$/i.test(trimmed),
    requiredRaw: trimmed,
  };
}

function coerceFieldType(value: string): { fieldType: RedcapQuestionTypesEnum | string; fieldTypeRaw?: string; diagnostic?: ParserDiagnostic } {
  const raw = value.trim();
  const normalized = raw.toLowerCase();
  const candidate = (Object.values(QuestionType) as string[]).includes(normalized)
    ? (normalized as RedcapQuestionTypesEnum)
    : QuestionType.text;

  if (raw && !Object.values(QuestionType).includes(normalized as RedcapQuestionTypesEnum)) {
    return {
      fieldType: QuestionType.text,
      fieldTypeRaw: raw,
      diagnostic: {
        kind: "unknown-field-type",
        severity: "warning",
        column: "Field Type",
        message: `Unknown REDCap field type '${raw}'; keeping raw value and defaulting to text for compatibility.`,
        value: raw,
      },
    };
  }

  return {
    fieldType: candidate,
    fieldTypeRaw: raw || undefined,
  };
}

function readCell(row: string[], headerMap: Map<string, number>, headerName: string, fallbackValue = ""): string {
  const exact = headerMap.get(normalizeHeaderName(headerName));
  if (exact === undefined) {
    return fallbackValue;
  }
  return String(row[exact] ?? "");
}

function parseQuestionRow(row: string[], headerMap: Map<string, number>, formName: string, rowNumber: number, parserDiagnostics: ParserDiagnostic[]): Question | null {
  const variableName = readCell(row, headerMap, "Variable / Field Name").trim();
  if (!variableName || variableName.startsWith("#")) {
    return null;
  }

  const fieldTypeValue = readCell(row, headerMap, "Field Type");
  const fieldTypeResult = coerceFieldType(fieldTypeValue);
  if (fieldTypeResult.diagnostic) {
    parserDiagnostics.push({ ...fieldTypeResult.diagnostic, rowNumber });
  }

  const choicesRaw = readCell(row, headerMap, "Choices, Calculations, OR Slider Labels");
  const rawRequiredField = readCell(row, headerMap, "Required Field?");
  const requiredValue = parseRequiredValue(rawRequiredField);
  const question: Question = {
    variableName,
    formName,
    fieldType: fieldTypeResult.fieldType,
    fieldTypeRaw: fieldTypeResult.fieldTypeRaw ?? "",
    fieldLabel: readCell(row, headerMap, "Field Label"),
    answerChoices: parseChoiceCell(choicesRaw),
    choicesRaw: choicesRaw || "",
    fieldNote: readCell(row, headerMap, "Field Note"),
    textValidationType: readCell(row, headerMap, "Text Validation Type OR Show Slider Number"),
    textValidationMin: readCell(row, headerMap, "Text Validation Min"),
    textValidationMax: readCell(row, headerMap, "Text Validation Max"),
    identifier: readCell(row, headerMap, "Identifier?"),
    required: requiredValue.required,
    requiredRaw: requiredValue.requiredRaw ?? "",
    customAlignment: readCell(row, headerMap, "Custom Alignment"),
    questionNumber: readCell(row, headerMap, "Question Number (surveys only)"),
    matrixGroupName: readCell(row, headerMap, "Matrix Group Name"),
    matrixRanking: readCell(row, headerMap, "Matrix Ranking?"),
    validation: readCell(row, headerMap, "Text Validation Type OR Show Slider Number"),
    branchingLogic: readCell(row, headerMap, "Branching Logic (Show field only if...)").trim(),
    fieldAnnotation: readCell(row, headerMap, "Field Annotation"),
    parserDiagnostics: [],
    extraColumns: {},
  };

  for (const [headerText, index] of headerMap.entries()) {
    const standardKey = STANDARD_HEADER_KEYS.get(headerText);
    if (standardKey) continue;
    const rawValue = String(row[index] ?? "");
    if (!rawValue && !headerText) continue;
    question.extraColumns ??= {};
    question.extraColumns[headerText] = rawValue;
  }

  return question;
}

export class DataDictCSVParser {
  public sourceHeaders: string[] = [];
  public diagnostics: ParserDiagnostic[] = [];

  readFormsFromCSV(csvText: string, file?: string): Form[] {
    const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false, delimiter: "," });
    const rows = parsed.data as string[][];
    this.diagnostics = [];
    this.sourceHeaders = [];
    if (rows.length === 0) return [];

    const headerRow = rows[0].map((header) => String(header ?? ""));
    this.sourceHeaders = [...headerRow];

    const headerMap = new Map<string, number>();
    for (const [index, header] of headerRow.entries()) {
      const normalized = normalizeHeaderName(header);
      if (!normalized) continue;
      if (!headerMap.has(normalized)) {
        headerMap.set(normalized, index);
      }
    }

    const missingHeaders = DEFAULT_HEADERS.filter((header) => !headerMap.has(normalizeHeaderName(header)));
    for (const header of missingHeaders) {
      this.diagnostics.push({
        kind: "missing-column",
        severity: "warning",
        column: header,
        message: `Missing standard column '${header}' in source CSV; it will be rendered as an empty string.`,
      });
    }

    const byForm = new Map<string, Form>();
    const lastRowByForm = new Map<string, number>();
    let previousFormName: string | undefined;
    const rowsToProcess = rows.slice(1);

    for (const [rowIndex, row] of rowsToProcess.entries()) {
      const normalizedRow = row.length < headerRow.length ? [...row, ...Array(headerRow.length - row.length).fill("")] : row;
      if (row.length !== headerRow.length) {
        this.diagnostics.push({
          kind: "row-length-mismatch",
          severity: "error",
          rowNumber: rowIndex + 2,
          message: `Row length ${row.length} does not match header length ${headerRow.length}; padded trailing empty cells for parsing.`,
        });
      }

      const formName = readCell(normalizedRow, headerMap, "Form Name").trim() || "default";
      const question = parseQuestionRow(normalizedRow, headerMap, formName, rowIndex + 2, this.diagnostics);
      if (!question) continue;

      if (previousFormName !== formName && byForm.has(formName)) {
        const previousRow = lastRowByForm.get(formName);
        this.diagnostics.push({
          kind: "noncontiguous-form",
          severity: "error",
          file,
          rowNumber: rowIndex + 2,
          column: "Form Name",
          value: formName,
          message: `${file ?? "CSV"}: form '${formName}' resumes at row ${rowIndex + 2} after its previous block ended at row ${previousRow}; REDCap form rows must be contiguous.`,
        });
      }
      previousFormName = formName;
      lastRowByForm.set(formName, rowIndex + 2);

      let form = byForm.get(formName);
      if (!form) {
        form = { name: formName, sections: [] };
        byForm.set(formName, form);
      }

      const header = readCell(normalizedRow, headerMap, "Section Header");
      let section = form.sections[form.sections.length - 1];
      if (header.trim() || !section) {
        section = { name: header.trim() || "default", header: header.trim() ? header : "", questions: [] };
        form.sections.push(section);
      }

      section.questions.push(question);
    }

    return [...byForm.values()];
  }

  writeFormsToCSV(forms: Form[]): string {
    const rows: string[][] = [
      [...DEFAULT_HEADERS],
    ];

    for (const form of forms) {
      for (const section of form.sections) {
        for (const [index, question] of section.questions.entries()) {
          const requiredRawValue = question.requiredRaw ?? (question.required ? "y" : "");
          const values = [
            question.variableName,
            form.name,
            index === 0 ? (section.header ?? (section.name === "default" ? "" : section.name)) : "",
            question.fieldTypeRaw ?? question.fieldType,
            question.fieldLabel,
            question.choicesRaw ?? question.answerChoices.map((choice) => `${String(choice.rawIndex ?? choice.index)}, ${choice.label}`).join(" | "),
            question.fieldNote ?? "",
            question.textValidationType ?? "",
            question.textValidationMin ?? "",
            question.textValidationMax ?? "",
            question.identifier ?? "",
            question.branchingLogic ?? "",
            requiredRawValue,
            question.customAlignment ?? "",
            question.questionNumber ?? "",
            question.matrixGroupName ?? "",
            question.matrixRanking ?? "",
            question.fieldAnnotation ?? "",
          ];
          rows.push(values);
        }
      }
    }

    return Papa.unparse(rows);
  }
}

export function parseCsvDictionary(csvText: string): Form[] {
  return new DataDictCSVParser().readFormsFromCSV(csvText);
}
