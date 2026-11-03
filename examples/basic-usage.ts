import { DataDictCSVParser, validateForms } from "@frankkramer-lab/redcap-toolkit";

const csv = [
  '"Variable / Field Name","Form Name","Section Header","Field Type","Field Label","Choices, Calculations, OR Slider Labels","Field Note","Text Validation Type OR Show Slider Number","Text Validation Min","Text Validation Max","Identifier?","Branching Logic (Show field only if...)","Required Field?","Custom Alignment","Question Number (surveys only)","Matrix Group Name","Matrix Ranking?","Field Annotation"',
  'q1,demo,,radio,"Pick one","1, Yes | 0, No",,,,,,,,,,,,',
  'q2,demo,,text,"Only for yes",,,,,,,"[q1] = \'1\'",,,,,,',
  '',
].join("\n");

const parser = new DataDictCSVParser();
const forms = parser.readFormsFromCSV(csv);
console.log(`Parsed ${forms.length} forms and ${forms[0].sections[0].questions.length} questions.`);
console.log(validateForms(forms));
console.log(parser.writeFormsToCSV(forms));
