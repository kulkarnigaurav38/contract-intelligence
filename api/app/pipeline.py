"""The stages every contract goes through, described once - the API serves this list and the check graph is built
from the same ids, so the 'So funktioniert es' page can never drift from the code."""

from app import llm
from app.config import settings

STAGES = [
    # ---- read (app/ingest/pipeline.py)
    {"id": "load", "phase": "read", "tools": "PyMuPDF", "task": None,
     "title": {"de": "Datei lesen", "en": "Read the file"},
     "text": {"de": "Jede Seite wird einzeln betrachtet: Hat sie eine Textebene, wird der Text direkt übernommen. Sonst wird die Seite als Bild weitergegeben – auch mitten in einem digitalen PDF (z. B. eine gescannte Unterschriftenseite). JPEGs sind eine Bildseite.",
              "en": "Every page is looked at on its own: if it has a text layer, the text is taken as is. Otherwise the page goes on as an image – even in the middle of a digital PDF (a scanned signature page, say). A JPEG is one image page."},
     "produces": {"de": "Text je Seite oder Seitenbild", "en": "text per page, or a page image"}},
    {"id": "ocr", "phase": "read", "tools": "Tesseract (eng+deu) · Gemini Vision", "task": "ocr_vision",
     "title": {"de": "Texterkennung", "en": "Text recognition"},
     "text": {"de": "Bildseiten liest zuerst Tesseract. Drei Gates entscheiden, ob das Ergebnis reicht: Wortkonfidenz, Textmenge und Tinte ohne erkannte Wörter (verblasste Hälfte, Schräglage). Fällt eines, liest das Vision-Modell die Seite als Bild – so werden Handschrift und Fotos lesbar. Was auch dann nicht geht, heißt „nicht lesbar“ statt geraten.",
              "en": "Image pages go to Tesseract first. Three gates decide whether that is good enough: word confidence, amount of text, and ink without recognised words (a faded half, skew). If one fails, the vision model reads the page as an image – that is how handwriting and photos become readable. What still cannot be read is called 'unreadable' rather than guessed."},
     "produces": {"de": "Text je Seite mit Methode und Verlässlichkeit", "en": "text per page with method and confidence"}},
    {"id": "segment", "phase": "read", "tools": "Regeln (Nummerierung, Überschriften, §, Unterschriftenblöcke)", "task": None,
     "title": {"de": "In Klauseln zerlegen", "en": "Split into clauses"},
     "text": {"de": "Der Text wird an Nummerierungen, Überschriften und §-Zeichen in Klauseln geschnitten; Unterschriftenblöcke werden abgetrennt, damit sie nicht an der letzten Klausel kleben.",
              "en": "The text is cut into clauses at numbering, headings and § signs; signature blocks are separated so they do not stick to the last clause."},
     "produces": {"de": "Klauseln mit Seite und Überschrift", "en": "clauses with page and heading"}},
    {"id": "classify", "phase": "read", "tools": "Regeln · Gemini Flash", "task": "classify",
     "title": {"de": "Klauseln einordnen", "en": "Label the clauses"},
     "text": {"de": "Jede Klausel wird einem von zwölf Standardtypen zugeordnet (Haftungsbegrenzung, Datenschutz, …) – zuerst nach Schlüsselwörtern, dann vom Modell. Stimmen beide überein, gilt die Zuordnung als sicher; sonst als unsicher, und die Gegenprüfung entscheidet später.",
              "en": "Each clause is assigned one of twelve standard types (limitation of liability, data protection, …) – by keywords first, then by the model. When both agree the label counts as certain; otherwise as uncertain, and the cross-check decides later."},
     "produces": {"de": "Klauseltyp und Sicherheit je Klausel", "en": "clause type and certainty per clause"}},
    {"id": "entities", "phase": "read", "tools": "Namensregister · Gemini Flash", "task": "extract",
     "title": {"de": "Vertragsdaten und Firmennamen", "en": "Contract data and company names"},
     "text": {"de": "Titel, Vertragsart, Sprache und Parteien werden erkannt. Ein Register der alten Namen (arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS) findet jede Erwähnung – auf OCR-Seiten auch mit Schreibfehlern – und unterscheidet Vertragspartei von historischem Verweis („vormals …“).",
              "en": "Title, contract type, language and parties are recognised. A register of the old names (arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS) finds every mention – on OCR pages even with misspellings – and tells a contracting party from a historical reference ('formerly …')."},
     "produces": {"de": "Vertragsart, Parteien, Namensfunde je Seite", "en": "contract type, parties, name hits per page"}},
    {"id": "screen", "phase": "read", "tools": "Gemini Flash-Lite · SHA-256 · Protokoll", "task": "screen",
     "title": {"de": "Verdächtigen Text erkennen", "en": "Screen for suspicious text"},
     "text": {"de": "Text, der sich an Prüfsysteme richtet („ignoriere die Anweisungen …“), wird erkannt und markiert; er wird nie befolgt. Die Datei bekommt eine Prüfsumme, jeder Schritt einen Protokolleintrag.",
              "en": "Text addressed to review systems ('ignore the instructions …') is detected and flagged; it is never followed. The file gets a checksum, every step a log entry."},
     "produces": {"de": "Warnhinweis, Prüfsumme, Protokoll", "en": "warning flag, checksum, log"}},
    {"id": "embed", "phase": "read", "tools": "Neo4j (Wissensgraph mit Vektor- und Volltextindex) · gemini-embedding-001", "task": "embed",
     "title": {"de": "Wissensgraph aufbauen", "en": "Build the knowledge graph"},
     "text": {"de": "Vertrag, Seiten, Klauseln in ihrer Reihenfolge, Klauseltypen, Vertragsart und alle Firmennamen werden als Knoten und Kanten in den Wissensgraphen geschrieben – er ist die Datenbank; jede Klausel trägt ihren Vektor und ihren Text im Index. Die Richtlinie ist darin eine Kante von der Vertragsart zum erforderlichen Klauseltyp, das Namensregister kommt aus dem öffentlichen LEI-Register (GLEIF: „Arvato Payment Solutions GmbH“ ist dort der frühere Name der Riverty GmbH). So ist „welchem Vertrag fehlt X“ eine Graphabfrage, und die Modelle bekommen später nur die Stellen, die der Graph auswählt.",
              "en": "The contract, its pages, its clauses in order, their types, the contract type and every company name go into the knowledge graph as nodes and edges – it is the database; every clause carries its vector and its text in the index. The guideline is an edge from the contract type to the required clause type, and the name register comes from the public LEI register (GLEIF, where 'Arvato Payment Solutions GmbH' is the previous name of Riverty GmbH). 'Which contract lacks X' becomes a graph query, and the models later receive only the passages the graph selects."},
     "produces": {"de": "Wissensgraph je Vertrag, durchsuchbare Klauseln", "en": "knowledge graph per contract, searchable clauses"}},
    # ---- check (app/report.py graph)
    {"id": "rules", "phase": "check", "tools": "Richtlinie (data/guidelines.json)", "task": None,
     "title": {"de": "Regelprüfung", "en": "Rule check"},
     "text": {"de": "Die Richtlinie sagt, welche Klauseltypen diese Vertragsart braucht. Jeder erforderliche Typ ohne sichere Klausel wird als Fund notiert – ebenso jede aktive Erwähnung eines alten Firmennamens. Alles deterministisch und nachvollziehbar.",
              "en": "The guideline says which clause types this contract type needs. Every required type without a certain clause is noted as a finding – as is every active mention of an old company name. All deterministic and traceable."},
     "produces": {"de": "Kandidaten: fehlende Klauseln, alte Namen", "en": "candidates: missing clauses, old names"}},
    {"id": "cross_check", "phase": "check", "tools": "Gemini Pro (hohes Nachdenken) · Wissensgraph · Präzedenzfälle", "task": "verify",
     "title": {"de": "KI-Gegenprüfung an den einschlägigen Stellen", "en": "AI cross-check of the relevant passages"},
     "text": {"de": "Für jeden Kandidaten liest das stärkste Modell nicht den ganzen Vertrag, sondern die Gliederung (jede Klausel mit Typ und Seite) und die Klauseln, die der Wissensgraph als einschlägig auswählt – nach Bedeutung und Wortlaut; beim alten Firmennamen die Stellen, an denen er vorkommt, samt Präambel und Unterschriften. Es bestätigt, verwirft oder sagt „nur teilweise“ – mit Seite, Zitat und Begründung in Ihrer Sprache. Frühere Entscheidungen des Teams zur gleichen Fundart gehen als Präzedenzfälle mit. Nur diese Prüfung darf einen Kandidaten entfernen – und bevor sie eine Klausel als fehlend bestätigt, liest sie doch noch den ganzen Vertrag: lieber eine Lesung zu viel als ein Fehlalarm bei der Juristin.",
              "en": "For every candidate the strongest model does not read the whole contract but the outline (every clause with its type and page) and the clauses the knowledge graph selects as relevant – by meaning and by wording; for an old company name the places it appears, with the preamble and the signatures. It confirms, dismisses or says 'only partly' – with page, quote and reasoning in your language. The team's earlier decisions on the same kind of finding go along as precedents. Only this check may remove a candidate – and before it confirms a clause as missing it does read the whole contract after all: one read too many rather than a false alarm on the lawyer's desk."},
     "produces": {"de": "bestätigte Funde mit Begründung", "en": "confirmed findings with reasoning"}},
    {"id": "place", "phase": "check", "tools": "PyMuPDF-Textebene · Tesseract-Wortboxen · Gemini Flash", "task": "locate",
     "title": {"de": "Fundstellen verorten", "en": "Place the findings"},
     "text": {"de": "Jeder Fund bekommt eine Stelle auf der Seite: der alte Name als exakter Kasten (aus der Textebene, bei Scans aus den OCR-Wortpositionen, bei Handschrift vom Modell), die fehlende Klausel als Einfügelinie unter der letzten Klausel. Findet sich keine sichere Stelle, wird die Seite markiert – nie ein geratener Kasten.",
              "en": "Every finding gets a place on the page: the old name as an exact box (from the text layer, on scans from the OCR word positions, on handwriting from the model), the missing clause as an insertion line below the last clause. If no reliable place is found, the page is marked – never a guessed box."},
     "produces": {"de": "Kasten oder Einfügelinie je Fund", "en": "a box or insertion line per finding"}},
    {"id": "draft", "phase": "check", "tools": "Gemini Flash · Wissensgraph", "task": "draft",
     "title": {"de": "Vorschlag formulieren", "en": "Draft the suggestion"},
     "text": {"de": "Für einen alten Namen ist der Vorschlag der heutige Name aus dem Register (Arvato Payment Solutions GmbH → Riverty GmbH). Für eine fehlende Klausel entwirft das Modell eine marktübliche Klausel in Sprache, Nummerierung und Begriffen des Vertrags – es bekommt dafür die Gliederung, die Präambel, die Nachbarklauseln an der Einfügestelle und Formulierungen, die das Team bei gleichartigen Verträgen schon übernommen hat; bei „nur teilweise“ eine Ergänzung. Ein Ausgangspunkt für die Juristin, nie die Endfassung.",
              "en": "For an old name the suggestion is today's name from the register (Arvato Payment Solutions GmbH → Riverty GmbH). For a missing clause the model drafts a market-standard clause in the contract's language, numbering and terms – it receives the outline, the preamble, the neighbouring clauses at the insertion point and wording the team has already accepted in contracts of the same type; for 'only partly' an amendment. A starting point for the lawyer, never the final wording."},
     "produces": {"de": "Vorschlagstext je Fund", "en": "a suggestion text per finding"}},
    {"id": "policy", "phase": "check", "tools": "Entscheidungsregeln (app/policy.py, app/learning.py)", "task": None,
     "title": {"de": "Was das Team schon entschieden hat", "en": "What the team has already decided"},
     "text": {"de": "Wurde dieselbe Datei schon einmal geprüft, gelten die früheren Entscheidungen weiter. Einer Fundart, der das Team acht Mal in Folge zugestimmt hat (≥ 95 %), wird nur noch eine Stichprobe vorgelegt (20 %, später 10 %; mindestens eine je Vertrag) – der Rest gilt als übernommen, sichtbar und jederzeit umkehrbar. Ein „Nicht zutreffend“ setzt die Fundart zurück.",
              "en": "If the same file was checked before, the earlier decisions still apply. A kind of finding the team has agreed with eight times in a row (≥ 95 %) is only spot-checked (20 %, later 10 %; at least one per contract) – the rest counts as accepted, visible and reversible at any time. One 'not applicable' resets the kind."},
     "produces": {"de": "Entscheidungsstatus je Fund: offen, übernommen, Stichprobe", "en": "decision state per finding: open, accepted, spot check"}},
    # ---- decide (the contract page, app/correct.py)
    {"id": "decide", "phase": "decide", "tools": "Vertragsseite · Decision-Knoten im Graphen", "task": None,
     "title": {"de": "Entscheidung auf der Seite", "en": "Decision on the page"},
     "text": {"de": "Die Juristin sieht den Fund im PDF selbst, liest Zitat und Begründung, ändert den Vorschlag bei Bedarf und entscheidet: Übernehmen oder Nicht zutreffend (mit Begründung). Jede Entscheidung wird je Datei und Fundart gespeichert – für den nächsten Vertrag und als Präzedenzfall für die Gegenprüfung.",
              "en": "The lawyer sees the finding in the PDF itself, reads quote and reasoning, edits the suggestion if needed and decides: accept or not applicable (with a note). Every decision is stored per file and per kind of finding – for the next contract and as a precedent for the cross-check."},
     "produces": {"de": "gespeicherte Entscheidung, Präzedenzfall", "en": "stored decision, precedent"}},
    {"id": "correct", "phase": "decide", "tools": "PyMuPDF · Vertragsablage-API (Idempotency-Key)", "task": None,
     "title": {"de": "Korrigierte Kopie", "en": "Corrected copy"},
     "text": {"de": "Aus den übernommenen Vorschlägen entsteht eine Kopie: in digitalen PDFs wird der alte Name an Ort und Stelle ersetzt, neue Klauseln stehen auf einer Nachtragsseite mit Notiz an der Einfügestelle; bei Scans bleiben es Markierungen und Kommentare. Das Original wird nie verändert. Die Kopie lässt sich herunterladen oder mit einem Klick in der Vertragsablage speichern – dieselbe Kopie immer nur einmal.",
              "en": "The accepted suggestions become a copy: in digital PDFs the old name is replaced in place, new clauses go on an addendum page with a note at the insertion point; on scans they remain marks and comments. The original is never changed. The copy can be downloaded or filed in the contract storage with one click – the same copy only ever once."},
     "produces": {"de": "korrigierte Kopie, Ablage-Referenz", "en": "corrected copy, storage reference"}},
]


