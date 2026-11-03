import Papa from "papaparse";

export interface OrderComparison {
  fieldOrderIdentical: boolean;
  formOrderIdentical: boolean;
  sectionHeaderPositionsIdentical: boolean;
  rowStructureIdentical: boolean;
  firstDifferentPosition: number | null;
  movedFieldCount: number;
  movedFields: Array<{ position: number; source: string | null; written: string | null }>;
  sourceForms: string[];
  writtenForms: string[];
  sourceSectionHeaderPositions: number[];
  writtenSectionHeaderPositions: number[];
}

function columnIndex(headers: string[], name: string): number {
  return headers.findIndex((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase() === name.toLowerCase());
}

function describeRows(rows: string[][]): { fields: string[]; forms: string[]; headers: number[] } {
  const variableIndex = columnIndex(rows[0] ?? [], "Variable / Field Name");
  const formIndex = columnIndex(rows[0] ?? [], "Form Name");
  const sectionIndex = columnIndex(rows[0] ?? [], "Section Header");
  const fields: string[] = [];
  const forms: string[] = [];
  const headers: number[] = [];
  for (const row of rows.slice(1)) {
    const variable = String(row[variableIndex] ?? "").trim();
    if (!variable || variable.startsWith("#")) continue;
    fields.push(variable);
    const form = String(row[formIndex] ?? "").trim() || "default";
    if (forms[forms.length - 1] !== form) forms.push(form);
    if (String(row[sectionIndex] ?? "").trim()) headers.push(fields.length);
  }
  return { fields, forms, headers };
}

export function compareCsvOrder(source: string, written: string): OrderComparison {
  // Use the same BOM, line-ending and trailing-newline normalization as EVALUATION.md.
  const normalize = (text: string) => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const sourceRows = Papa.parse<string[]>(normalize(source), { delimiter: ",", skipEmptyLines: false }).data;
  const writtenRows = Papa.parse<string[]>(normalize(written), { delimiter: ",", skipEmptyLines: false }).data;
  const a = describeRows(sourceRows);
  const b = describeRows(writtenRows);
  const movedFields: OrderComparison["movedFields"] = [];
  for (let index = 0; index < Math.max(a.fields.length, b.fields.length); index += 1) {
    if (a.fields[index] !== b.fields[index]) {
      movedFields.push({ position: index + 1, source: a.fields[index] ?? null, written: b.fields[index] ?? null });
    }
  }
  return {
    fieldOrderIdentical: movedFields.length === 0,
    formOrderIdentical: JSON.stringify(a.forms) === JSON.stringify(b.forms),
    sectionHeaderPositionsIdentical: JSON.stringify(a.headers) === JSON.stringify(b.headers),
    rowStructureIdentical: sourceRows.length === writtenRows.length
      && sourceRows.every((row, index) => row.length === writtenRows[index].length
        && (index !== 0 || row.every((header, column) => header === writtenRows[0][column]))),
    firstDifferentPosition: movedFields[0]?.position ?? null,
    movedFieldCount: movedFields.length,
    movedFields,
    sourceForms: a.forms,
    writtenForms: b.forms,
    sourceSectionHeaderPositions: a.headers,
    writtenSectionHeaderPositions: b.headers,
  };
}
