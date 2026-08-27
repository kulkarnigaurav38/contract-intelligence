"""Pick a small, aligned subset of CUAD v1 (The Atticus Project, CC BY 4.0) as a real-world benchmark.

CUAD annotates 41 clause categories on 510 real commercial contracts (SEC EDGAR exhibits). Five of them
map directly onto our taxonomy, and an empty annotation means the expert annotators found no such clause -
exactly the "absence" ground truth our checks are about.

Run:  cd api && uv run python ../data/real/build_cuad_subset.py
"""

import csv
import json
import random
import shutil
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "cuad_tmp" / "CUAD_v1"
OUT = HERE / "cuad"
N = 12
MAPPING = {  # CUAD category -> our clause type
    "Governing Law": "governing_law",
    "Cap On Liability": "liability_cap",
    "Audit Rights": "audit_rights",
    "Change Of Control": "change_of_control",
    "Anti-Assignment": "assignment",
}


def main() -> None:
    rows = list(csv.DictReader((SRC / "master_clauses.csv").open(encoding="utf-8")))
    pdfs = {p.stem: p for p in (SRC / "full_contract_pdf").rglob("*.pdf")}
    txts = {p.stem: p for p in (SRC / "full_contract_txt").rglob("*.txt")}
    candidates = []
    for r in rows:
        stem = Path(r["Filename"]).stem
        if stem not in pdfs or stem not in txts:
            continue
        size = txts[stem].stat().st_size
        if not 8_000 <= size <= 45_000:  # short enough to verify quickly, long enough to be a real contract
            continue
        # 'Governing Law-Answer' holds the jurisdiction text (empty = none); the other four hold 'Yes'/'No'
        present = [ours for cuad, ours in MAPPING.items()
                   if (r.get(f"{cuad}-Answer", "").strip() if cuad == "Governing Law" else r.get(f"{cuad}-Answer", "").strip().lower() == "yes")]
        missing = [ours for ours in MAPPING.values() if ours not in present]
        if not 1 <= len(missing) <= 4:  # we want both presence and absence in every contract
            continue
        candidates.append((stem, present, missing, size))
    random.Random(7).shuffle(candidates)
    chosen = candidates[:N]
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.pdf"):
        old.unlink()
    gt = []
    for stem, present, missing, size in chosen:
        shutil.copy(pdfs[stem], OUT / f"{stem}.pdf")
        gt.append({"file": f"{stem}.pdf", "source": "CUAD v1 (Atticus Project, CC BY 4.0)", "chars": size,
                   "clauses_present": present, "clauses_missing": missing})
    (HERE / "cuad_ground_truth.json").write_text(json.dumps(
        {"mapping": MAPPING, "note": "absence = the expert annotators recorded no clause of that category",
         "contracts": gt}, indent=2) + "\n")
    print(f"{len(chosen)} of {len(candidates)} eligible contracts copied to {OUT}")
    for g in gt:
        print(f"  {g['file'][:60]:<60} present={len(g['clauses_present'])} missing={g['clauses_missing']}")


if __name__ == "__main__":
    main()
