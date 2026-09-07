"""One unseen contract for a live demo - not part of any sample batch.

    cd api && uv run python ../data/make_demo_contract.py   ->   data/demo/Haendlervertrag_Nordwind_Outdoor_2021.pdf

A born-digital German merchant agreement from 2021: the old entity (Arvato Payment Solutions GmbH) is an active
party on page 1 and signs on page 2, Arvato Systems GmbH appears as an unrelated technical provider, and two clauses
the guideline requires of a merchant agreement are missing - limitation of liability and anti-corruption. Drop it
on the start page: reading, checking, the findings on the page, the drafts, the corrected copy.
"""

from pathlib import Path

import pymupdf

OUT = Path(__file__).parent / "demo" / "Haendlervertrag_Nordwind_Outdoor_2021.pdf"
W, H, MARGIN = 595, 842, 62
BODY, HEAD, TITLE, LH = 10.5, 11.5, 18, 15.5

US, US_SHORT = "Arvato Payment Solutions GmbH", "Arvato Payment Solutions"
THEM, THEM_SHORT = "Nordwind Outdoor GmbH", "Händler"

BLOCKS = [
    ("title", "Händlervertrag"),
    ("sub", "über die Abwicklung von Rechnungskauf und Ratenkauf im Online-Handel"),
    ("body", "Dieser Händlervertrag wird am 8. März 2021 geschlossen zwischen"),
    ("party", f"{US}, Gütersloher Straße 123, 33415 Verl"),
    ("body", f'- nachfolgend "{US_SHORT}" -'),
    ("body", "und"),
    ("party", f"{THEM}, Hafenstraße 12, 24103 Kiel"),
    ("body", f'- nachfolgend "{THEM_SHORT}" -, gemeinsam die "Parteien".'),
    ("head", "§ 1 Gegenstand und Leistungen"),
    ("body", f"{US_SHORT} stellt dem {THEM_SHORT} die Zahlungsarten Rechnungskauf und Ratenkauf für dessen Online-Shop zur Verfügung, "
             "prüft Bestellungen auf Zahlungsausfallrisiken und übernimmt die Forderungen aus den freigegebenen Bestellungen "
             "nach Maßgabe der Anlage 1. Die technische Anbindung erfolgt über die Plattform der Arvato Systems GmbH als "
             "technischem Dienstleister; die Schnittstellenbeschreibung ist Bestandteil der Anlage 1."),
    ("body", f"Der {THEM_SHORT} bietet die Zahlungsarten ausschließlich Kunden mit Rechnungs- und Lieferadresse in Deutschland an "
             "und bindet die von Arvato Payment Solutions bereitgestellten Informationstexte unverändert in den Bestellprozess ein."),
    ("head", "§ 2 Pflichten des Händlers"),
    ("body", f"Der {THEM_SHORT} übermittelt jede Bestellung vollständig und wahrheitsgemäß, versendet die Ware erst nach Freigabe "
             "durch Arvato Payment Solutions und teilt Retouren, Gutschriften und Stornierungen unverzüglich, spätestens innerhalb "
             "von drei Werktagen, über die Schnittstelle mit. Er stellt sicher, dass seine Allgemeinen Geschäftsbedingungen die "
             "Abtretung der Forderungen an Arvato Payment Solutions zulassen."),
    ("head", "§ 3 Vergütung und Abrechnung"),
    ("body", f"Für die Leistungen zahlt der {THEM_SHORT} je abgewickelter Transaktion ein Disagio von 2,9 % des Bestellwerts zuzüglich "
             "einer Transaktionsgebühr von 0,25 EUR; die Vergütung für den Ratenkauf richtet sich nach der Preistabelle in Anlage 3. "
             "Die Vergütung wird mit den Auszahlungen verrechnet; Rechnungen werden wöchentlich gestellt und sind innerhalb von "
             "14 Tagen nach Zugang ohne Abzug fällig. Alle Beträge verstehen sich zuzüglich der gesetzlichen Umsatzsteuer."),
    ("head", "§ 4 Laufzeit und Kündigung"),
    ("body", "Der Vertrag tritt mit Unterzeichnung in Kraft und hat eine anfängliche Laufzeit von vierundzwanzig (24) Monaten. "
             "Er verlängert sich jeweils um zwölf (12) Monate, sofern er nicht von einer Partei mit einer Frist von drei (3) Monaten "
             "zum Ende der jeweiligen Laufzeit schriftlich gekündigt wird. Das Recht zur außerordentlichen Kündigung aus wichtigem "
             "Grund bleibt unberührt; ein wichtiger Grund liegt insbesondere vor, wenn über das Vermögen einer Partei ein "
             "Insolvenzverfahren eröffnet oder mangels Masse abgelehnt wird."),
    ("head", "§ 5 Datenschutz"),
    ("body", f"Die Parteien beachten die Datenschutz-Grundverordnung (DSGVO) und das Bundesdatenschutzgesetz. Soweit Arvato Payment "
             f"Solutions personenbezogene Daten im Auftrag des {THEM_SHORT}s verarbeitet, schließen die Parteien den als Anlage 2 "
             "beigefügten Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Personenbezogene Daten werden nur für die Zwecke "
             "dieses Vertrages verarbeitet und nach Wegfall des Zwecks gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten "
             "entgegenstehen."),
    ("head", "§ 6 Vertraulichkeit"),
    ("body", "Die Parteien behandeln alle im Zusammenhang mit diesem Vertrag erlangten Geschäfts- und Betriebsgeheimnisse sowie "
             "als vertraulich gekennzeichnete Informationen streng vertraulich und machen sie Dritten nicht ohne vorherige "
             "schriftliche Zustimmung der anderen Partei zugänglich. Die Weitergabe an Berater, die einer gesetzlichen "
             "Verschwiegenheitspflicht unterliegen, ist zulässig. Diese Verpflichtung gilt für fünf (5) Jahre über das Ende des "
             "Vertrages hinaus."),
    ("head", "§ 7 Höhere Gewalt"),
    ("body", "Keine Partei ist zur Erfüllung ihrer Pflichten verpflichtet, solange und soweit sie durch Ereignisse außerhalb ihrer "
             "Kontrolle daran gehindert wird, insbesondere durch Naturkatastrophen, Krieg, Pandemien, Streik oder behördliche "
             "Anordnungen. Die betroffene Partei informiert die andere Partei unverzüglich über Eintritt und voraussichtliche Dauer "
             "des Ereignisses."),
    ("head", "§ 8 Anwendbares Recht"),
    ("body", "Dieser Vertrag unterliegt dem Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts (CISG) und der "
             "Kollisionsnormen des internationalen Privatrechts."),
    ("head", "§ 9 Gerichtsstand"),
    ("body", "Ausschließlicher Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist Bielefeld, "
             "sofern der Händler Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen ist."),
    ("head", "§ 10 Schlussbestimmungen"),
    ("body", "Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform; dies gilt auch für die Aufhebung dieses "
             "Schriftformerfordernisses. Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, bleibt die Wirksamkeit "
             "der übrigen Bestimmungen unberührt; die Parteien werden die unwirksame Bestimmung durch eine wirksame ersetzen, die "
             "dem wirtschaftlichen Zweck am nächsten kommt. Die Anlagen 1 bis 3 sind Bestandteil dieses Vertrages."),
    ("gap", ""),
    ("body", "Verl, den 8. März 2021"),
    ("sig", f"Für {US}:"),
    ("line", "______________________________"),
    ("body", "Geschäftsführung"),
    ("gap", ""),
    ("body", "Kiel, den 12. März 2021"),
    ("sig", f"Für {THEM}:"),
    ("line", "______________________________"),
    ("body", "Geschäftsführung"),
]

