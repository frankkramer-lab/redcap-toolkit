# Evaluation Report

## 1. Runtime environment and data basis

- Runtime: 2026-11-03T21:50:53.864Z
- Container: Docker container; runtime numbers here are not comparable with earlier host runs.
- Node version: v18.17.0
- Platform: linux / 6.8.0-138-generic
- CPU: 12th Gen Intel(R) Core(TM) i7-1260P (16 cores)
- Memory: 31.06 GB
- Package version: 1.0.1
- Git commit: 7bec7055c72f3afe645101065cf3dc1d4aee6786
- papaparse version: 5.7.0
- EVAL_RUNS: 5
- Download script: resources/DATA.md
- Git status: clean
- Git dirty: no

### Expected and observed file counts

| Group     | Expected | Found | Status  |
| --------- | -------- | ----- | ------- |
| NIEHS     | 4        | 4     | matches |
| PhenX     | 985      | 985   | matches |
| RareLink  | 1        | 1     | matches |
| SpyCATS   | 1        | 1     | matches |
| test_data | 1        | 1     | matches |

## 2. Overall result

| Metric                                  | Value                                    |
| --------------------------------------- | ---------------------------------------- |
| Total files                             | 992                                      |
| Successfully parsed                     | 992                                      |
| Git commit                              | 7bec7055c72f3afe645101065cf3dc1d4aee6786 |
| Package version                         | 1.0.1                                    |
| Oracle row count matches                | yes                                      |
| Oracle form count matches               | yes                                      |
| Oracle type histogram matches           | yes                                      |
| Round-trip model equality               | yes                                      |
| Original → export (string)              | no                                       |
| Original → export (cell values)         | no                                       |
| Export → re-read → export (string)      | yes                                      |
| Export → re-read → export (cell values) | yes                                      |
| Round-trip normalization (string)       | no                                       |
| Round-trip normalization (cell values)  | no                                       |

## 3. Group summary table

| Source    | Files | Forms | Fields | Counts agree | Model stable | Re-export identical | Source cells equal | Issues (E / W) |
| --------- | ----- | ----- | ------ | ------------ | ------------ | ------------------- | ------------------ | -------------- |
| NIEHS     | 4     | 45    | 2503   | 4            | 4            | 4                   | 4                  | 0 / 0          |
| PhenX     | 985   | 986   | 34638  | 985          | 985          | 985                 | 983                | 299 / 90       |
| RareLink  | 1     | 11    | 108    | 1            | 1            | 1                   | 1                  | 0 / 0          |
| SpyCATS   | 1     | 63    | 7958   | 1            | 1            | 1                   | 1                  | 0 / 0          |
| test_data | 1     | 1     | 83     | 1            | 1            | 1                   | 1                  | 0 / 0          |
| Total     | 992   | 1106  | 45290  | 992          | 992          | 992                 | 990                | 299 / 90       |

## 4. Group overview

| Group     | Files | Expected | Successfully parsed | Validation issues | Median runtime |
| --------- | ----- | -------- | ------------------- | ----------------- | -------------- |
| NIEHS     | 4     | 4        | 4                   | 0                 | 10.16 ms       |
| PhenX     | 985   | 985      | 985                 | 389               | 0.39 ms        |
| RareLink  | 1     | 1        | 1                   | 0                 | 2.93 ms        |
| SpyCATS   | 1     | 1        | 1                   | 0                 | 223.23 ms      |
| test_data | 1     | 1        | 1                   | 0                 | 1.76 ms        |

## 5. Individual files except PhenX

| File                                                                                         | Forms | Questions | Validation issues | Issue categories | Median total runtime | Round-trip model | Original → export (string) | Original → export (cells) | Export → re-read → export (string) | Export → re-read → export (cells) |
| -------------------------------------------------------------------------------------------- | ----- | --------- | ----------------- | ---------------- | -------------------- | ---------------- | -------------------------- | ------------------------- | ---------------------------------- | --------------------------------- |
| resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv                                   | 23    | 1684      | 0                 | -                | 52.23 ms             | equal            | different                  | equal                     | equal                              | equal                             |
| resources/NIEHS/COVID-19_Studies_Including_Pregnant_Participants_2023-11-15.csv              | 13    | 311       | 0                 | -                | 8.21 ms              | equal            | different                  | equal                     | equal                              | equal                             |
| resources/NIEHS/Post-Acute-Sequelae_of_SARS-CoV-2_in_Pregnancy_and_Postpartum_2023-11-15.csv | 8     | 460       | 0                 | -                | 12.11 ms             | equal            | different                  | equal                     | equal                              | equal                             |
| resources/NIEHS/RADx_Common_Data_Elements_2022-03-02.csv                                     | 1     | 48        | 0                 | -                | 0.96 ms              | equal            | different                  | equal                     | equal                              | equal                             |
| resources/RareLink/RareLink_v2_0_7.csv                                                       | 11    | 108       | 0                 | -                | 2.93 ms              | equal            | different                  | equal                     | equal                              | equal                             |
| resources/SpyCATS/SpyCATS_2022-12-20.csv                                                     | 63    | 7958      | 0                 | -                | 223.23 ms            | equal            | different                  | equal                     | equal                              | equal                             |
| resources/test_data/all_options_dictionary.csv                                               | 1     | 83        | 0                 | -                | 1.76 ms              | equal            | different                  | equal                     | equal                              | equal                             |

## 6. PhenX aggregates and anomalies

