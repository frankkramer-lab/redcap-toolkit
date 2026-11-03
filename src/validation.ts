import type { Form, Question, ValidationIssue } from "./types";

const REFERENCE_TOKEN_PATTERN = /\[[^\]]+\]/g;
const COMPARISON_LITERAL_PATTERN = /\[([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]+)\))?\]\s*(<>|!=|<=|>=|=|<|>)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))/g;
const VALID_FORM_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const CHOICE_FIELD_TYPES = new Set(["radio", "dropdown", "checkbox"]);

function normalizeReferenceName(value: string): string {
  return value.trim().replace(/^\[|\]$/g, "");
}

function isValidReferenceName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
}

function parseReferenceToken(raw: string): { name: string; code?: string; raw: string } | null {
  const inner = raw.slice(1, -1).trim();
  if (!inner.includes("-") && !inner.includes(" ")) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]+)\))?$/.exec(inner);
    if (match) {
      return {
        name: match[1],
        code: match[2] ? match[2].trim() : undefined,
        raw,
      };
    }
  }

  return null;
}

function getChoiceCodesForField(field: Question | undefined): Set<string> | null {
  if (!field) return null;

  if (field.fieldType === "yesno" || field.fieldType === "truefalse") {
    return new Set(["0", "1"]);
  }

  if (!CHOICE_FIELD_TYPES.has(field.fieldType)) {
    return null;
  }

  if (field.answerChoices.length === 0) {
    return null;
  }

  return new Set(field.answerChoices.map((choice) => String(choice.rawIndex ?? choice.index)));
}

function isCheckableChoiceLiteralField(field: Question | undefined): boolean {
  if (!field) {
    return false;
  }

  if (field.fieldType === "yesno" || field.fieldType === "truefalse") {
    return true;
  }

  return CHOICE_FIELD_TYPES.has(field.fieldType) && field.answerChoices.length > 0;
}

function getFieldChoiceMetadata(field: Question | undefined): {
  validChoiceCodes: Set<string> | null;
  isCheckable: boolean;
} {
  if (!field) {
    return { validChoiceCodes: null, isCheckable: false };
  }

  const validChoiceCodes = getChoiceCodesForField(field);
  const isCheckable = isCheckableChoiceLiteralField(field);

  return { validChoiceCodes, isCheckable };
}

function getMalformedChoiceListIssues(question: Question, form: Form): ValidationIssue[] {
  const rawCell = question.choicesRaw ?? "";
  if (!rawCell || !rawCell.trim()) {
    return [];
  }

  if (!["radio", "dropdown", "checkbox"].includes(question.fieldType)) {
    return [];
  }

  const seenCodes = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const element of rawCell.split("|")) {
    const value = element.trim();
    if (value === "") {
      issues.push({
        kind: "malformed-choice-list",
        severity: "error",
        formName: form.name,
        sourceVariableName: question.variableName,
        raw: rawCell,
        literal: "",
        rule: "empty-element",
      });
      continue;
    }

    const firstComma = value.indexOf(",");
    if (firstComma === -1) {
      issues.push({
        kind: "malformed-choice-list",
        severity: "error",
        formName: form.name,
        sourceVariableName: question.variableName,
        raw: rawCell,
        literal: value,
        rule: "missing-code",
      });
      continue;
    }

    const code = value.slice(0, firstComma).trim();
    const label = value.slice(firstComma + 1).trim();

    if (code === "") {
      issues.push({
        kind: "malformed-choice-list",
        severity: "error",
        formName: form.name,
        sourceVariableName: question.variableName,
        raw: rawCell,
        literal: value,
        rule: "empty-code",
      });
      continue;
    }

    if (label === "") {
      issues.push({
        kind: "malformed-choice-list",
        severity: "error",
        formName: form.name,
        sourceVariableName: question.variableName,
        raw: rawCell,
        literal: value,
        rule: "empty-label",
      });
      continue;
    }

    if (seenCodes.has(code)) {
      issues.push({
        kind: "malformed-choice-list",
        severity: "error",
        formName: form.name,
        sourceVariableName: question.variableName,
        raw: rawCell,
        literal: value,
        rule: "duplicate-code",
      });
    }
    seenCodes.add(code);
  }

  return issues;
}

