# Precision Report

- Environment: Docker container; Node v18.17.0; CPU 12th Gen Intel(R) Core(TM) i7-1260P (16 CPUs); memory 31.06 GiB visible. Runtime numbers from this container are not comparable with earlier host runs.
- Sample seed: 20261103
- Sample size per stratum: 30
- Metadata generation time: 2026-11-03T21:28:48.878Z
- Metadata commit: 84e4b39d992522ff2cd7946652cf6f6fb55a2b40
- Git HEAD: 84e4b39d992522ff2cd7946652cf6f6fb55a2b40
- Package version: 1.0.1
- Git dirty: yes

> Warning: working tree is dirty (ALLOW_DIRTY=1).
- Precision refers to the sample and its strata drawn from the full issue set and is not a corpus-wide claim.
- Sample size: 51 rows, issue strata: 2
- Total issues in corpus: 389

> Warning: 51 row(s) are unlabelled.


## 1. Precision by stratum

| Kind                          | Group | N_h | Sample n | TP | FP | Unclear | Unlabelled | Precision | 95% CI lower | 95% CI upper |
| ----------------------------- | ----- | --- | -------- | --- | --- | ------- | ---------- | --------- | ------------ | ------------ |
| dangling-reference            | PhenX | 75  | 30       | 0  | 0  | 0       | 30         | n/a       | n/a          | n/a          |
| possible-stale-choice-literal | PhenX | 21  | 21       | 0  | 0  | 0       | 21         | n/a       | n/a          | n/a          |

## 2. Precision by kind (weighted by stratum size; Wilson 95% CI)

| Kind                          | N_h total | Sample total | TP | FP | Unclear | Pooled precision | Pooled CI lower | Pooled CI upper | Weighted precision |
| ----------------------------- | --------- | ------------ | --- | --- | ------- | ---------------- | --------------- | --------------- | ------------------ |
| dangling-reference            | 75        | 30           | 0  | 0  | 0       | n/a              | n/a             | n/a             | n/a                |
| possible-stale-choice-literal | 21        | 21           | 0  | 0  | 0       | n/a              | n/a             | n/a             | n/a                |

- Weighted precision: $sum_h (N_h / N) 	imes p_h$ across labelled strata.
- Pooled precision is the overall TP/(TP+FP) ratio; weighted precision is the stratum-size-weighted average of stratum precisions.

## 3. Auto-label vs. manual label agreement

- Agreement rate: 0.0% (0/0)
- Auto-labels considered: empty means TP-like prelabel; non-empty means FP-like prelabel.

## 4. Cohen's kappa (second rater)

- Rows with both raters: 0
- Cohen's kappa: n/a

## 5. Dangling references with caseMismatchOf

| Group     | Dangling-reference issues with caseMismatchOf |
| --------- | --------------------------------------------- |
| NIEHS     | 0                                             |
| PhenX     | 72                                            |
| RareLink  | 0                                             |
| SpyCATS   | 0                                             |
| test_data | 0                                             |

- The labelling sample includes the caseMismatchOf column alongside case_mismatch_of for review.

## 6. Recall on injected defects

| Kind                          | Mutants | Distinct mutants | Detected | Recall / small sample | 95% CI lower | 95% CI upper | Undetected |
| ----------------------------- | ------- | ---------------- | -------- | --------------------- | ------------ | ------------ | ---------- |
| dangling-reference            | 10      | 10               | 10       | 100.0%                | 72.2%        | 100.0%       | -          |
| possible-stale-choice-literal | 10      | 10               | 10       | 100.0%                | 72.2%        | 100.0%       | -          |
| invalid-form-name             | 10      | 10               | 10       | 100.0%                | 72.2%        | 100.0%       | -          |
| malformed-choice-list         | 35      | 35               | 35       | 100.0%                | 90.1%        | 100.0%       | -          |

### Mutants and their base files

