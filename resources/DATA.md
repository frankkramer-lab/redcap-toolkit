# Round-trip data dictionaries

## Directory structure

```text
resources/
├── DATA.md
├── NIEHS/
│   ├── COVID-19_Pediatric_Research_2022-03-04.csv
│   ├── COVID-19_Studies_Including_Pregnant_Participants_2023-11-15.csv
│   ├── Post-Acute-Sequelae_of_SARS-CoV-2_in_Pregnancy_and_Postpartum_2023-11-15.csv
│   └── RADx_Common_Data_Elements_2022-03-02.csv
├── PhenX/
│   ├── PX010101.csv
│   ├── ...
│   └── PX992501.csv
├── RareLink/
│   └── RareLink_v2_0_7.csv
├── SpyCATS/
│   └── SpyCATS_2022-12-20.csv
└── test_data/
    └── all_options_dictionary.csv
```

The 991 public CSVs (985 PhenX instruments and six other dictionaries) are
downloaded fixtures and are ignored by Git. The locally authored
`test_data/all_options_dictionary.csv` remains tracked. These dictionaries
describe instruments and fields, **not** participant responses. They are
intended for reading, writing, reading the written CSV again, and comparing
the resulting dictionaries. Source filenames are retained below because the
local fixture names have been simplified.

## Sources

### NIEHS Disaster Research Response (DR2) Portal — four dictionaries