export function validateForms(forms: Form[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const variableNames = new Set<string>();
  const variableNamesByLower = new Map<string, string>();
  const fieldIndex = new Map<string, Question>();
  const fieldMetadataIndex = new Map<string, { validChoiceCodes: Set<string> | null; isCheckable: boolean }>();

  for (const form of forms) {
    if (!VALID_FORM_NAME_PATTERN.test(form.name)) {
      issues.push({
        kind: "invalid-form-name",
        severity: "warning",
        formName: form.name,
      });
    }

    for (const section of form.sections) {
      for (const question of section.questions) {
        variableNames.add(question.variableName);
        const lowerName = question.variableName.toLowerCase();
        if (!variableNamesByLower.has(lowerName)) {
          variableNamesByLower.set(lowerName, question.variableName);
        }

        if (!fieldIndex.has(question.variableName)) {
          fieldIndex.set(question.variableName, question);
          fieldMetadataIndex.set(question.variableName, getFieldChoiceMetadata(question));
        }
      }
    }
  }

  for (const form of forms) {
    for (const section of form.sections) {
      for (const question of section.questions) {
        issues.push(...getMalformedChoiceListIssues(question, form));

        const logic = question.branchingLogic ?? "";
        const tokens = [...logic.matchAll(REFERENCE_TOKEN_PATTERN)].map((match) => ({ raw: match[0], start: match.index ?? 0 }));
        const skipTokenIndexes = new Set<number>();

        for (let index = 1; index < tokens.length; index += 1) {
          const previousToken = tokens[index - 1];
          const token = tokens[index];
          if (token.start !== previousToken.start + previousToken.raw.length) {
            continue;
          }

          const previousParsed = parseReferenceToken(previousToken.raw);
          const currentParsed = parseReferenceToken(token.raw);
          if (previousParsed && isValidReferenceName(previousParsed.name) && currentParsed && isValidReferenceName(currentParsed.name)) {
            skipTokenIndexes.add(index - 1);
          } else if (currentParsed && isValidReferenceName(currentParsed.name)) {
            skipTokenIndexes.add(index - 1);
          } else {
            skipTokenIndexes.add(index);
          }
        }

        for (let index = 0; index < tokens.length; index += 1) {
          if (skipTokenIndexes.has(index)) {
            continue;
          }

          const token = tokens[index];
          const parsed = parseReferenceToken(token.raw);
          if (!parsed || !isValidReferenceName(parsed.name)) {
            continue;
          }

          if (!variableNames.has(parsed.name)) {
            const existingName = variableNamesByLower.get(parsed.name.toLowerCase());
            issues.push({
              kind: "dangling-reference",
              severity: "error",
              sourceVariableName: question.variableName,
              referencedVariableName: parsed.name,
              caseMismatchOf: existingName && existingName !== parsed.name ? existingName : undefined,
              raw: parsed.raw,
              formName: form.name,
            });
            continue;
          }

          if (parsed.code !== undefined) {
            const target = fieldIndex.get(parsed.name);
            if (!target) {
              continue;
            }

            const targetMetadata = fieldMetadataIndex.get(parsed.name) ?? getFieldChoiceMetadata(target);
            const validChoiceCodes = targetMetadata.validChoiceCodes;
            if (!validChoiceCodes || !validChoiceCodes.has(String(parsed.code).trim()) || !targetMetadata.isCheckable) {
              issues.push({
                kind: "possible-stale-choice-literal",
                severity: "warning",
                sourceVariableName: question.variableName,
                referencedVariableName: parsed.name,
                literal: String(parsed.code).trim(),
                raw: parsed.raw,
                formName: form.name,
              });
            }
          }
        }

        for (const match of logic.matchAll(COMPARISON_LITERAL_PATTERN)) {
          const refName = match[1];
          const refCode = match[2] ? match[2].trim() : undefined;
          const operator = match[3];
          const literal = String(match[4] ?? match[5] ?? match[6] ?? "").trim();

          if (!literal || ["<", ">", "<=", ">="].includes(operator)) {
            continue;
          }

          if (refCode !== undefined) {
            continue;
          }

          const targetMetadata = fieldMetadataIndex.get(refName);
          if (!targetMetadata || !targetMetadata.isCheckable) {
            continue;
          }

          const validChoiceCodes = targetMetadata.validChoiceCodes;
          if (!validChoiceCodes || !validChoiceCodes.has(literal)) {
            issues.push({
              kind: "possible-stale-choice-literal",
              severity: "warning",
              sourceVariableName: question.variableName,
              referencedVariableName: refName,
              literal,
              raw: match[0],
              formName: form.name,
            });
          }
        }
      }
    }
  }

  return issues;
}

export function hasDanglingReference(forms: Form[], variableName?: string): boolean {
  const issues = validateForms(forms);
  return issues.some((issue) => issue.kind === "dangling-reference" && (!variableName || issue.sourceVariableName === variableName));
}