| Kind                          | Mutation ID                              | Base file                                                  | Target                          | Mutation                                                                            | Detected |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| dangling-reference            | 894be2588703101774820a1c4604faf4c9ab619c | resources/test_data/all_options_dictionary.csv             | text                            | renamed variable text to text_mutant_372ea0                                         | yes      |
| dangling-reference            | 6c51578c4bfe8c57bc91c759cf880b4015b8c82c | resources/test_data/all_options_dictionary.csv             | text_integer                    | renamed variable text_integer to text_integer_mutant_fcb145                         | yes      |
| dangling-reference            | 898085170a1c3c3e7be69fcbbb9c0ff23b909c5a | resources/test_data/all_options_dictionary.csv             | text_number                     | renamed variable text_number to text_number_mutant_79116e                           | yes      |
| dangling-reference            | cae9f31c6791d0c39016037d8b28f969f6199e1b | resources/test_data/all_options_dictionary.csv             | text_date_dmy                   | renamed variable text_date_dmy to text_date_dmy_mutant_d8ba22                       | yes      |
| dangling-reference            | 6c6085fc1f779f4a2f08a12db7210eeb3593424f | resources/test_data/all_options_dictionary.csv             | text_date_mdy                   | renamed variable text_date_mdy to text_date_mdy_mutant_728d70                       | yes      |
| dangling-reference            | 5ec7093ebf788464c071c884f56204833eb89605 | resources/test_data/all_options_dictionary.csv             | text_date_ymd                   | renamed variable text_date_ymd to text_date_ymd_mutant_1e4a60                       | yes      |
| dangling-reference            | 038d941ddbaffe13dcf2a567e917af029707695f | resources/test_data/all_options_dictionary.csv             | text_date_dmy_hm                | renamed variable text_date_dmy_hm to text_date_dmy_hm_mutant_2aa885                 | yes      |
| dangling-reference            | 600b64b36aa473ceb593df25482fda2c13da6c70 | resources/test_data/all_options_dictionary.csv             | text_date_mdy_hm                | renamed variable text_date_mdy_hm to text_date_mdy_hm_mutant_687cd4                 | yes      |
| dangling-reference            | 4854f9108d8261275f15c04cf13e6a49da1ac6cf | resources/test_data/all_options_dictionary.csv             | text_date_ymd_hm                | renamed variable text_date_ymd_hm to text_date_ymd_hm_mutant_211cff                 | yes      |
| dangling-reference            | 057c907498f413843aa3fda7ba659c101ea1ce37 | resources/test_data/all_options_dictionary.csv             | text_date_dmy_hms               | renamed variable text_date_dmy_hms to text_date_dmy_hms_mutant_f2c8c2               | yes      |
| possible-stale-choice-literal | 18a767408b61f644865b6582a61f95bb1cdc818d | resources/test_data/all_options_dictionary.csv             | mc_radio_bl                     | removed compared option code 2 from mc_radio_bl                                     | yes      |
| possible-stale-choice-literal | cb879702c06d259af115a0689dd1368812d19da7 | resources/test_data/all_options_dictionary.csv             | mc_dropdown_bl                  | removed compared option code 2 from mc_dropdown_bl                                  | yes      |
| possible-stale-choice-literal | b83a4be4dc129befe5a6a2680a0ac6131656950e | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | removed compared option code 2 from mc_checkbox_bl                                  | yes      |
| possible-stale-choice-literal | 7dfaab67193618d2cd3cea9d0164901c6f44f8d9 | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | removed compared option code 1 from mc_checkbox_bl                                  | yes      |
| possible-stale-choice-literal | 37b5afb14707cc3dd3db7dc98252ac4a93a13dad | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | ch_cond2                        | removed compared option code 96 from ch_cond2                                       | yes      |
| possible-stale-choice-literal | 3e9f9a0e0afa872fa672267e1e831ecc79cd3f65 | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | ch_neocond                      | removed compared option code 96 from ch_neocond                                     | yes      |
| possible-stale-choice-literal | 851872a05d235521c9f719e533460029f0fbfa87 | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | ch_othcomorb                    | removed compared option code 1 from ch_othcomorb                                    | yes      |
| possible-stale-choice-literal | 5505692920bcd23a57f7ed486ec6f71496e1439a | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | ch_covid_vac                    | removed compared option code 1 from ch_covid_vac                                    | yes      |
| possible-stale-choice-literal | 6d9047369a5984556a80216baa5b1e05ecb4d248 | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | ch_covid_vac_name               | removed compared option code 96 from ch_covid_vac_name                              | yes      |
| possible-stale-choice-literal | 2865d6ba8286fab473b4a9cd5d5401029ce670fe | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | ch_covid_vac_dose2              | removed compared option code 1 from ch_covid_vac_dose2                              | yes      |
| invalid-form-name             | 64670ffbaf3c2ac047d39a3c7362dc0678002bf6 | resources/test_data/all_options_dictionary.csv             | questionnaire_options           | uppercase letter: questionnaire_options → Xuestionnaire_options                     | yes      |
| invalid-form-name             | f53e9eb61a5aa5e935f3203e149dbfd29798ae89 | resources/test_data/all_options_dictionary.csv             | questionnaire_options           | hyphen: questionnaire_options → questionnaire_options-mutant                        | yes      |
| invalid-form-name             | 41e2b6537e76b4aee5cfc7b70e530d140e3aca97 | resources/test_data/all_options_dictionary.csv             | questionnaire_options           | leading digit: questionnaire_options → 1questionnaire_options                       | yes      |
| invalid-form-name             | d43e1e6487ad57f7462625510615b750e0a4bd93 | resources/test_data/all_options_dictionary.csv             | questionnaire_options           | space: questionnaire_options → questionnaire_options mutant                         | yes      |
| invalid-form-name             | 8713addbbebe32376a669908a8f74a158376dfc2 | resources/test_data/all_options_dictionary.csv             | questionnaire_options           | slash: questionnaire_options → questionnaire_options/mutant                         | yes      |
| invalid-form-name             | 59406fbb5b1577e5604fece980df567e8199eb08 | resources/test_data/all_options_dictionary.csv             | questionnaire_options           | non-ASCII letter: questionnaire_options → questionnaire_optionsé                    | yes      |
| invalid-form-name             | 7bdafde6f2992979a87c8e3d1a6446a4c9581e10 | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | biomedical_recommended_measures | uppercase letter: biomedical_recommended_measures → Xiomedical_recommended_measures | yes      |
| invalid-form-name             | 23691d069090313b25e2ebb2743d845a7de4d301 | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | biomedical_recommended_measures | hyphen: biomedical_recommended_measures → biomedical_recommended_measures-mutant    | yes      |
| invalid-form-name             | 131d9d76fbd97b418b45a347286124cd8298726a | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | biomedical_recommended_measures | leading digit: biomedical_recommended_measures → 1biomedical_recommended_measures   | yes      |
| invalid-form-name             | 5efc32d10c01f9f453aa82b47afb55bee9e84af4 | resources/NIEHS/COVID-19_Pediatric_Research_2022-03-04.csv | biomedical_recommended_measures | space: biomedical_recommended_measures → biomedical_recommended_measures mutant     | yes      |
| malformed-choice-list         | 45724e21d3701bdc98404795ef395fcb72a6f4d6 | resources/test_data/all_options_dictionary.csv             | mc_radio                        | rule=empty-element on mc_radio                                                      | yes      |
| malformed-choice-list         | 51652aea238bbfc25bd973d300b8b11f366829cb | resources/test_data/all_options_dictionary.csv             | mc_radio                        | rule=missing-code on mc_radio                                                       | yes      |
| malformed-choice-list         | 57273fe3fc04ec9dac335bb00470fc30c7a175ea | resources/test_data/all_options_dictionary.csv             | mc_radio                        | rule=empty-code on mc_radio                                                         | yes      |
| malformed-choice-list         | fa173f858ce919b84b1d38048c1d717d39b7ff00 | resources/test_data/all_options_dictionary.csv             | mc_radio                        | rule=duplicate-code on mc_radio                                                     | yes      |
| malformed-choice-list         | 5153d54c9724a7a7d2e812afe01a992d8e7e75e1 | resources/test_data/all_options_dictionary.csv             | mc_radio                        | rule=empty-label on mc_radio                                                        | yes      |
| malformed-choice-list         | 92ef4729df0a06a2eb2cd2f1d35d1056c08618e4 | resources/test_data/all_options_dictionary.csv             | mc_dropdown                     | rule=empty-element on mc_dropdown                                                   | yes      |
| malformed-choice-list         | eed7287864f3aeafe47172c9562d475b7fbd24f5 | resources/test_data/all_options_dictionary.csv             | mc_dropdown                     | rule=missing-code on mc_dropdown                                                    | yes      |
| malformed-choice-list         | e64c009f2c37df94595c4636ce13156fa238b483 | resources/test_data/all_options_dictionary.csv             | mc_dropdown                     | rule=empty-code on mc_dropdown                                                      | yes      |
| malformed-choice-list         | 321222e806c4735a8e6862bd2ea5bc5a38bcf7d6 | resources/test_data/all_options_dictionary.csv             | mc_dropdown                     | rule=duplicate-code on mc_dropdown                                                  | yes      |
| malformed-choice-list         | 1672da94640c188670a6c9de9f0a5b2987646a16 | resources/test_data/all_options_dictionary.csv             | mc_dropdown                     | rule=empty-label on mc_dropdown                                                     | yes      |
| malformed-choice-list         | a5e402acf897a70b75b9f0e4a2487702a2334c4d | resources/test_data/all_options_dictionary.csv             | mc_checkbox                     | rule=empty-element on mc_checkbox                                                   | yes      |
| malformed-choice-list         | b85bde90cbfb50fe4a4ca113ceb6e7d21b69cedf | resources/test_data/all_options_dictionary.csv             | mc_checkbox                     | rule=missing-code on mc_checkbox                                                    | yes      |
| malformed-choice-list         | 0c8fdecd74be062c0bcbebd263285808e0d13b01 | resources/test_data/all_options_dictionary.csv             | mc_checkbox                     | rule=empty-code on mc_checkbox                                                      | yes      |
| malformed-choice-list         | 165b4ae9afd7739181996be830546b78b6deed46 | resources/test_data/all_options_dictionary.csv             | mc_checkbox                     | rule=duplicate-code on mc_checkbox                                                  | yes      |
| malformed-choice-list         | 547900a2a84ebcd951a00860a04a2ee6c68d2c90 | resources/test_data/all_options_dictionary.csv             | mc_checkbox                     | rule=empty-label on mc_checkbox                                                     | yes      |
| malformed-choice-list         | c9a43dfc74154fdd0c98e01cab00cf2a8a9a6474 | resources/test_data/all_options_dictionary.csv             | mc_radio_bl                     | rule=empty-element on mc_radio_bl                                                   | yes      |
| malformed-choice-list         | 59a3c7b8ea67364cbf0da2c07f89f2ea3fc69907 | resources/test_data/all_options_dictionary.csv             | mc_radio_bl                     | rule=missing-code on mc_radio_bl                                                    | yes      |
| malformed-choice-list         | b746fefa0d77f5f478127d8f74fb7358e32948fc | resources/test_data/all_options_dictionary.csv             | mc_radio_bl                     | rule=empty-code on mc_radio_bl                                                      | yes      |
| malformed-choice-list         | e508c72fcb7dea16ccd456fe496ea6b847ed7884 | resources/test_data/all_options_dictionary.csv             | mc_radio_bl                     | rule=duplicate-code on mc_radio_bl                                                  | yes      |
| malformed-choice-list         | 0612a156312736da1da14feb2c035afb74451a2b | resources/test_data/all_options_dictionary.csv             | mc_radio_bl                     | rule=empty-label on mc_radio_bl                                                     | yes      |
| malformed-choice-list         | 95adee10984d8d3ea27702669f0526295245b857 | resources/test_data/all_options_dictionary.csv             | mc_dropdown_bl                  | rule=empty-element on mc_dropdown_bl                                                | yes      |
| malformed-choice-list         | cfd319aff3621f15be5ee6c6e29beb3660b30958 | resources/test_data/all_options_dictionary.csv             | mc_dropdown_bl                  | rule=missing-code on mc_dropdown_bl                                                 | yes      |
| malformed-choice-list         | 05cd39dcac9687124bcf7e6a515b9b1ce2fd05ef | resources/test_data/all_options_dictionary.csv             | mc_dropdown_bl                  | rule=empty-code on mc_dropdown_bl                                                   | yes      |
| malformed-choice-list         | 62c0b9d798a2f6b65a5b815ed88b93c0b5b90bfe | resources/test_data/all_options_dictionary.csv             | mc_dropdown_bl                  | rule=duplicate-code on mc_dropdown_bl                                               | yes      |
| malformed-choice-list         | 4293338bf43c2483d46d5bd779b996b09267f096 | resources/test_data/all_options_dictionary.csv             | mc_dropdown_bl                  | rule=empty-label on mc_dropdown_bl                                                  | yes      |
| malformed-choice-list         | c7ff48a333876a2759136a48da14889deabe81e0 | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | rule=empty-element on mc_checkbox_bl                                                | yes      |
| malformed-choice-list         | 2c3a485744deaaba8ae6e2b7e05843d81a153b2b | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | rule=missing-code on mc_checkbox_bl                                                 | yes      |
| malformed-choice-list         | e9a64e726b58e487245ea3e855f2e7cf1d4c0c86 | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | rule=empty-code on mc_checkbox_bl                                                   | yes      |
| malformed-choice-list         | e24fdd1032ff3f844cc16b3ecd259e29dcf8b538 | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | rule=duplicate-code on mc_checkbox_bl                                               | yes      |
| malformed-choice-list         | 58b6a4eaa9a6987ba9f41840662769199e5ecce0 | resources/test_data/all_options_dictionary.csv             | mc_checkbox_bl                  | rule=empty-label on mc_checkbox_bl                                                  | yes      |
| malformed-choice-list         | 42d369044bd60db15be74e06179a8f0e6de23e50 | resources/test_data/all_options_dictionary.csv             | mc_yn_emb                       | rule=empty-element on mc_yn_emb                                                     | yes      |
| malformed-choice-list         | aef5b5f8fc68d8e1c0c9d743b9d83bc3495f0dd6 | resources/test_data/all_options_dictionary.csv             | mc_yn_emb                       | rule=missing-code on mc_yn_emb                                                      | yes      |
| malformed-choice-list         | d6da66c3d201f6df0ceae8a7b798bbc0248a0da7 | resources/test_data/all_options_dictionary.csv             | mc_yn_emb                       | rule=empty-code on mc_yn_emb                                                        | yes      |
| malformed-choice-list         | 086b290a3809f4e43fba8f68013fea6645ebf7a0 | resources/test_data/all_options_dictionary.csv             | mc_yn_emb                       | rule=duplicate-code on mc_yn_emb                                                    | yes      |
| malformed-choice-list         | c0e1d29eab4824487db12564cd49d776d0c9cc68 | resources/test_data/all_options_dictionary.csv             | mc_yn_emb                       | rule=empty-label on mc_yn_emb                                                       | yes      |

## 7. Original PhenX validation notes

# Original PhenX validation notes

## PX030603.csv
- readFormsFromCSV throws: no
- message: n/a
- issues: malformed-choice-list:cigarettesmoking_adolescent_ever
- malformed-choice-list implicated: yes

## PX031001.csv
- readFormsFromCSV throws: no
- message: n/a
- issues: malformed-choice-list:current_smoker_more_enum, malformed-choice-list:current_smoker_more_enum
- malformed-choice-list implicated: yes

## PX710302.csv
- readFormsFromCSV throws: no
- message: n/a
- issues: malformed-choice-list:susceptibility_tobacco_cigarette_curiosity
- malformed-choice-list implicated: yes

