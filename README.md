# redcap-toolkit

A framework-agnostic TypeScript toolkit for parsing, validating, and
round-tripping [REDCap](https://projectredcap.org) Data Dictionary CSV files,
including dictionaries with several forms/instruments.

> **Unaffiliated third-party project.** REDCap® is a registered trademark of
> Vanderbilt University. This project is not produced, endorsed, or supported
> by Vanderbilt University or the REDCap Consortium.

## What this is for

REDCap data dictionaries describe forms and fields as CSV rows. This package
groups those rows into typed `Form` → `Section` → `Question` objects, checks
the resulting forms for selected inconsistencies, and writes them back to CSV.
It works in Node.js and the browser and does not communicate with a REDCap
server or handle collected record data.

## Install

Install the published package from [npm](https://www.npmjs.com/package/@frankkramer-lab/redcap-toolkit):

```bash
npm install @frankkramer-lab/redcap-toolkit
```

Node.js 18 or later is required when using the package in Node.js.

## Features

- Reads multiple forms in source order, preserving display order of fields.
  A nonempty `Section Header` starts a section; following fields inherit it
  until the next header. Fields before the first header remain in an unheaded
  section, and repeated header text starts separate sections. Exports place
  each header only on the first field of its section.
- Models and writes all 18 standard REDCap Data Dictionary columns, including
  labels, notes, validation settings, matrix settings and field annotations.
  `Required Field?` retains its source value in `requiredRaw` (including blank,
  `y`, `n`, `0` and `1`), alongside a parsed `required` boolean.
- Supports REDCap field types (`text`, `notes`, `dropdown`, `radio`, `checkbox`,
  `yesno`, `truefalse`, `calc`, `slider`, `file`, `descriptive`, `sql`). Choice
  codes remain strings, including leading-zero and non-numeric codes;
  `choicesRaw` retains the original choice-list text for validation and export.
- `parser.diagnostics` records missing columns, row-length mismatches,
  unknown field types, and noncontiguous forms (with row numbers and an
  optional file name passed to `readFormsFromCSV`). Form rows must be
  contiguous; interleaved forms are reported rather than silently accepted.
- Writes CSV with [Papa Parse](https://www.papaparse.com/) and checks four
  validation categories: dangling branching-logic references (`error`, with
  `caseMismatchOf` when only case differs), possible stale choice literals
  (`warning`, heuristic), malformed choice lists (`error`, with the offending
  rule and element), and invalid form names (`warning`). Valid form names
  start with a lowercase letter and contain only lowercase letters, digits,
  and underscores.

### Branching logic reference rules

The validator works on the text of branching logic, not an expression parser.
Its rules are intentionally conservative:

- Choice cells for `radio`, `dropdown`, and `checkbox` fields are validated
  before normalisation. A raw cell is checked for `empty-element`,
  `missing-code`, `empty-code`, `duplicate-code`, and `empty-label` issues,
  with one issue per offending element.
- Raw choice cells are checked before parsing can drop malformed entries.

- A bracket token like `[field]` is a field reference; `[field(code)]` means
  a checkbox option reference for choice code `code`.
- A missing exact-case field reference emits a `dangling-reference` issue with
  the original bracket token in `raw`; `caseMismatchOf` identifies a field
  that differs only in case.
- Invalid checkbox option references and comparison literals outside a
  referenced choice field's codes produce `possible-stale-choice-literal`
  warnings. `yesno` and `truefalse` use fixed codes `0` and `1`.
- Adjacent tokens like `[event_name][field]` are treated as an event name plus a
  field name, so only the second token is checked when it is a valid variable
  reference; if the second token is a number or instance-smart variable such as
  `[field][2]` or `[field][previous-instance]`, only the first token is checked.
- Hyphenated smart variables such as `[record-dag-name]` or `[previous-instance]`
  are ignored because they are not valid REDCap variable names.
- Literal comparisons use the longest operator first (`<>`, `!=`, `<=`, `>=`,
  `=`, `<`, `>`), and only quoted strings or bare numbers on the right-hand side
  are treated as candidate choice literals. Operator symbols and brackets are not
  treated as literals.

## Usage

```ts
import { DataDictCSVParser, validateForms } from "@frankkramer-lab/redcap-toolkit";
import { readFileSync } from "node:fs";

const csvText = readFileSync("MyProject_DataDictionary.csv", "utf-8");
const parser = new DataDictCSVParser();
const forms = parser.readFormsFromCSV(csvText, "MyProject_DataDictionary.csv"); // one Form per instrument

for (const form of forms) {
  console.log(form.name, form.sections.flatMap((s) => s.questions).length);
}

const issues = validateForms(forms);
if (issues.some((issue) => issue.severity === "error")) {
  console.error(issues);
}

const csvOut = parser.writeFormsToCSV(forms);
```

## Limitations

- When an invalid dictionary interleaves rows from different forms, the parser
  reports it but still groups rows by form, so exporting changes that file's order.
- Branching logic is stored as text; reference and choice checks are based on
  its textual field references and literal comparisons, not on an expression
  parser. They do not inspect formulas, labels, or action tags.
- Nonstandard extra columns are available on fields as `extraColumns`, but
  the writer outputs the 18 standard columns; source column layouts and CSV
  formatting (including some whitespace) may change on export.
- The package does not evaluate formulas or match dictionary fields to
  collected record/export columns.

## Local development

```bash
npm install
npm run build
npm test
```

## License

[GNU AGPL-3.0-or-later](./LICENSE).