# The technical layer of the same stages, for the 'Technik' page: which module runs, and the exact rules and thresholds.
TECH = {
    "load": {"module": "app/ingest/loader.py",
             "detail": {"de": "PyMuPDF. Textebene gilt ab 40 Zeichen; sonst das Seitenbild – der eingebettete Scan in Originalauflösung oder ein 200-dpi-Rendering. Eingabetyp: digital_pdf | scanned_pdf | mixed_pdf | image.",
                        "en": "PyMuPDF. A text layer counts from 40 characters; otherwise the page image – the embedded scan at native resolution or a 200-dpi render. Input type: digital_pdf | scanned_pdf | mixed_pdf | image."}},
    "ocr": {"module": "app/ingest/ocr.py",
            "detail": {"de": "Tesseract eng+deu mit Wortkonfidenz. Eskalation zum Vision-Modell unter 80 % Konfidenz, unter 20 Wörtern oder 400 Zeichen, oder bei Tintenbändern ohne erkannte Wörter (8 Bänder, Schwelle 40 % des dichtesten). Ohne Modell gilt eine Seite unter 50 % als nicht lesbar. Microsoft-Pfad: Azure AI Document Intelligence prebuilt-read.",
                       "en": "Tesseract eng+deu with word confidence. Escalation to the vision model below 80 % confidence, below 20 words or 400 characters, or when an ink band has no recognised words (8 bands, threshold 40 % of the densest). Without a model a page below 50 % counts as unreadable. Microsoft path: Azure AI Document Intelligence prebuilt-read."}},
    "segment": {"module": "app/ingest/segment.py",
                "detail": {"de": "Regex-Grenzen am Zeilenanfang: „1.“, „12)“, „§ 3“; Unterschriftenblöcke „For X:“ / „Für X:“ als eigene Segmente; Überschrift bis 8 Wörter; eine Klausel darf Seiten überspannen (Seite = Beginn).",
                           "en": "Regex boundaries at line start: '1.', '12)', '§ 3'; signature blocks 'For X:' / 'Für X:' as their own segments; heading up to 8 words; a clause may span pages (page = where it starts)."}},
    "classify": {"module": "app/ingest/classify.py",
                 "detail": {"de": "Schlüsselwortregeln (Treffer in der Überschrift zählen dreifach) ergeben Label und Konfidenz; Gemini Flash labelt dieselben Klauseln mit strukturierter Ausgabe. Übereinstimmung: max(Konfidenz) + 0,05 (höchstens 0,99); Widerspruch: das Modell-Label mit höchstens 0,7. Ab 0,9 gilt eine Klausel als sicher vorhanden.",
                            "en": "Keyword rules (a hit in the heading counts three times) give label and confidence; Gemini Flash labels the same clauses with structured output. Agreement: max(confidence) + 0.05 (at most 0.99); disagreement: the model's label at no more than 0.7. From 0.9 a clause counts as certainly present."}},
    "entities": {"module": "app/ingest/entities.py · app/graph.py (registry)",
                 "detail": {"de": "Register = eingebaute Liste + Entity-Knoten des Graphen (GLEIF-Namen), längste zuerst; exakte Treffer überall, auf OCR-Seiten zusätzlich fuzzy (SequenceMatcher ≥ 0,8 über Wort-n-Gramme); „vormals/formerly“ vor dem Namen = historisch; Rechtsform-Regex (GmbH, AG, B.V., …) für Gegenparteien. Gemini Flash extrahiert Titel, Vertragsart, Sprache und Parteien.",
                            "en": "Register = built-in list + the graph's Entity nodes (GLEIF names), longest first; exact hits everywhere, on OCR pages also fuzzy (SequenceMatcher ≥ 0.8 over word n-grams); 'formerly/vormals' before the name = historical; legal-form regex (GmbH, AG, B.V., …) for counterparties. Gemini Flash extracts title, contract type, language and parties."}},
    "screen": {"module": "app/ingest/screen.py · app/llm.py (DOC_GUARD)",
               "detail": {"de": "Musterregex („ignore previous instructions“, „AI reviewer“, …) → Verdacht; sonst fragt Gemini Flash-Lite. Jeder Prompt trägt DOC_GUARD: Text in <document> ist Daten, keine Anweisung. SHA-256 der Datei; ein AuditLog-Knoten je Schritt.",
                          "en": "Pattern regex ('ignore previous instructions', 'AI reviewer', …) → suspicion; otherwise Gemini Flash-Lite is asked. Every prompt carries DOC_GUARD: text inside <document> is data, not instruction. SHA-256 of the file; one AuditLog node per step."}},
    "embed": {"module": "app/ingest/embed.py · app/db.py (Store) · app/graph.py",
              "detail": {"de": "gemini-embedding-001, 768 Dimensionen (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY); offline ein gehashter Bag-of-Words-Vektor. Ein Commit schreibt Contract, Pages, Clauses mit IS_A und NEXT, MENTIONS in einer Transaktion; Vektorindex (cosine) und Volltextindex (Lucene) auf Clause; OF_TYPE zum ContractType, dessen REQUIRES-Kanten aus data/guidelines.json kommen.",
                         "en": "gemini-embedding-001, 768 dimensions (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY); offline a hashed bag-of-words vector. One commit writes Contract, Pages, Clauses with IS_A and NEXT, MENTIONS in one transaction; vector index (cosine) and full-text index (Lucene) on Clause; OF_TYPE to the ContractType whose REQUIRES edges come from data/guidelines.json."}},
    "rules": {"module": "app/report.py (_rules) · app/graph.py (gaps)",
              "detail": {"de": "required_for(Vertragsart) = Regeln unter „*“ ∪ Regeln der Vertragsart. Je Typ zählt die sicherste Klausel: ≥ 0,9 vorhanden, darunter unsicher (Gegenprüfung), keine = fehlend. Alte Namen: aktive, nicht historische Erwähnungen, einmal je Seite. Über alle Verträge: MATCH (c)-[:OF_TYPE]->()-[:REQUIRES]->(t) WHERE NOT EXISTS { (c)-[:HAS_CLAUSE]->()-[:IS_A]->(t) }.",
                         "en": "required_for(contract type) = rules under '*' ∪ rules of the type. Per type the most certain clause counts: ≥ 0.9 present, below that uncertain (cross-check), none = missing. Old names: active, non-historical mentions, once per page. Across contracts: MATCH (c)-[:OF_TYPE]->()-[:REQUIRES]->(t) WHERE NOT EXISTS { (c)-[:HAS_CLAUSE]->()-[:IS_A]->(t) }."}},
    "cross_check": {"module": "app/report.py (_cross_check) · app/graph.py (context) · app/audits/verify.py (verify_absence)",
                    "detail": {"de": "Kontext aus dem Graphen: die Gliederung (jede Klausel mit Typ und Seite) + die 6 einschlägigsten Klauseln (RRF aus Kosinus-Ähnlichkeit und Wort-Treffern) + alle Klauseln des gesuchten Typs; bei Namen jede Klausel mit dem Namen, Präambel und Unterschriften. Gemini Pro mit strukturierter Ausgabe: confirmed | refuted | partial, Seite, Zitat, Begründung. Bleibt eine Klausel „fehlend“, folgt eine zweite Lesung mit dem ganzen Vertrag (entfällt, wenn die Auswahl ≥ 90 % des Textes deckt). Präzedenzfälle: die letzten 3 Entscheidungen mit Notiz derselben Klasse. Ausfall des Anbieters: Rückzug auf die Regelprüfung, Wiederholung beim nächsten Start.",
                               "en": "Context from the graph: the outline (every clause with type and page) + the 6 most relevant clauses (RRF over cosine similarity and word hits) + every clause of the type in question; for names every clause containing the name, the preamble and the signatures. Gemini Pro with structured output: confirmed | refuted | partial, page, quote, reasoning. If a clause still counts as missing, a second read with the whole contract follows (skipped when the selection covers ≥ 90 % of the text). Precedents: the last 3 decisions with a note in the same class. Provider outage: back to the rule result, repeated at the next start."}},
    "place": {"module": "app/locate.py",
              "detail": {"de": "Textebene: page.search_for mit Ganzwort- und Groß-/Kleinschreibungs-Prüfung. Scan: Tesseract-Wortboxen, je Wort ≥ 0,72 Ähnlichkeit, mindestens 70 % der Wörter. Sonst Gemini Flash mit box_2d [ymin, xmin, ymax, xmax] auf 0–1000. Einfügelinie unter der letzten Sachklausel oder über den Unterschriften. Nichts Sicheres → Banner auf der Seite, nie ein geratener Kasten.",
                         "en": "Text layer: page.search_for with a whole-word, case-sensitive check. Scan: Tesseract word boxes, each word ≥ 0.72 similarity, at least 70 % of the words. Otherwise Gemini Flash with box_2d [ymin, xmin, ymax, xmax] on 0–1000. Insertion line below the last substantive clause or above the signatures. Nothing reliable → a banner on the page, never a guessed box."}},
    "draft": {"module": "app/draft.py · app/graph.py (draft_context, successor)",
              "detail": {"de": "Alter Name → Nachfolger aus (alt)-[:RENAMED_TO]->(neu) (GLEIF), sonst „Riverty GmbH“ („Riverty“ für Kürzel). Klausel: Gemini Flash mit Gliederung, Präambel, den 3 Klauseln vor der Einfügestelle und bis zu 2 vom Team übernommenen Formulierungen desselben Typs und derselben Vertragsart (Decision-Knoten); bei „nur teilweise“ die engere Klausel dazu.",
                         "en": "Old name → successor from (old)-[:RENAMED_TO]->(new) (GLEIF), else 'Riverty GmbH' ('Riverty' for an abbreviation). Clause: Gemini Flash with the outline, the preamble, the 3 clauses before the insertion point and up to 2 wordings the team accepted for the same type and contract type (Decision nodes); for 'only partly' the narrower clause as well."}},
    "policy": {"module": "app/learning.py · app/policy.py",
               "detail": {"de": "Entscheidung je (SHA-256, Fund) wird übernommen. Klassenschlüssel „missing:<Vertragsart>:<Typ>“ oder „rename“. Prüfrate 1,0, bis 8 zustimmende Entscheidungen in Folge bei ≥ 95 % Zustimmung vorliegen: dann 0,2, ab 24 in Folge 0,1; deterministische Stichprobe (SHA-256 mod 100), mindestens eine je Vertrag; nur gegengeprüfte Funde werden automatisiert; ein „Nicht zutreffend“ setzt die Klasse zurück.",
                          "en": "A decision per (SHA-256, finding) is carried over. Class key 'missing:<contract type>:<type>' or 'rename'. Review rate 1.0 until 8 agreeing decisions in a row at ≥ 95 % agreement: then 0.2, from 24 in a row 0.1; deterministic sample (SHA-256 mod 100), at least one per contract; only cross-checked findings are automated; one 'not applicable' resets the class."}},
    "decide": {"module": "web/src/pages/Contract.tsx · POST /api/documents/{id}/items/{key}/decide",
               "detail": {"de": "Ein Fund je Karte. Übernehmen (mit bearbeitetem Text auf digitalen PDFs) oder Nicht zutreffend (mit Notiz) → Decision-Knoten -[:ON]->Contract, -[:ABOUT]->ClauseType; AuditLog item.accepted / item.dismissed; Zurücknehmen = „reopened“.",
                          "en": "One finding per card. Accept (with the edited text on digital PDFs) or Not applicable (with a note) → Decision node -[:ON]->Contract, -[:ABOUT]->ClauseType; AuditLog item.accepted / item.dismissed; undo = 'reopened'."}},
    "correct": {"module": "app/correct.py · POST /api/documents/{id}/file-to-storage",
                "detail": {"de": "PyMuPDF: Redaktion mit Ersatztext auf digitalen Seiten (der Kasten wächst in freien Raum), Markierung mit Notiz auf Scans, Nachtragsseite für Klauseln; JPG wird ein einseitiges PDF. Ablage: POST /contracts mit Idempotency-Key copy-<SHA-256 der Kopie>; report.storage = external_id.",
                           "en": "PyMuPDF: redaction with replacement text on digital pages (the box grows into free space), highlight with a note on scans, an addendum page for clauses; a JPG becomes a one-page PDF. Filing: POST /contracts with Idempotency-Key copy-<SHA-256 of the copy>; report.storage = external_id."}},
}


def describe() -> dict:
    out = []
    for s in STAGES:
        model, thinking = None, None
        if s["task"] == "embed":
            model = llm.model_id("embedding") if settings.llm_enabled else None
        elif s["task"] and settings.llm_enabled:
            model, thinking = llm.model_id(llm.TASKS[s["task"]][0]), llm.TASKS[s["task"]][1]
        out.append({**s, **TECH[s["id"]], "model": model, "thinking": thinking})
    return {"stages": out}
