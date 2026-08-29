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
    {"id": "embed", "phase": "read", "tools": "gemini-embedding-001 · pgvector · Volltextindex", "task": "embed",
     "title": {"de": "Auffindbar machen", "en": "Make it searchable"},
     "text": {"de": "Jede Klausel wird als Vektor und im Volltextindex (Deutsch und Englisch) abgelegt. So lässt sich eine frei formulierte Regelung in allen Verträgen suchen – auch wenn sie anders heißt.",
              "en": "Every clause is stored as a vector and in the full-text index (German and English). That is how a freely worded provision can be searched across all contracts – even under another name."},
     "produces": {"de": "durchsuchbare Klauseln", "en": "searchable clauses"}},
    # ---- check (app/report.py graph)
    {"id": "rules", "phase": "check", "tools": "Richtlinie (data/guidelines.json)", "task": None,
     "title": {"de": "Regelprüfung", "en": "Rule check"},
     "text": {"de": "Die Richtlinie sagt, welche Klauseltypen diese Vertragsart braucht. Jeder erforderliche Typ ohne sichere Klausel wird als Fund notiert – ebenso jede aktive Erwähnung eines alten Firmennamens. Alles deterministisch und nachvollziehbar.",
              "en": "The guideline says which clause types this contract type needs. Every required type without a certain clause is noted as a finding – as is every active mention of an old company name. All deterministic and traceable."},
     "produces": {"de": "Kandidaten: fehlende Klauseln, alte Namen", "en": "candidates: missing clauses, old names"}},
    {"id": "cross_check", "phase": "check", "tools": "Gemini Pro (hohes Nachdenken) · Präzedenzfälle", "task": "verify",
     "title": {"de": "KI-Gegenprüfung im Volltext", "en": "AI cross-check of the full text"},
     "text": {"de": "Für jeden Kandidaten liest das stärkste Modell den ganzen Vertrag und bestätigt, verwirft oder sagt „nur teilweise“ – mit Seite, Zitat und Begründung in Ihrer Sprache. Frühere Entscheidungen des Teams zur gleichen Fundart gehen als Präzedenzfälle mit. Nur diese Prüfung darf einen Kandidaten entfernen.",
              "en": "For every candidate the strongest model reads the whole contract and confirms, dismisses or says 'only partly' – with page, quote and reasoning in your language. The team's earlier decisions on the same kind of finding go along as precedents. Only this check may remove a candidate."},
     "produces": {"de": "bestätigte Funde mit Begründung", "en": "confirmed findings with reasoning"}},
    {"id": "place", "phase": "check", "tools": "PyMuPDF-Textebene · Tesseract-Wortboxen · Gemini Flash", "task": "locate",
     "title": {"de": "Fundstellen verorten", "en": "Place the findings"},
     "text": {"de": "Jeder Fund bekommt eine Stelle auf der Seite: der alte Name als exakter Kasten (aus der Textebene, bei Scans aus den OCR-Wortpositionen, bei Handschrift vom Modell), die fehlende Klausel als Einfügelinie unter der letzten Klausel. Findet sich keine sichere Stelle, wird die Seite markiert – nie ein geratener Kasten.",
              "en": "Every finding gets a place on the page: the old name as an exact box (from the text layer, on scans from the OCR word positions, on handwriting from the model), the missing clause as an insertion line below the last clause. If no reliable place is found, the page is marked – never a guessed box."},
     "produces": {"de": "Kasten oder Einfügelinie je Fund", "en": "a box or insertion line per finding"}},
    {"id": "draft", "phase": "check", "tools": "Gemini Flash", "task": "draft",
     "title": {"de": "Vorschlag formulieren", "en": "Draft the suggestion"},
     "text": {"de": "Für einen alten Namen ist der Vorschlag der neue Name. Für eine fehlende Klausel entwirft das Modell eine marktübliche Klausel in Sprache, Nummerierung und Begriffen des Vertrags; bei „nur teilweise“ eine Ergänzung. Ein Ausgangspunkt für die Juristin, nie die Endfassung.",
              "en": "For an old name the suggestion is the new name. For a missing clause the model drafts a market-standard clause in the contract's language, numbering and terms; for 'only partly' an amendment. A starting point for the lawyer, never the final wording."},
     "produces": {"de": "Vorschlagstext je Fund", "en": "a suggestion text per finding"}},
    {"id": "policy", "phase": "check", "tools": "Entscheidungsregeln (app/policy.py, app/learning.py)", "task": None,
     "title": {"de": "Was das Team schon entschieden hat", "en": "What the team has already decided"},
     "text": {"de": "Wurde dieselbe Datei schon einmal geprüft, gelten die früheren Entscheidungen weiter. Einer Fundart, der das Team acht Mal in Folge zugestimmt hat (≥ 95 %), wird nur noch eine Stichprobe vorgelegt (20 %, später 10 %; mindestens eine je Vertrag) – der Rest gilt als übernommen, sichtbar und jederzeit umkehrbar. Ein „Nicht zutreffend“ setzt die Fundart zurück.",
              "en": "If the same file was checked before, the earlier decisions still apply. A kind of finding the team has agreed with eight times in a row (≥ 95 %) is only spot-checked (20 %, later 10 %; at least one per contract) – the rest counts as accepted, visible and reversible at any time. One 'not applicable' resets the kind."},
     "produces": {"de": "Entscheidungsstatus je Fund: offen, übernommen, Stichprobe", "en": "decision state per finding: open, accepted, spot check"}},
    # ---- decide (the contract page, app/correct.py)
    {"id": "decide", "phase": "decide", "tools": "Vertragsseite · Tabelle decisions", "task": None,
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


def describe() -> dict:
    out = []
    for s in STAGES:
        model = None
        if s["task"] == "embed":
            model = llm.model_id("embedding") if settings.llm_enabled else None
        elif s["task"] and settings.llm_enabled:
            model = llm.model_id(llm.TASKS[s["task"]][0])
        out.append({**s, "model": model})
    return {"stages": out}
