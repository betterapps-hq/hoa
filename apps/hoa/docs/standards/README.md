# Standards

Reference copies of the standards we're drawing on for the rule language: terms, provisions, rules and checks. Run
the commands below from this folder to fetch them again.

| Folder        | Standard                                  | Body       | Files                                                                                     |
| ------------- | ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `terms/`      | SKOS Reference (Recommendation, 2009)     | W3C        | `skos-reference.html`, `skos.rdf` (the vocabulary itself)                                 |
| `terms/`      | SBVR 1.5                                  | OMG        | `sbvr-1.5.pdf`                                                                            |
| `terms/`      | UCUM                                      | Regenstrief | `ucum-specification.html`, `ucum-essence.xml` (the unit table, machine-readable)         |
| `provisions/` | Akoma Ntoso (LegalDocML) Core 1.0         | OASIS      | `akn-core-v1.0-part1-vocabulary.pdf`, `akn-core-v1.0-part2-specs.pdf`, `akomantoso30.xsd` |
| `provisions/` | Akoma Ntoso Naming Convention 1.0         | OASIS      | `akn-naming-convention-v1.0.pdf` (provision ids and document IRIs)                        |
| `rules/`      | LegalRuleML Core Specification 1.0        | OASIS      | `legalruleml-core-spec-v1.0.pdf`                                                          |
| `checks/`     | DMN 1.5, including FEEL                   | OMG        | `dmn-1.5.pdf`, `DMN15.xsd`                                                                |

```bash
curl -sSfL -o terms/skos-reference.html https://www.w3.org/TR/skos-reference/
curl -sSfL -o terms/skos.rdf https://www.w3.org/2009/08/skos-reference/skos.rdf
curl -sSfL -o terms/sbvr-1.5.pdf https://www.omg.org/spec/SBVR/1.5/PDF
curl -sSfL -o terms/ucum-specification.html https://ucum.org/ucum
curl -sSfL -o terms/ucum-essence.xml https://raw.githubusercontent.com/ucum-org/ucum/main/ucum-essence.xml
curl -sSfL -o provisions/akn-core-v1.0-part1-vocabulary.pdf https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part1-vocabulary/akn-core-v1.0-os-part1-vocabulary.pdf
curl -sSfL -o provisions/akn-core-v1.0-part2-specs.pdf https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part2-specs/akn-core-v1.0-os-part2-specs.pdf
curl -sSfL -o provisions/akn-naming-convention-v1.0.pdf https://docs.oasis-open.org/legaldocml/akn-nc/v1.0/os/akn-nc-v1.0-os.pdf
curl -sSfL -o provisions/akomantoso30.xsd https://docs.oasis-open.org/legaldocml/akn-core/v1.0/os/part2-specs/schemas/akomantoso30.xsd
curl -sSfL -o rules/legalruleml-core-spec-v1.0.pdf https://docs.oasis-open.org/legalruleml/legalruleml-core-spec/v1.0/os/legalruleml-core-spec-v1.0-os.pdf
curl -sSfL -o checks/dmn-1.5.pdf https://www.omg.org/spec/DMN/1.5/PDF
curl -sSfL -o checks/DMN15.xsd https://www.omg.org/spec/DMN/20230324/DMN15.xsd
```
