# Database-first data sources for the knowledge graph

*Database-first* means: the knowledge graph (`api/app/graph.py`, Neo4j) is seeded from **structured sources**
deterministically - registers, guidelines, labelled corpora, the team's own decisions - and the contracts are then
linked to that backbone. The LLM refines and verifies; it never invents the backbone. Every seeded node carries a
`source` property (`registry`, `GLEIF`, `contract`, …), so a finding can always say where a fact came from.

The sweep below was done on 2026-09-05 with URL, licence and (where possible) live data checked. Verdicts are for the
two questions of the case study - *which contracts lack clause X?* and *which contracts still carry an old company
name?* - under the constraints of the problem statement (SharePoint, a store-only contract storage, Microsoft shop).

| Source | What it seeds | Access | Licence | Verdict |
| --- | --- | --- | --- | --- |
| **Corporate guideline** (`data/guidelines.json`) | `(ContractType)-[:REQUIRES]->(ClauseType)` | file, owned by Legal | internal | **used** |
| **Clause taxonomy + keywords** (`api/app/ingest/classify.py`) | `ClauseType {key, label, keywords}` | code | internal | **used** |
| **The team's decisions** | `Decision {decision, note, edited_text}` `-[:ON]->Contract`, `-[:ABOUT]->ClauseType` | the store (`api/app/db.py`) | internal | **used** - accepted wording becomes drafting precedent, notes become verifier precedent |
| **The contracts themselves** (ingest) | `Contract`, `Clause` (embedding + text), `IS_A`, `NEXT`, `MENTIONS` | pipeline | internal | **used** |
| **GLEIF - the Global LEI register** | `Entity {name, kind, lei}` and `(old)-[:RENAMED_TO]->(current)` | REST API `api.gleif.org/api/v1/lei-records` (no key), daily Golden Copy files | **CC0** | **used** - the rename question answered from a public register, see below |
| SharePoint library metadata (Graph `listItem/fields`) | properties on `Contract` (owner, counterparty, validity, folder) | Microsoft Graph, same app registration as the delta sync (`api/app/sources.py`) | internal | next - the delta sync already fetches the items; their columns are one more field selection |
| Contract storage (REST) | `Contract.storage_ref` (which copy was filed) | the storage's API (`report.storage`) | internal | next - already recorded on the Contract node (`report.storage`), one edge away |
| Legal's template / clause library | `(ClauseType)-[:EXEMPLAR]->(Exemplar)` - the house wording per clause type | SharePoint / DMS | internal | next - the best retrieval prototypes are the team's own standards |
| OffeneRegister.de (German Handelsregister as open data, OKF / OpenCorporates) | counterparties: register number, seat, officers | bulk download (SQLite/JSON dump; data mostly 2017-2019) | open data | one-off enrichment of German counterparties; the official register has no open API |
| OpenCorporates | counterparties world-wide, previous names, status | REST API | free for open-data projects, commercial licence otherwise | when budget exists; the German data overlaps OffeneRegister |
| Companies House (UK) | UK counterparties and Riverty UK entities, previous names | free REST API with key, 600 requests / 5 min | OGL | for UK entities only |
| Wikidata | group structure: `P749` parent, `P355` subsidiary, `P1365/P1366` replaces / replaced by, `P1448` official name with dates | SPARQL endpoint | **CC0** | enrichment of the corporate tree; low authority, never the source of a rename finding |
| EUR-Lex / Cellar (Publications Office) | `Norm` nodes: GDPR = CELEX `32016R0679`, article level (Art. 28 → `data_protection`) | SPARQL endpoint, ELI URIs | EU reuse (attribution) | next - `(ClauseType)-[:GROUNDED_IN]->(Norm)` lets the verifier cite the norm and the guideline owner see *why* a clause is required |
| gesetze-im-internet.de | German statutes as XML: BGB §§ 305-310 (AGB control), §§ 675c ff. (payment services), StGB § 299 (anti-corruption) | XML download per law (`gii-toc.xml`) | free use, source named | next - same `Norm` nodes for German law |
| CUAD v1 (The Atticus Project) | exemplar clauses per category (Governing Law, Cap on Liability, Audit Rights, Change of Control, Anti-Assignment map 1:1), real absence labels | 510 SEC contracts, already in `data/real/` | **CC BY 4.0** | used for evaluation (`docs/ps-coverage.md`); exemplars as `ClauseType` prototypes next |
| LEDGAR (LexGLUE) | 12.6k provision labels from SEC contracts - training data for the clause classifier | Hugging Face `coastalcph/lex_glue` | **CC BY 4.0** | later - replace keyword rules by a small classifier once the team's corpus is labelled |
| ContractNLI (Stanford) | 17 hypotheses about NDAs ("the receiving party may share confidential information with employees", …) - ready-made *Regelung fehlt* query templates with entailment / contradiction / not mentioned labels | GitHub `stanfordnlp/contract-nli` | **CC BY 4.0** | next - seed `Query` nodes for the free-text passage search |
| MAUD, UCSF Industry Documents, North Data | merger agreements; scanned real-world contracts; commercial register aggregator | - | MAUD CC BY 4.0; UCSF no open licence; North Data commercial | not used: low alignment, no licence, or paid |