### Aggregate

| Group | Files | Forms | Questions | Median total runtime | Min total runtime | Max total runtime | Total runtime |
| ----- | ----- | ----- | --------- | -------------------- | ----------------- | ----------------- | ------------- |
| PhenX | 985   | 986   | 34638     | 0.85 ms              | 0.08 ms           | 22.57 ms          | 836.45 ms     |

### Largest 5 PhenX files by question count

| File                         | Questions | Forms | Median total runtime |
| ---------------------------- | --------- | ----- | -------------------- |
| resources/PhenX/PX230103.csv | 944       | 1     | 22.57 ms             |
| resources/PhenX/PX290601.csv | 811       | 1     | 18.58 ms             |
| resources/PhenX/PX290301.csv | 602       | 1     | 14.36 ms             |
| resources/PhenX/PX751201.csv | 594       | 1     | 13.47 ms             |
| resources/PhenX/PX150701.csv | 527       | 1     | 15.05 ms             |

### 5 slowest PhenX files

| File                         | Median total runtime | Questions | Forms |
| ---------------------------- | -------------------- | --------- | ----- |
| resources/PhenX/PX230103.csv | 22.57 ms             | 944       | 1     |
| resources/PhenX/PX290601.csv | 18.58 ms             | 811       | 1     |
| resources/PhenX/PX150701.csv | 15.05 ms             | 527       | 1     |
| resources/PhenX/PX081101.csv | 14.57 ms             | 506       | 1     |
| resources/PhenX/PX290301.csv | 14.36 ms             | 602       | 1     |

## 7. Empty choices by field type and group

| Group     | Radio empty | Dropdown empty | Checkbox empty |
| --------- | ----------- | -------------- | -------------- |
| NIEHS     | 0           | 0              | 0              |
| PhenX     | 12          | 0              | 0              |
| RareLink  | 0           | 0              | 0              |
| SpyCATS   | 0           | 0              | 0              |
| test_data | 0           | 0              | 0              |

## 8. Choice cells containing line breaks

| File                                   | Field type | Variable                  | Parser representation                                                                                                    |
| -------------------------------------- | ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| resources/RareLink/RareLink_v2_0_7.csv | dropdown   | ga4gh_progress_status     | ga4gh_unknown_progress:Unknown progress \| ga4gh_in_progress:In progress \| ga4gh_completed:Completed \| ga4gh_solved:Solve |
| resources/RareLink/RareLink_v2_0_7.csv | dropdown   | ga4gh_therap_action       | ga4gh_unknown_actionability:Unknown actionability \| ga4gh_not_actionable:Not actionable \| ga4gh_actionable:Actionable  |
| resources/RareLink/RareLink_v2_0_7.csv | dropdown   | snomedct_122869004_status | preparation:Preparation \| in-progress:In Progress \| not-done:Not Done \| on-hold:On Hold \| stopped:Stopped \| completed:Co |
| resources/RareLink/RareLink_v2_0_7.csv | dropdown   | rarelink_consent_contact  | snomedct_373066001:Yes \| snomedct_373067005:No \| snomedct_261665006:Unknown                                            |
| resources/RareLink/RareLink_v2_0_7.csv | dropdown   | rarelink_consent_data     | snomedct_373066001:Yes \| snomedct_373067005:No \| snomedct_261665006:Unknown                                            |
| resources/RareLink/RareLink_v2_0_7.csv | dropdown   | snomedct_123038009        | snomedct_373066001:Yes \| snomedct_373067005:No \| snomedct_261665006:Unknown                                            |

## 9. Field type coverage

| Field Type  | Occurrences |
| ----------- | ----------- |
| calc        | 16          |
| checkbox    | 1075        |
| descriptive | 1833        |
| dropdown    | 1134        |
| file        | 21          |
| notes       | 42          |
| radio       | 24297       |
| slider      | 2           |
| text        | 14802       |
| truefalse   | 1           |
| yesno       | 2067        |

## 10. Deviations and errors

| Group | Deviation count |
| ----- | --------------- |
| PhenX | 1               |

- resources/PhenX/PX031102.csv: Known source-structure discrepancy: the source fixture omits the final Field Annotation column, and the writer inserts it during round-trip.

## 11. Header resolution notes

- resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/NIEHS/COVID-19_Studies_Including_Pregnant_Participants_2023-11-15.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/NIEHS/Post-Acute-Sequelae_of_SARS-CoV-2_in_Pregnancy_and_Postpartum_2023-11-15.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/NIEHS/RADx_Common_Data_Elements_2022-03-02.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/PhenX/PX010101.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/PhenX/PX010102.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/PhenX/PX010201.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/PhenX/PX010301.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/PhenX/PX010401.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true
- resources/PhenX/PX010502.csv: firstHeader=Variable / Field Name; variableNameByHeader=true; formNameByHeader=true; fieldTypeByHeader=true

## 12. Limits of the evaluation

- No import of the written CSV into a REDCap instance; REDCap compatibility of the output is not checked.
- No comparison with other tools.
- Validator accuracy was not manually verified.
- Only public CSV files plus the locally authored test dictionary were evaluated.
- Runtime figures come from a machine without targeted GC control.
- Round-trip checks consistency within the package and not substantive correctness against REDCap.

## 13. Supporting findings from the run

- The run used the public files documented in DATA.md and the repository-local test dictionary.
- All individual values in the JSON file come from the current run and were not extrapolated.