The [NIEHS DR2 COVID-19 resources page](https://portal.niehs.nih.gov/dr2/covid19)
links to the individual resource records below. The linked CSVs are data
dictionaries for recommended common data elements (CDEs), rather than
collected clinical data. The dates in the **local filenames** are the portal's
**Date Record Updated**, not verified CSV release dates or CSV version numbers.
The portal also gives a separate **Date Published** for each resource; the
dates embedded in two *original* CSV filenames must not be conflated with
either portal date.

| Data and local CSV | Portal record / source | Direct CSV download | Original CSV | Date Published | Date Record Updated |
| --- | --- | --- | --- | --- | --- |
| Pediatric COVID-19 research: biomedical and psychosocial measures covering children's clinical course, treatment, outcomes, education, well-being, and family or community factors. [`COVID-19_Pediatric_Research_2022-03-04.csv`](NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv) | [DR2 record 24250](https://portal.niehs.nih.gov/dr2/details/24250) (source: NIH) | [24250_dd_508.csv](https://portal.niehs.nih.gov/dr2/unmanaged/files/24250_dd_508.csv) | `24250_dd_508.csv` | 2021-07-08 | 2022-03-04 |
| COVID-19 studies including pregnant participants: maternal, pregnancy, neonatal, and psychosocial CDEs, including treatment and outcomes. [`COVID-19_Studies_Including_Pregnant_Participants_2023-11-15.csv`](NIEHS/COVID-19_Studies_Including_Pregnant_Participants_2023-11-15.csv) | [DR2 record 24206](https://portal.niehs.nih.gov/dr2/details/24206) (source: NICHD) | [pregnancy registry CSV](https://portal.niehs.nih.gov/dr2/unmanaged/files/24206_cdecovid19pregnancyregistry_datadictionary_2022_02_28_508.csv) | `24206_cdecovid19pregnancyregistry_datadictionary_2022_02_28_508.csv` | 2020-12-15 | 2023-11-15 |
| Post-acute sequelae of SARS-CoV-2 (PASC) in pregnancy and postpartum: recommended CDEs about vaccination, postpartum health, contraception, infant care, and access to care. [`Post-Acute-Sequelae_of_SARS-CoV-2_in_Pregnancy_and_Postpartum_2023-11-15.csv`](NIEHS/Post-Acute-Sequelae_of_SARS-CoV-2_in_Pregnancy_and_Postpartum_2023-11-15.csv) | [DR2 record 24255](https://portal.niehs.nih.gov/dr2/details/24255) (source: NICHD) | [24255_dd_508.csv](https://portal.niehs.nih.gov/dr2/unmanaged/files/24255_dd_508.csv) | `24255_dd_508.csv` | 2021-08-27 | 2023-11-15 |
| NIH RADx: required common data elements for studies with human participants in the COVID-19 testing program. [`RADx_Common_Data_Elements_2022-03-02.csv`](NIEHS/RADx_Common_Data_Elements_2022-03-02.csv) | [DR2 record 24244](https://portal.niehs.nih.gov/dr2/details/24244) (source: NIH) | [RADx dictionary CSV](https://portal.niehs.nih.gov/dr2/unmanaged/files/radx_execcommrequiredcdes2_datadictionary_2021_04_19_508.csv) | `radx_execcommrequiredcdes2_datadictionary_2021_04_19_508.csv` | 2020-09-01 | 2022-03-02 |

The original downloads are stored in `../data/NIEHS/` (relative to the
repository root), each inside a descriptive project subdirectory alongside a
saved DR2 detail page. Only the renamed CSVs are copied into `resources/NIEHS/`.

### PhenX Toolkit — 985 REDCap instruments

[PhenX Downloads](https://phenxtoolkit.org/resources/download) offers the
[All REDCap Zip Instruments archive](https://phenxtoolkit.org/toolkit_content/documents/data_dictionary/ALL_REDCap_ZIP_Files.zip).
PhenX provides standardized research protocols with REDCap-ready instruments;
each `instrument.csv` defines the fields and questions for one protocol (for
example, `PX010101` concerns current age). The downloaded archive contains
individual `PX*.zip` archives, each containing an `instrument.csv` plus
identifier text files. The local source is
`../data/PhenX/ALL_REDCap_ZIP_Files/PX<id>/instrument.csv`; the corresponding
fixture is `PhenX/PX<id>.csv`. There are 985 locally supplied instruments,
from `PX010101` through `PX992501`. No ZIP or identifier text files are kept
in `resources/`. The saved source pointer is
`../data/PhenX/phenxtoolkit.org.txt.desktop`. The PhenX downloads page states
that its database and supporting documentation are distributed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode).

Two downloaded PhenX fixtures contained an invalid trailing pipe at the end of
a final choice value, for example `...|_7,REFUSED|` instead of the valid
`...|_7,REFUSED`. A trailing pipe creates an empty choice element and is not
valid REDCap choice syntax. The cleaned fixtures at
[`PhenX/PX030603.csv`](PhenX/PX030603.csv) and
[`PhenX/PX710302.csv`](PhenX/PX710302.csv) were edited to remove the
superfluous final `|`, while preserving the original choice labels and order.

The public PhenX file [`PhenX/PX031001.csv`](PhenX/PX031001.csv) also
contained a malformed radio-choice list in the field
`current_smoker_more_enum`: the original source used `Yes |No`, which lacks a
choice code and does not match REDCap's valid `code, label` syntax. The
repaired version uses the explicit and valid choice list `1, Yes | 0, No`.

### RareLink — CDM version 2.0.7

The [RareLink data-dictionary installation guide](https://rarelink.readthedocs.io/en/latest/3_installation/3_3_data_dictionary.html)
provides the [RareLink-CDM v2.0.7 CSV](https://rarelink.readthedocs.io/en/latest/_downloads/93550322332735a8fff53418198e01df/rarelink_cdm_datadictionary%20-%20v2_0_7.csv).
It describes the REDCap instruments of the RareLink common data model for
rare-disease registries, including formal criteria and patient-related
information; the guide explains importing the dictionary into REDCap and
using its repeating instruments. The downloaded file is stored in the
repository as [`RareLink/RareLink_v2_0_7.orig`](RareLink/RareLink_v2_0_7.orig)
without any post-processing. The first header cell in the original download is
misspelled as `1` instead of `Variable / Field Name`; the file otherwise keeps
the standard REDCap column layout for the dictionary rows. The repository also
contains a processed copy at [`RareLink/RareLink_v2_0_7.csv`](RareLink/RareLink_v2_0_7.csv),
which preserves the same row layout and uses the corrected standard header name.
A saved copy of the guide is next to the original CSV.

### SpyCATS — 2022-12-20

[Armitage, EP, *SpyCATS REDCap Data Dictionary* (Zenodo, 2022)](https://zenodo.org/records/7463052),
[DOI: 10.5281/zenodo.7463052](https://doi.org/10.5281/zenodo.7463052),
publishes the complete REDCap data dictionary for the case-report forms of
the SpyCATS longitudinal study in The Gambia. The
[direct CSV download](https://zenodo.org/records/7463052/files/LEO24005SpyCATS_DataDictionary_2022-12-20.csv?download=1)
is stored at
`../data/SpyCATS/LEO24005SpyCATS_DataDictionary_2022-12-20.csv` and copied
as [`SpyCATS/SpyCATS_2022-12-20.csv`](SpyCATS/SpyCATS_2022-12-20.csv).
The date is part of the original CSV filename. The Zenodo record declares
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode); a saved
copy of the record page accompanies the original CSV.

### Locally authored test questionnaire

[`test_data/all_options_dictionary.csv`](test_data/all_options_dictionary.csv)
is a self-created REDCap questionnaire intended to exercise many parser and
writer variations. Its single form contains 83 field rows, including text,
notes, descriptive, file/signature, and multiple-choice field types; date,
time, numeric, email, postal-code and phone validations; minimum and maximum
values; section headers; branching rules for text, numbers, dates, choice
fields and checkbox combinations; and embedded field references in choices.
It has no external download link and is already present in the repository.

## Download the public CSV fixtures

Run this from the repository root with `curl` and `unzip` installed. The
PhenX ZIPs are used only in a temporary directory; the resulting resources
contain CSVs only. This downloads the *currently published* files, which
could differ from the local snapshots described above.

```sh
set -eu
cd resources
mkdir -p NIEHS PhenX RareLink SpyCATS

curl -fL --retry 3 'https://portal.niehs.nih.gov/dr2/unmanaged/files/24250_dd_508.csv' -o 'NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv'
curl -fL --retry 3 'https://portal.niehs.nih.gov/dr2/unmanaged/files/24206_cdecovid19pregnancyregistry_datadictionary_2022_02_28_508.csv' -o 'NIEHS/COVID-19_Studies_Including_Pregnant_Participants_2023-11-15.csv'
curl -fL --retry 3 'https://portal.niehs.nih.gov/dr2/unmanaged/files/24255_dd_508.csv' -o 'NIEHS/Post-Acute-Sequelae_of_SARS-CoV-2_in_Pregnancy_and_Postpartum_2023-11-15.csv'
curl -fL --retry 3 'https://portal.niehs.nih.gov/dr2/unmanaged/files/radx_execcommrequiredcdes2_datadictionary_2021_04_19_508.csv' -o 'NIEHS/RADx_Common_Data_Elements_2022-03-02.csv'

curl -fL --retry 3 'https://rarelink.readthedocs.io/en/latest/_downloads/93550322332735a8fff53418198e01df/rarelink_cdm_datadictionary%20-%20v2_0_7.csv' -o 'RareLink/RareLink_v2_0_7.orig'
python - <<'PY'
import csv
from pathlib import Path
src = Path('RareLink/RareLink_v2_0_7.orig')
out = Path('RareLink/RareLink_v2_0_7.csv')
with src.open('r', newline='', encoding='utf-8') as fin, out.open('w', newline='', encoding='utf-8') as fout:
    reader = csv.reader(fin)
    writer = csv.writer(fout)
    for row in reader:
        if len(row) > 1:
            writer.writerow(row[1:])
        else:
            writer.writerow([])
PY
curl -fL --retry 3 'https://zenodo.org/records/7463052/files/LEO24005SpyCATS_DataDictionary_2022-12-20.csv?download=1' -o 'SpyCATS/SpyCATS_2022-12-20.csv'

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fL --retry 3 'https://phenxtoolkit.org/toolkit_content/documents/data_dictionary/ALL_REDCap_ZIP_Files.zip' -o "$tmp/phenx.zip"
unzip -q "$tmp/phenx.zip" -d "$tmp/instruments"
for zip in "$tmp"/instruments/PX*.zip; do
    [ -f "$zip" ] || { printf 'No PhenX instrument archives found\n' >&2; exit 1; }
    id=${zip##*/}
    id=${id%.zip}
    unzip -p "$zip" instrument.csv > "PhenX/$id.csv"
done
```