STYLE = {"title": ("hebo", TITLE, 26), "sub": ("helv", BODY, 20), "head": ("hebo", HEAD, 18), "body": ("helv", BODY, LH), "party": ("hebo", BODY, LH),
         "sig": ("hebo", BODY, LH), "line": ("helv", BODY, LH), "gap": ("helv", BODY, 12)}


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        cand = f"{line} {word}".strip()
        if pymupdf.get_text_length(cand, fontname=font, fontsize=size) <= width:
            line = cand
        else:
            lines.append(line)
            line = word
    return lines + [line] if line else lines


def main() -> None:
    OUT.parent.mkdir(exist_ok=True)
    doc = pymupdf.open()
    page, y = doc.new_page(width=W, height=H), MARGIN
    for i, (kind, txt) in enumerate(BLOCKS):
        font, size, lh = STYLE[kind]
        lines = wrap(txt, font, size, W - 2 * MARGIN) if txt else [""]
        need = lh * len(lines)
        if kind == "head":  # keep a heading together with its clause
            y += 8
            nkind, ntxt = BLOCKS[i + 1]
            need += STYLE[nkind][2] * len(wrap(ntxt, STYLE[nkind][0], STYLE[nkind][1], W - 2 * MARGIN))
        if y + need > H - MARGIN - 20:  # does not fit: next page
            page, y = doc.new_page(width=W, height=H), MARGIN
        for line in lines:
            if txt:
                page.insert_text((MARGIN, y + size), line, fontsize=size, fontname=font)
            y += lh
    for i, p in enumerate(doc, start=1):
        p.insert_text((W / 2 - 10, H - 30), f"– {i} –", fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
    doc.save(OUT, garbage=3, deflate=True)
    print(f"wrote {OUT} ({len(doc)} pages)")


if __name__ == "__main__":
    main()