## GLEIF: the rename question is a register fact

The case study's example - a company name that needs updating - is, for Riverty, the 2022/2023 rebrand from the
arvato Financial Solutions entities. The LEI register records exactly that as `PREVIOUS_LEGAL_NAME` on each entity
(checked live on 2026-09-05, `filter[entity.legalName]=Riverty`, 8 records):

| LEI | Legal name today | Previous legal name |
| --- | --- | --- |
| 5299000OGZU8QU22ZH28 | Riverty GmbH (Verl, HRB 9923) | Arvato Payment Solutions GmbH |
| 529900G05F6Z5CZ1CI89 | Riverty Group GmbH (Baden-Baden) | arvato infoscore GmbH |
| 5967007LIEEXZX6G2G21 | Riverty Norway AS | Arvato Finance AS |
| 5299006YWZO87P0D2244 | Riverty Sweden AB | arvato Finance AB |
| 529900W1DCQ03L4Y3932 | Riverty Group Sweden AB | arvato Holding AB |
| 89450085BKPB2A2XZE44 | Riverty Bank S.A. (Luxembourg) | RM Luxembourg S.A. |
| 8945009VD3SPI4I93D64 | Riverty Finland Oy | - |
| 894500QH905T4IDKEH85 | Riverty Services Netherlands B.V. | - |

These rows are the seed in `api/app/graph.py` (`GLEIF`, so the seed works offline) and `POST /api/graph/gleif`
refreshes them from the live API. Two things follow for the pipeline: the rule layer's name registry
(`api/app/ingest/entities.py`, `registry()`) is extended with every name the graph holds, and the suggestion for an
old name is the register's successor (`RENAMED_TO`) - *arvato Finance AB → Riverty Sweden AB*, not a blanket
"Riverty GmbH". The brand names that are not legal names (*arvato Financial Solutions*, *AFS*) stay in the built-in
list; the unrelated *Arvato Systems GmbH* stays a `third_party`.

## How the graph uses the sources

```
(ContractType {key})-[:REQUIRES]->(ClauseType {key, label, keywords})        <- guideline, taxonomy
(Contract)-[:OF_TYPE]->(ContractType)                                          <- ingest
(Contract)-[:HAS_CLAUSE]->(Clause {text, embedding, page_no})-[:IS_A]->(ClauseType), (Clause)-[:NEXT]->(Clause)
(Contract)-[:MENTIONS {page, historical}]->(Entity {name, kind, lei, source})  <- ingest, registry, GLEIF
(Entity)-[:RENAMED_TO {lei, source}]->(Entity)                                 <- GLEIF
(Decision {decision, note, text})-[:ON]->(Contract), (Decision)-[:ABOUT]->(ClauseType)  <- the team
```

*Which contracts lack a required clause?* is then one pattern, no search:
`MATCH (c:Contract)-[:OF_TYPE]->()-[:REQUIRES]->(t) WHERE NOT EXISTS { (c)-[:HAS_CLAUSE]->()-[:IS_A]->(t) }`
(`GET /api/graph/gaps`). And what a model gets to read is what the graph selects (`graph.context`,
`graph.draft_context`): the contract's outline plus the relevant clauses, the neighbours at the insertion point, and
the wording the team accepted before - not the whole contract.

## Sources

- GLEIF API: https://documenter.getpostman.com/view/7679680/SVYrrxuU · open data (CC0): https://www.gleif.org/en/about/open-data · Golden Copy files: https://www.gleif.org/en/lei-data/gleif-golden-copy/download-the-golden-copy · LEI-CDF 3.1 (`PREVIOUS_LEGAL_NAME`): https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-1-data-lei-cdf-3-1-format
- OffeneRegister: https://offeneregister.de/daten/ · OpenCorporates: https://opencorporates.com/plug-in-our-data/ , https://opencorporates.com/pricing/ · Companies House API: https://developer.company-information.service.gov.uk/overview
- Wikidata `replaced by` (P1366): https://www.wikidata.org/wiki/Property:P1366 · WikiProject Companies: https://www.wikidata.org/wiki/Wikidata:WikiProject_Companies
- Cellar / EUR-Lex: https://op.europa.eu/en/web/eu-vocabularies/cellar , https://eur-lex.europa.eu/eli-register/technical_information.html
- LEDGAR in LexGLUE (CC BY 4.0): https://huggingface.co/datasets/coastalcph/lex_glue · ContractNLI (CC BY 4.0): https://github.com/stanfordnlp/contract-nli , https://stanfordnlp.github.io/contract-nli/
- Neo4j: vector indexes https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/ · `SEARCH` clause https://neo4j.com/docs/cypher-manual/current/clauses/search/ · calendar versioning https://feedback.neo4j.com/changelog/important-update-calendar-versioning-cypher-25 · Docker tags https://hub.docker.com/_/neo4j · Aura on cloud marketplaces https://neo4j.com/docs/aura/cloud-providers/ · pricing https://neo4j.com/pricing/
