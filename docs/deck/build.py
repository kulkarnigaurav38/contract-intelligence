"""The deck, built from one source: 15 slides as HTML fragments in the website's theme.

    python3 docs/deck/build.py

writes docs/presentation.html (the deck to present: arrow keys, animations, ?print for a PDF) and one design-canvas
artboard per slide under docs/deck/artboards/ (plus canvas.json), so the same slides can be tweaked visually and
exported. Images come from docs/deck/img/ (screenshots of the running app).
"""

import base64
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IMG = {p.name: base64.b64encode(p.read_bytes()).decode() for p in sorted((HERE / "img").glob("*.jpg"))}
W, H = 1280, 720

CSS = """
:root{--teal:#00695c;--teal2:#e0f2f1;--bg:#f4f6f6;--paper:#fff;--line:#e3e7e7;--ink:rgba(0,0,0,.87);--muted:rgba(0,0,0,.6);
--red:#d32f2f;--amber:#ed6c02;--green:#2e7d32;--blue:#1565c0}
*{box-sizing:border-box}
.slide{position:relative;width:1280px;height:720px;background:var(--bg);color:var(--ink);font-family:Roboto,'Helvetica Neue',Arial,sans-serif;overflow:hidden;padding:44px 64px 40px}
.slide header{display:flex;flex-direction:column;gap:6px;margin-bottom:22px}
.kicker{font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--teal)}
.slide h1{font-size:38px;font-weight:600;line-height:1.15;margin:0}
.slide footer{position:absolute;left:64px;right:64px;bottom:22px;display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
.body{position:relative;height:540px}
.paper{background:var(--paper);border:1px solid var(--line);border-radius:10px}
.muted{color:var(--muted)}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--teal2);color:var(--teal)}
.tag.red{background:#fdecea;color:var(--red)}.tag.amber{background:#fff3e0;color:var(--amber)}.tag.green{background:#e8f5e9;color:var(--green)}.tag.grey{background:#eceff1;color:#455a64}
.row{display:flex;gap:16px}.col{display:flex;flex-direction:column;gap:12px}
.num{font-size:40px;font-weight:600;color:var(--teal);line-height:1}
.small{font-size:13px;color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:var(--paper);border:1px solid var(--line);font-size:13px;font-weight:500}
.chip.on{background:var(--teal);color:#fff;border-color:var(--teal)}
svg text{font-family:Roboto,'Helvetica Neue',Arial,sans-serif}
.node{fill:#fff;stroke:var(--line);stroke-width:1.5}.node.teal{fill:var(--teal);stroke:var(--teal)}.node.light{fill:var(--teal2);stroke:var(--teal)}
.edge{fill:none;stroke:#90a4ae;stroke-width:1.8}.edge.teal{stroke:var(--teal)}.edge.red{stroke:var(--red);stroke-dasharray:6 5}
.lbl{font-size:13px;fill:var(--ink)}.lbl.w{fill:#fff;font-weight:600}.lbl.m{fill:var(--muted);font-size:12px}.lbl.b{font-weight:600}.lbl.t{fill:var(--teal);font-weight:600}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
/* motion: everything runs once the slide is active (the deck adds .active; an artboard is born active) */
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
.active .fu{animation:fadeUp .6s both;animation-delay:var(--d,0s)}
.active .gr{transform-origin:left center;animation:grow 1s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}
.active .dr{stroke-dasharray:1200;stroke-dashoffset:1200;animation:draw 1.6s ease-out both;animation-delay:var(--d,0s)}
.active .pu{animation:pulse 1.6s ease-in-out infinite;animation-delay:var(--d,0s)}
.active .po{transform-box:fill-box;transform-origin:center;animation:pop .5s both;animation-delay:var(--d,0s)}
.fu,.gr,.po{opacity:0}.active .fu,.active .gr,.active .po{opacity:1}
"""

FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap">'


def img(name: str, style: str) -> str:
    return f'<img src="{name}" alt="" style="{style}">'


def icon(kind: str, size: int = 22, color: str = "#00695c") -> str:
    paths = {
        "doc": '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 12h6M9 16h6"/>',
        "scan": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16"/><path d="M8 8h3M8 16h3"/>',
        "image": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
        "store": '<path d="M4 7h16v13H4z"/><path d="M4 7l2-4h12l2 4"/><path d="M10 12h4"/>',
        "search": '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
        "check": '<path d="M5 12l4 4 10-10"/>',
        "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
        "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        "graph": '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l3 9M16 7l-3 9M8.5 6h7"/>',
        "bolt": '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    }
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.8" '
            f'stroke-linecap="round" stroke-linejoin="round">{paths[kind]}</svg>')


def slide(stem: str, kicker: str, title: str, body: str) -> dict:
    return {"stem": stem, "kicker": kicker, "title": title, "body": body}


# ------------------------------------------------------------------ the slides
S = []

S.append(slide("Main", "Riverty · Software Engineer (RAG) case study", "Contract Intelligence", f"""
<div style="display:flex;flex-direction:column;gap:18px;margin-top:40px">
  <div class="fu" style="font-size:26px;line-height:1.35;max-width:900px">Which contracts lack a clause the guideline requires?<br>Which still name the company by its old name?</div>
  <div class="fu" style="--d:.2s;font-size:16px;color:var(--muted)">A knowledge-graph pipeline that finds, a strong model that verifies, a lawyer who decides — on the PDF itself.</div>
  <div class="row fu" style="--d:.5s;margin-top:34px;align-items:center;gap:10px">
    <span class="chip">SharePoint · upload</span><span class="muted">→</span>
    <span class="chip">Read</span><span class="muted">→</span>
    <span class="chip on">Neo4j graph</span><span class="muted">→</span>
    <span class="chip">Check</span><span class="muted">→</span>
    <span class="chip">Decide</span><span class="muted">→</span>
    <span class="chip">Contract storage</span>
  </div>
  <div class="fu" style="--d:.8s;margin-top:70px;font-size:15px;color:var(--muted)">Gaurav Kulkarni · September 2026 · 10 minutes, then 5 minutes live</div>
</div>
"""))

S.append(slide("S02Problem", "The problem", "Open · search · verify — by hand, across the whole inventory", f"""
<div class="row" style="gap:24px;height:100%">
  <div class="col" style="flex:0 0 300px">
    <div class="paper fu" style="padding:14px 16px;display:flex;gap:12px;align-items:center">{icon('doc')}<div><b>SharePoint</b><div class="small">most contracts, PDF</div></div></div>
    <div class="paper fu" style="--d:.1s;padding:14px 16px;display:flex;gap:12px;align-items:center">{icon('scan')}<div><b>Scans</b><div class="small">no text layer</div></div></div>
    <div class="paper fu" style="--d:.2s;padding:14px 16px;display:flex;gap:12px;align-items:center">{icon('image')}<div><b>Handwritten JPEGs</b><div class="small">really old contracts</div></div></div>
    <div class="paper fu" style="--d:.3s;padding:14px 16px;display:flex;gap:12px;align-items:center">{icon('store')}<div><b>Contract storage</b><div class="small">REST · store a copy only</div></div></div>
  </div>
  <div class="col" style="flex:1;gap:16px">
    <div class="row" style="gap:16px">
      <div class="paper fu" style="--d:.4s;flex:1;padding:20px 22px;border-left:4px solid var(--teal)"><div class="kicker" style="font-size:12px">Question 1</div><div style="font-size:21px;font-weight:500;margin-top:6px">Which contracts do <u>not</u> contain passage X?</div></div>
      <div class="paper fu" style="--d:.5s;flex:1;padding:20px 22px;border-left:4px solid var(--red)"><div class="kicker" style="font-size:12px;color:var(--red)">Question 2</div><div style="font-size:21px;font-weight:500;margin-top:6px">Which contracts still name the <u>old</u> company?</div></div>
    </div>
    <div class="paper fu" style="--d:.7s;padding:18px 22px">
      <div class="small" style="margin-bottom:10px">Today, per contract and question</div>
      <svg width="820" height="120" viewBox="0 0 820 120">
        <g class="po" style="--d:.9s"><rect class="node" x="10" y="30" width="170" height="56" rx="10"/><text class="lbl b" x="95" y="64" text-anchor="middle">open the PDF</text></g>
        <path class="edge dr" style="--d:1s" d="M180 58 H240"/>
        <g class="po" style="--d:1.2s"><rect class="node" x="240" y="30" width="200" height="56" rx="10"/><text class="lbl b" x="340" y="64" text-anchor="middle">search, in two languages</text></g>
        <path class="edge dr" style="--d:1.3s" d="M440 58 H500"/>
        <g class="po" style="--d:1.5s"><rect class="node" x="500" y="30" width="170" height="56" rx="10"/><text class="lbl b" x="585" y="64" text-anchor="middle">verify yourself</text></g>
        <path class="edge dr teal" style="--d:1.7s" d="M670 58 C 760 58 760 8 500 8 L 95 8 C 60 8 60 30 95 30" marker-end=""/>
        <text class="lbl t fu" style="--d:1.9s" x="740" y="75" text-anchor="middle">× 15,000</text>
        <text class="lbl m fu" style="--d:2s" x="340" y="112" text-anchor="middle">≈ 15 min · scans 20–40 · handwriting 30–60 or skipped</text>
      </svg>
    </div>
    <div class="small fu" style="--d:2.1s">“Agents like Claude often fail due to the sheer size and complexity of the environments” — so this is not an agent. It is a pipeline with model nodes.</div>
  </div>
</div>
"""))

S.append(slide("S03Estimate", "The estimation", "How much work is it — and what does it cost?", f"""
<div class="row" style="gap:16px">
  <div class="paper fu" style="flex:1;padding:18px 20px"><div class="num" data-count="15000">15,000</div><div style="margin-top:6px;font-weight:500">active contracts</div><div class="small">1,800 merchants × ~3 docs, vendors, mandates, NDAs</div></div>
  <div class="paper fu" style="--d:.1s;flex:1;padding:18px 20px"><div class="num" data-count="40000">40,000</div><div style="margin-top:6px;font-weight:500">documents in the archive</div><div class="small">incl. arvato · infoscore · AfterPay entities</div></div>
  <div class="paper fu" style="--d:.2s;flex:1;padding:18px 20px"><div class="num">12–20</div><div style="margin-top:6px;font-weight:500">new contracts per day</div><div class="small">20–30 % of the stock turns over a year</div></div>
  <div class="paper fu" style="--d:.3s;flex:1;padding:18px 20px"><div class="num">1–3</div><div style="margin-top:6px;font-weight:500">sweeps a year</div><div class="small">rebrand 2022–23 · the bank 2026 · DORA · a guideline change</div></div>
</div>
<div class="row" style="gap:16px;margin-top:16px">
  <div class="paper fu" style="--d:.5s;flex:1.2;padding:18px 22px">
    <div style="font-weight:600;margin-bottom:10px">Rename sweep over 15,000 contracts</div>
    <div class="small">manual · 15 min each</div>
    <div style="height:22px;border-radius:6px;background:#fdecea;margin:4px 0 10px;overflow:hidden"><div class="gr" style="--d:.8s;height:100%;width:100%;background:var(--red)"></div></div>
    <div class="row" style="justify-content:space-between"><span><b>3,750 h</b> ≈ 2.3 FTE-years ≈ <b>€340k</b></span><span class="small">5 people · 5 months</span></div>
    <div class="small" style="margin-top:14px">with the tool · 3 min per finding, spot checks</div>
    <div style="height:22px;border-radius:6px;background:var(--teal2);margin:4px 0 10px;overflow:hidden"><div class="gr" style="--d:1.2s;height:100%;width:7%;background:var(--teal)"></div></div>
    <div class="row" style="justify-content:space-between"><span><b>250 h</b> lawyer time + <b>€900</b> model calls</span><span class="small">1–2 weeks</span></div>
  </div>
  <div class="paper fu" style="--d:.6s;flex:1;padding:18px 22px">
    <div style="font-weight:600;margin-bottom:10px">Daily flow · 15 contracts against the guideline</div>
    <div class="small">manual · 45–60 min each</div>
    <div style="height:22px;border-radius:6px;background:#fdecea;margin:4px 0 10px;overflow:hidden"><div class="gr" style="--d:.9s;height:100%;width:100%;background:var(--red)"></div></div>
    <div><b>1.6 FTE</b> ≈ €240k a year</div>
    <div class="small" style="margin-top:14px">with the tool</div>
    <div style="height:22px;border-radius:6px;background:var(--teal2);margin:4px 0 10px;overflow:hidden"><div class="gr" style="--d:1.3s;height:100%;width:12%;background:var(--teal)"></div></div>
    <div><b>0.2 FTE</b> + €250 model + €3k infrastructure</div>
  </div>
</div>
<div class="small fu" style="--d:1.6s;margin-top:12px">Gemini 3.1 Pro $2 / $12 per 1M tokens → ≈ $0.06–0.10 per contract. The tool costs ~1 % of the lawyer time it replaces; the time that remains is the part only a lawyer can do. Estimates: docs/cost-benefit.md.</div>
"""))

S.append(slide("S04Insight", "Thought process", "Retrieval finds what is there. It cannot prove what is not.", f"""
<div class="row" style="gap:20px">
  <div class="paper fu" style="flex:1;padding:20px 22px;opacity:.9">
    <div class="tag grey">search</div>
    <svg width="520" height="250" viewBox="0 0 520 250" style="margin-top:10px">
      <g class="po" style="--d:.2s"><rect class="node" x="10" y="20" width="130" height="50" rx="10"/><text class="lbl b" x="75" y="50" text-anchor="middle">chunks</text></g>
      <path class="edge dr" style="--d:.3s" d="M140 45 H200"/>
      <g class="po" style="--d:.4s"><rect class="node" x="200" y="20" width="130" height="50" rx="10"/><text class="lbl b" x="265" y="50" text-anchor="middle">similarity</text></g>
      <path class="edge dr" style="--d:.5s" d="M330 45 H390"/>
      <g class="po" style="--d:.6s"><rect class="node" x="390" y="20" width="120" height="50" rx="10"/><text class="lbl b" x="450" y="50" text-anchor="middle">top-k</text></g>
      <text class="lbl m fu" style="--d:.8s" x="260" y="120" text-anchor="middle">“nothing similar above 0.6” … is that absence?</text>
      <text class="lbl fu" style="--d:1s" x="260" y="150" text-anchor="middle" fill="#d32f2f" font-weight="600">a guess with a score</text>
      <text class="lbl m fu" style="--d:1.1s" x="260" y="200" text-anchor="middle">“Arvato Systems” ≈ “Arvato Payment Solutions” to a vector</text>
      <text class="lbl fu" style="--d:1.2s" x="260" y="228" text-anchor="middle" fill="#d32f2f" font-weight="600">identity is not similarity</text>
    </svg>
  </div>
  <div class="paper fu" style="--d:.2s;flex:1;padding:20px 22px;border:2px solid var(--teal)">
    <div class="tag">structure</div>
    <svg width="520" height="250" viewBox="0 0 520 250" style="margin-top:10px">
      <g class="po" style="--d:.5s"><rect class="node light" x="10" y="20" width="130" height="50" rx="10"/><text class="lbl b" x="75" y="50" text-anchor="middle">clauses, typed</text></g>
      <path class="edge dr teal" style="--d:.6s" d="M140 45 H200"/>
      <g class="po" style="--d:.7s"><rect class="node light" x="200" y="20" width="150" height="50" rx="10"/><text class="lbl b" x="275" y="50" text-anchor="middle">guideline REQUIRES</text></g>
      <path class="edge dr teal" style="--d:.8s" d="M350 45 H400"/>
      <g class="po" style="--d:.9s"><rect class="node teal" x="400" y="20" width="110" height="50" rx="10"/><text class="lbl w" x="455" y="50" text-anchor="middle">absence</text></g>
      <text class="lbl m fu" style="--d:1s" x="260" y="105" text-anchor="middle">= a lookup: required type with no clause of that type</text>
      <g class="po" style="--d:1.2s"><rect class="node light" x="60" y="140" width="160" height="50" rx="10"/><text class="lbl b" x="140" y="170" text-anchor="middle">register (GLEIF)</text></g>
      <path class="edge dr teal" style="--d:1.3s" d="M220 165 H300"/>
      <text class="lbl m" x="260" y="132" text-anchor="middle">RENAMED_TO</text>
      <g class="po" style="--d:1.4s"><rect class="node teal" x="300" y="140" width="160" height="50" rx="10"/><text class="lbl w" x="380" y="170" text-anchor="middle">identity</text></g>
      <text class="lbl m fu" style="--d:1.6s" x="260" y="225" text-anchor="middle">= an edge with a source, not a score</text>
    </svg>
  </div>
</div>
<div class="row fu" style="--d:1.9s;position:absolute;left:0;right:0;bottom:6px;gap:12px;align-items:center;justify-content:center;font-size:17px">
  <span class="chip">rules <b>find</b> · recall</span><span class="muted">→</span><span class="chip">a model <b>verifies</b> · precision</span><span class="muted">→</span><span class="chip on">a person <b>decides</b></span>
</div>
"""))

S.append(slide("S05Versions", "The versions", "Four versions in ten days — what changed, and why", f"""
<svg width="1152" height="120" viewBox="0 0 1152 120">
  <path class="edge dr teal" style="stroke-width:3" d="M40 60 H1112"/>
  <g class="po" style="--d:.2s"><circle cx="90" cy="60" r="14" fill="#fff" stroke="#00695c" stroke-width="3"/><text class="lbl t" x="90" y="100" text-anchor="middle">26–27 Aug</text></g>
  <g class="po" style="--d:.6s"><circle cx="410" cy="60" r="14" fill="#fff" stroke="#00695c" stroke-width="3"/><text class="lbl t" x="410" y="100" text-anchor="middle">29 Aug</text></g>
  <g class="po" style="--d:1s"><circle cx="730" cy="60" r="14" fill="#fff" stroke="#00695c" stroke-width="3"/><text class="lbl t" x="730" y="100" text-anchor="middle">5 Sep</text></g>
  <g class="po" style="--d:1.4s"><circle cx="1050" cy="60" r="14" fill="#00695c" stroke="#00695c" stroke-width="3"/><text class="lbl t" x="1050" y="100" text-anchor="middle">5 Sep · now</text></g>
</svg>
<div class="row" style="gap:16px;margin-top:6px">
  <div class="paper fu" style="--d:.3s;flex:1;padding:16px 18px"><div class="tag grey">v1 · audit workbench</div><div style="font-weight:600;margin:8px 0 4px">Question cards, clause matrix, review queue, chat, model tables</div><div class="small">Every feature defensible; the sum not what a legal team reaches for. Cut.</div></div>
  <div class="paper fu" style="--d:.7s;flex:1;padding:16px 18px"><div class="tag grey">v2 · file converter</div><div style="font-weight:600;margin:8px 0 4px">Drop in → one result line → findings marked on the PDF → corrected copy</div><div class="small">“Until they see the PDF itself they will not trust the system.”</div></div>
  <div class="paper fu" style="--d:1.1s;flex:1;padding:16px 18px"><div class="tag grey">v3 · knowledge graph</div><div style="font-weight:600;margin:8px 0 4px">Neo4j as the RAG store beside Postgres; register from GLEIF; models read the graph’s selection</div><div class="small">The two questions are graph patterns. Database-first, not LLM-extracted.</div></div>
  <div class="paper fu" style="--d:1.5s;flex:1;padding:16px 18px;border:2px solid var(--teal)"><div class="tag">v4 · graph only</div><div style="font-weight:600;margin:8px 0 4px">Neo4j the sole database; scoped-then-full verification; 3 steps + a Technik page</div><div class="small">One system to run. Precision restored. Explainable to engineers and lawyers.</div></div>
</div>
<div class="small fu" style="--d:1.9s;margin-top:14px">What stayed through all four: the rule layer, the full-text verifier, the corporate guideline as a file, the measured precision/recall on real contracts (CUAD).</div>
"""))

S.append(slide("S06Workflow", "The workflow", "One contract, end to end — 14 stages, three phases", f"""
<svg width="1152" height="470" viewBox="0 0 1152 470">
  <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#90a4ae"/></marker></defs>
  <g class="po" style="--d:.1s"><rect class="node" x="10" y="150" width="120" height="70" rx="10"/><text class="lbl b" x="70" y="180" text-anchor="middle">SharePoint</text><text class="lbl m" x="70" y="200" text-anchor="middle">upload · delta sync</text></g>
  <path class="edge" d="M130 185 H160" marker-end="url(#ar)"/>
  <g class="fu" style="--d:.3s"><rect x="160" y="20" width="280" height="330" rx="12" fill="#fff" stroke="#e3e7e7"/><text class="lbl t" x="300" y="48" text-anchor="middle" font-size="15">READ</text></g>
  <g class="po" style="--d:.5s"><rect class="node light" x="180" y="66" width="240" height="32" rx="8"/><text class="lbl" x="300" y="87" text-anchor="middle">load · text layer or page image</text></g>
  <g class="po" style="--d:.7s"><rect class="node light" x="180" y="106" width="240" height="32" rx="8"/><text class="lbl" x="300" y="127" text-anchor="middle">ocr · Tesseract → Gemini vision</text></g>
  <g class="po" style="--d:.9s"><rect class="node light" x="180" y="146" width="240" height="32" rx="8"/><text class="lbl" x="300" y="167" text-anchor="middle">segment · clauses by structure</text></g>
  <g class="po" style="--d:1.1s"><rect class="node light" x="180" y="186" width="240" height="32" rx="8"/><text class="lbl" x="300" y="207" text-anchor="middle">classify · keywords + Flash</text></g>
  <g class="po" style="--d:1.3s"><rect class="node light" x="180" y="226" width="240" height="32" rx="8"/><text class="lbl" x="300" y="247" text-anchor="middle">entities · register + GLEIF</text></g>
  <g class="po" style="--d:1.5s"><rect class="node light" x="180" y="266" width="240" height="32" rx="8"/><text class="lbl" x="300" y="287" text-anchor="middle">screen · injection guard</text></g>
  <g class="po" style="--d:1.7s"><rect class="node light" x="180" y="306" width="240" height="32" rx="8"/><text class="lbl" x="300" y="327" text-anchor="middle">embed · vector + full-text</text></g>
  <path class="edge" d="M440 185 H480" marker-end="url(#ar)"/>
  <g class="po" style="--d:1.9s"><rect class="node teal" x="480" y="120" width="190" height="130" rx="14"/><text class="lbl w" x="575" y="165" text-anchor="middle" font-size="18">Neo4j</text><text class="lbl w" x="575" y="190" text-anchor="middle" font-size="12">contracts · clauses · names</text><text class="lbl w" x="575" y="208" text-anchor="middle" font-size="12">guideline · register · decisions</text><text class="lbl w" x="575" y="226" text-anchor="middle" font-size="12">vector + full-text index</text></g>
  <path class="edge" d="M670 185 H710" marker-end="url(#ar)"/>
  <g class="fu" style="--d:2.1s"><rect x="710" y="20" width="270" height="330" rx="12" fill="#fff" stroke="#e3e7e7"/><text class="lbl t" x="845" y="48" text-anchor="middle" font-size="15">CHECK · LangGraph</text></g>
  <g class="po" style="--d:2.3s"><rect class="node light" x="730" y="66" width="230" height="32" rx="8"/><text class="lbl" x="845" y="87" text-anchor="middle">rules · guideline gaps, old names</text></g>
  <g class="po" style="--d:2.5s"><rect class="node light" x="730" y="106" width="230" height="32" rx="8"/><text class="lbl" x="845" y="127" text-anchor="middle">cross_check · Pro, two reads</text></g>
  <g class="po" style="--d:2.7s"><rect class="node light" x="730" y="146" width="230" height="32" rx="8"/><text class="lbl" x="845" y="167" text-anchor="middle">place · box on the page</text></g>
  <g class="po" style="--d:2.9s"><rect class="node light" x="730" y="186" width="230" height="32" rx="8"/><text class="lbl" x="845" y="207" text-anchor="middle">draft · name or clause</text></g>
  <g class="po" style="--d:3.1s"><rect class="node light" x="730" y="226" width="230" height="32" rx="8"/><text class="lbl" x="845" y="247" text-anchor="middle">policy · carry-over, spot checks</text></g>
  <path class="edge" d="M980 185 H1020" marker-end="url(#ar)"/>
  <g class="fu" style="--d:3.3s"><rect x="1020" y="110" width="122" height="150" rx="12" fill="#fff" stroke="#e3e7e7"/><text class="lbl t" x="1081" y="138" text-anchor="middle" font-size="15">DECIDE</text></g>
  <g class="po" style="--d:3.5s"><rect class="node light" x="1032" y="156" width="98" height="32" rx="8"/><text class="lbl" x="1081" y="177" text-anchor="middle">decide</text></g>
  <g class="po" style="--d:3.7s"><rect class="node light" x="1032" y="196" width="98" height="32" rx="8"/><text class="lbl" x="1081" y="217" text-anchor="middle">correct</text></g>
  <path class="edge" d="M1076 260 V300" marker-end="url(#ar)"/>
  <g class="po" style="--d:3.9s"><rect class="node" x="1010" y="300" width="132" height="50" rx="10"/><text class="lbl b" x="1076" y="322" text-anchor="middle">contract</text><text class="lbl b" x="1076" y="340" text-anchor="middle">storage</text></g>
  <path class="edge teal" style="stroke-dasharray:4 4" d="M845 350 V400 H575 V250"/>
  <text class="lbl m fu" style="--d:4.1s" x="710" y="418" text-anchor="middle">decisions become precedents</text>
  <circle r="7" fill="#00695c"><animateMotion dur="9s" repeatCount="indefinite" path="M70 185 H300 V330 V80 H575 V185 H845 V330 V80 H1081 V330"/></circle>
  <text class="lbl m" x="576" y="455" text-anchor="middle">So funktioniert es and Technik render this same stage list from GET /api/pipeline — the explanation cannot drift from the code</text>
</svg>
"""))

S.append(slide("S07Read", "Read", "Every page routed by what it is — nothing silently guessed", f"""
<svg width="1152" height="215" viewBox="0 0 1152 215">
  <defs><marker id="ar2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#90a4ae"/></marker></defs>
  <g class="po"><rect class="node" x="10" y="70" width="110" height="56" rx="10"/><text class="lbl b" x="65" y="103" text-anchor="middle">page</text></g>
  <path class="edge" d="M120 98 H170" marker-end="url(#ar2)"/>
  <g class="po" style="--d:.2s"><rect class="node" x="170" y="70" width="170" height="56" rx="10"/><text class="lbl b" x="255" y="93" text-anchor="middle">text layer?</text><text class="lbl m" x="255" y="112" text-anchor="middle">≥ 40 characters</text></g>
  <path class="edge teal" d="M340 88 H430 V40 H520" marker-end="url(#ar2)"/><text class="lbl t" x="385" y="80" text-anchor="middle">yes</text>
  <path class="edge" d="M340 110 H430 V160 H520" marker-end="url(#ar2)"/><text class="lbl m" x="385" y="150" text-anchor="middle">no</text>
  <g class="po" style="--d:.5s"><rect class="node light" x="520" y="14" width="150" height="52" rx="10"/><text class="lbl b" x="595" y="46" text-anchor="middle">text, exact</text></g>
  <g class="po" style="--d:.6s"><rect class="node" x="520" y="134" width="170" height="52" rx="10"/><text class="lbl b" x="605" y="155" text-anchor="middle">Tesseract</text><text class="lbl m" x="605" y="173" text-anchor="middle">eng + deu · word confidence</text></g>
  <path class="edge" d="M690 160 H760" marker-end="url(#ar2)"/>
  <g class="po" style="--d:.8s"><rect class="node" x="760" y="122" width="190" height="76" rx="10" stroke="#ed6c02"/><text class="lbl b" x="855" y="146" text-anchor="middle">three gates</text><text class="lbl m" x="855" y="164" text-anchor="middle">confidence &lt; 80 %</text><text class="lbl m" x="855" y="180" text-anchor="middle">&lt; 20 words · ink without words</text></g>
  <path class="edge" d="M950 160 H1010" marker-end="url(#ar2)"/>
  <g class="po" style="--d:1s"><rect class="node teal" x="1010" y="134" width="132" height="52" rx="10"/><text class="lbl w" x="1076" y="155" text-anchor="middle">Gemini Pro</text><text class="lbl w" x="1076" y="173" text-anchor="middle" font-size="12">vision · handwriting</text></g>
  <text class="lbl m fu" style="--d:1.2s" x="855" y="212" text-anchor="middle">below 50 % and no model: “nicht lesbar” — a visible verdict, never a silent pass</text>
</svg>
<div class="row" style="gap:14px;margin-top:10px">
  <div class="paper fu" style="--d:1.3s;flex:1;padding:14px 16px"><div class="tag">segment</div><div style="margin-top:8px;font-size:14px">Cuts at numbering, headings, § signs; signature blocks separate. <b>Clause = the unit</b> for retrieval, typing and the graph.</div><div class="small" style="margin-top:6px">vs fixed-size chunks that split a clause mid-sentence</div></div>
  <div class="paper fu" style="--d:1.5s;flex:1;padding:14px 16px"><div class="tag">classify</div><div style="margin-top:8px;font-size:14px">Keyword rules (heading ×3) <b>and</b> Gemini Flash label every clause. Agree → certain (≥ 0.9). Disagree → the cross-check decides.</div><div class="small" style="margin-top:6px">12 types; what each contract type needs is Legal’s file</div></div>
  <div class="paper fu" style="--d:1.7s;flex:1;padding:14px 16px"><div class="tag">entities</div><div style="margin-top:8px;font-size:14px">Register = built-in list + <b>GLEIF</b> names; fuzzy on OCR pages; “vormals” = historical; Arvato Systems = third party.</div><div class="small" style="margin-top:6px">identity from a public register, not from a vector</div></div>
  <div class="paper fu" style="--d:1.9s;flex:1;padding:14px 16px"><div class="tag red">screen</div><div style="margin-top:8px;font-size:14px">Documents are <b>untrusted input</b>: pattern + Flash-Lite screen; every prompt carries DOC_GUARD.</div><div class="small" style="margin-top:6px">fixture C13 carries a hidden injection</div></div>
</div>
"""))

S.append(slide("S08Graph", "The graph", "The database is the knowledge graph", f"""
<div class="row" style="gap:20px;height:100%">
  <div class="paper" style="flex:1.5;padding:12px">
    <svg width="700" height="500" viewBox="0 0 700 500">
      <defs><marker id="ar3" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#90a4ae"/></marker></defs>
      <g class="po" style="--d:.2s"><rect class="node teal" x="260" y="200" width="180" height="60" rx="30"/><text class="lbl w" x="350" y="236" text-anchor="middle" font-size="16">Contract</text></g>
      <path class="edge dr" style="--d:.4s" d="M350 200 V120" marker-end="url(#ar3)"/><text class="lbl m" x="362" y="165">OF_TYPE</text>
      <g class="po" style="--d:.5s"><rect class="node light" x="270" y="60" width="160" height="56" rx="28"/><text class="lbl b" x="350" y="94" text-anchor="middle">ContractType</text></g>
      <path class="edge dr" style="--d:.7s" d="M430 88 H540" marker-end="url(#ar3)"/><text class="lbl m" x="485" y="80" text-anchor="middle">REQUIRES</text>
      <path class="edge dr" style="--d:.7s" d="M430 100 C 500 130 560 130 590 150" marker-end="url(#ar3)"/>
      <g class="po" style="--d:.9s"><rect class="node light" x="540" y="60" width="150" height="56" rx="28"/><text class="lbl b" x="615" y="86" text-anchor="middle">ClauseType</text><text class="lbl m" x="615" y="104" text-anchor="middle">liability_cap</text></g>
      <g class="po" style="--d:1s"><rect class="node light pu" x="540" y="150" width="150" height="56" rx="28" stroke="#d32f2f" stroke-width="2.5"/><text class="lbl b" x="615" y="176" text-anchor="middle">ClauseType</text><text class="lbl m" x="615" y="194" text-anchor="middle">anti_corruption</text></g>
      <path class="edge dr" style="--d:1.1s" d="M440 230 H540" marker-end="url(#ar3)"/><text class="lbl m" x="490" y="222" text-anchor="middle">HAS_CLAUSE</text>
      <g class="po" style="--d:1.3s"><rect class="node" x="540" y="250" width="150" height="56" rx="28"/><text class="lbl b" x="615" y="276" text-anchor="middle">Clause</text><text class="lbl m" x="615" y="294" text-anchor="middle">§ 4 · vector · text</text></g>
      <path class="edge dr teal" style="--d:1.5s" d="M600 250 V116" marker-end="url(#ar3)"/><text class="lbl t" x="560" y="238" text-anchor="end">IS_A</text>
      <path class="edge red" d="M650 250 C 672 238 676 222 668 206"/>
      <text class="lbl fu" style="--d:1.9s" x="615" y="335" text-anchor="middle" fill="#d32f2f" font-weight="600">no IS_A path → the gap</text>
      <path class="edge dr" style="--d:2s" d="M260 230 H150" marker-end="url(#ar3)"/><text class="lbl m" x="205" y="222" text-anchor="middle">MENTIONS</text>
      <g class="po" style="--d:2.2s"><rect class="node" x="10" y="202" width="140" height="56" rx="28"/><text class="lbl b" x="80" y="226" text-anchor="middle">Entity</text><text class="lbl m" x="80" y="244" text-anchor="middle">Arvato Payment Sol. GmbH</text></g>
      <path class="edge dr teal" style="--d:2.4s" d="M80 258 V330" marker-end="url(#ar3)"/><text class="lbl t" x="92" y="300">RENAMED_TO</text>
      <g class="po" style="--d:2.6s"><rect class="node light" x="10" y="332" width="140" height="56" rx="28"/><text class="lbl b" x="80" y="356" text-anchor="middle">Entity</text><text class="lbl m" x="80" y="374" text-anchor="middle">Riverty GmbH · LEI</text></g>
      <path class="edge dr" style="--d:2.8s" d="M350 260 V370" marker-end="url(#ar3)"/><text class="lbl m" x="362" y="320">ON</text>
      <g class="po" style="--d:3s"><rect class="node" x="270" y="372" width="160" height="56" rx="28"/><text class="lbl b" x="350" y="396" text-anchor="middle">Decision</text><text class="lbl m" x="350" y="414" text-anchor="middle">accepted · note · text</text></g>
      <path class="edge dr" style="--d:3.2s" d="M430 400 C 560 430 730 330 692 200" marker-end="url(#ar3)"/><text class="lbl m" x="560" y="425">ABOUT</text>
      <text class="mono fu" style="--d:3.4s;font-size:12px" x="350" y="470" text-anchor="middle" fill="#00695c">MATCH (c)-[:OF_TYPE]->()-[:REQUIRES]->(t) WHERE NOT EXISTS {{ (c)-[:HAS_CLAUSE]->()-[:IS_A]->(t) }}</text>
      <text class="lbl m" x="350" y="490" text-anchor="middle">“which contracts lack a required clause” — one pattern, no search, no model</text>
    </svg>
  </div>
  <div class="col" style="flex:1;gap:12px">
    <div class="paper fu" style="--d:.6s;padding:14px 16px"><div class="tag">database-first</div><div style="margin-top:6px;font-size:14px">Seeded from files and registers, not from a model: the guideline (Legal’s file), the taxonomy, <b>GLEIF</b> — the public LEI register records <i>Arvato Payment Solutions GmbH</i> as the previous name of Riverty GmbH — and the team’s decisions.</div></div>
    <div class="paper fu" style="--d:1.2s;padding:14px 16px"><div class="tag">retrieval inside the graph</div><div style="margin-top:6px;font-size:14px">Every clause carries its embedding (768 d, cosine, Cypher <span class="mono">SEARCH</span>) and its text (Lucene). Hybrid = reciprocal rank fusion of both; scoped by graph filters.</div></div>
    <div class="paper fu" style="--d:1.8s;padding:14px 16px"><div class="tag grey">why not …</div><div style="margin-top:6px;font-size:14px"><b>Postgres + pgvector</b> (v1–v3): the questions became joins over label tables, knowledge lived in JSON. <b>Cosmos DB Gremlin</b>: no native vectors, Gremlin. <b>AGE on Azure PostgreSQL</b>: the Microsoft runner-up — swaps in for two modules.</div></div>
    <div class="paper fu" style="--d:2.4s;padding:14px 16px;border:2px solid var(--teal)"><div style="font-size:14px"><b>Live numbers on the Technik page:</b> nodes, edges, and how many gaps the pattern finds right now.</div></div>
  </div>
</div>
"""))

S.append(slide("S09Check", "Check", "Rules for recall, the model for precision", f"""
<div class="row" style="gap:20px;height:100%">
  <div class="paper" style="flex:1.4;padding:16px 18px">
    <svg width="660" height="470" viewBox="0 0 660 470">
      <defs><marker id="ar4" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#90a4ae"/></marker></defs>
      <g class="po"><rect class="node light" x="20" y="20" width="620" height="60" rx="10"/><text class="lbl b" x="330" y="45" text-anchor="middle">candidates from the rules</text><text class="lbl m" x="330" y="66" text-anchor="middle">required type without a certain clause · active old-name mention — recall 0.95, precision 0.43 (CUAD)</text></g>
      <path class="edge" d="M330 80 V110" marker-end="url(#ar4)"/>
      <g class="po" style="--d:.4s"><rect class="node" x="60" y="110" width="540" height="96" rx="10"/><text class="lbl b" x="330" y="136" text-anchor="middle">read 1 · what the graph selects</text><text class="lbl m" x="330" y="158" text-anchor="middle">the outline (every clause, type, page) + the 6 most relevant clauses (cosine ⊕ words)</text><text class="lbl m" x="330" y="176" text-anchor="middle">+ every clause of the type in question · for names: every clause with the name, preamble, signatures</text><text class="lbl t" x="330" y="197" text-anchor="middle">Gemini Pro · thinking high · structured verdict: confirmed | refuted | partial + page + quote + reason</text></g>
      <path class="edge" d="M330 206 V236" marker-end="url(#ar4)"/>
      <g class="po" style="--d:.8s"><rect class="node" x="200" y="236" width="260" height="46" rx="23" stroke="#ed6c02" stroke-width="2"/><text class="lbl b" x="330" y="264" text-anchor="middle">still “missing”?</text></g>
      <path class="edge teal" d="M460 259 H560 V330" marker-end="url(#ar4)"/><text class="lbl t" x="600" y="264">refuted → present</text>
      <path class="edge" d="M330 282 V312" marker-end="url(#ar4)"/><text class="lbl m" x="345" y="302">yes</text>
      <g class="po" style="--d:1.2s"><rect class="node light" x="60" y="312" width="540" height="60" rx="10"/><text class="lbl b" x="330" y="337" text-anchor="middle">read 2 · the whole contract</text><text class="lbl m" x="330" y="358" text-anchor="middle">skipped when read 1 already covered ≥ 90 % of the text · the cheap error (a false alarm) is caught here</text></g>
      <path class="edge" d="M330 372 V402" marker-end="url(#ar4)"/>
      <g class="po" style="--d:1.6s"><rect class="node teal" x="160" y="402" width="340" height="52" rx="10"/><text class="lbl w" x="330" y="424" text-anchor="middle">confirmed finding → the page</text><text class="lbl w" x="330" y="444" text-anchor="middle" font-size="12">precision 1.00 · recall 0.91 on 22 true absences</text></g>
    </svg>
  </div>
  <div class="col" style="flex:1;gap:12px">
    <div class="paper fu" style="--d:.5s;padding:14px 16px"><div class="tag">routing by risk</div><div style="margin-top:8px;font-size:14px;display:flex;flex-direction:column;gap:6px"><div><span class="chip on">Pro · high</span> verify · read handwriting</div><div><span class="chip">Flash · low/medium</span> label · extract · draft · locate</div><div><span class="chip">Flash-Lite</span> injection screen</div></div><div class="small" style="margin-top:8px">temperature 0, schema-validated outputs; <span class="mono">LLM_PROVIDER=foundry</span> → GPT-5 deployments, same table</div></div>
    <div class="paper fu" style="--d:1s;padding:14px 16px"><div class="tag amber">why two reads</div><div style="margin-top:6px;font-size:14px">Always full: ~5× the tokens, no scale to 300-page agreements. Only scoped: over-flags. The pair keeps the measured precision at a fifth of the cost.</div></div>
    <div class="paper fu" style="--d:1.5s;padding:14px 16px"><div class="tag green">degrades honestly</div><div style="margin-top:6px;font-size:14px">No key or an outage → the rule result stands, marked “ohne KI-Gegenprüfung”, repeated at the next start. Quota hit → fail fast, don’t hang.</div></div>
  </div>
</div>
"""))

S.append(slide("S10Decide", "Decide", "A person decides — and the review load falls with evidence", f"""
<div class="row" style="gap:20px;height:100%">
  <div class="col" style="flex:1;gap:12px">
    <div class="paper fu" style="padding:16px 18px">
      <div class="small">Old company name · Page 1</div>
      <div style="font-size:18px;font-weight:600;margin:4px 0 8px">Old company name: arvato Financial Solutions</div>
      <div class="small" style="font-style:italic">“… made on 2 June 2021 between arvato Financial Solutions, Gütersloher Straße 123 …”</div>
      <div class="small" style="margin-top:8px"><b>Reason:</b> the preamble names it as an active contracting party — not a historical reference.</div>
      <div style="margin-top:10px;font-size:13px;font-weight:600">Replace with</div>
      <div style="border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-top:4px;font-size:14px">Riverty GmbH</div>
      <div class="row" style="margin-top:12px;gap:10px"><span style="flex:1;text-align:center;padding:10px;border-radius:10px;background:var(--teal);color:#fff;font-weight:600">Accept</span><span style="flex:1;text-align:center;padding:10px;border-radius:10px;border:1px solid var(--teal);color:var(--teal);font-weight:600">Not applicable</span></div>
    </div>
    <div class="row" style="gap:12px">
      <div class="paper fu" style="--d:.4s;flex:1;padding:12px 14px"><div class="small">a false alarm, reviewed</div><div style="font-size:22px;font-weight:600;color:var(--green)">€4.50</div><div class="small">3 minutes</div></div>
      <div class="paper fu" style="--d:.5s;flex:1;padding:12px 14px"><div class="small">a false edit, filed</div><div style="font-size:22px;font-weight:600;color:var(--red)">€1k–100k</div><div class="small">rework, dispute, a document with legal effect</div></div>
    </div>
  </div>
  <div class="paper" style="flex:1.2;padding:16px 18px">
    <div style="font-weight:600">Review rate per class of finding</div>
    <div class="small">earned per class from the team’s own decisions — never granted on trust</div>
    <svg width="560" height="300" viewBox="0 0 560 300" style="margin-top:8px">
      <path d="M40 260 H520" stroke="#e3e7e7"/><path d="M40 20 V260" stroke="#e3e7e7"/>
      <text class="lbl m" x="30" y="45" text-anchor="end">100 %</text><text class="lbl m" x="30" y="205" text-anchor="end">20 %</text><text class="lbl m" x="30" y="240" text-anchor="end">10 %</text>
      <text class="lbl m" x="120" y="282" text-anchor="middle">8 agreeing in a row · ≥ 95 %</text><text class="lbl m" x="330" y="282" text-anchor="middle">24 in a row</text><text class="lbl m" x="470" y="282" text-anchor="middle">a dismissal</text>
      <path class="dr" style="--d:.3s" d="M40 40 H120 V200 H330 V236 H470 V40 H520" fill="none" stroke="#00695c" stroke-width="3"/>
      <circle class="po" style="--d:1.2s" cx="120" cy="200" r="6" fill="#00695c"/><circle class="po" style="--d:1.5s" cx="330" cy="236" r="6" fill="#00695c"/><circle class="po" style="--d:1.8s" cx="470" cy="40" r="6" fill="#d32f2f"/>
      <text class="lbl fu" style="--d:1.9s" x="480" y="30" fill="#d32f2f" font-weight="600">reset</text>
    </svg>
    <div class="small" style="margin-top:6px">Spot checks are deterministic (SHA-256), at least one per contract; only cross-checked findings are automated; automatic decisions look like any other and can be undone.</div>
    <div class="row fu" style="--d:2.1s;gap:8px;margin-top:10px;font-size:13px"><span class="tag">decision → carried over per file</span><span class="tag">note → verifier precedent</span><span class="tag">accepted text → drafting precedent</span></div>
  </div>
</div>
"""))

S.append(slide("S11UI", "The UI", "Three steps — the PDF is the interface", f"""
<div class="row" style="gap:16px;align-items:flex-start">
  <div class="col fu" style="flex:1;gap:8px"><div class="row" style="align-items:center;gap:8px"><span class="tag">1 · Hochladen</span><span class="small">drop one or many · one result line each · a filter for “which contracts lack X”</span></div>{img('01-home.jpg', 'width:100%;border:1px solid #e3e7e7;border-radius:10px;height:300px;object-fit:cover;object-position:top')}</div>
  <div class="col fu" style="--d:.3s;flex:1.35;gap:8px"><div class="row" style="align-items:center;gap:8px"><span class="tag">2 · Prüfen</span><span class="small">markers on the page · one finding at a time · Übernehmen / Nicht zutreffend</span></div>{img('02-contract.jpg', 'width:100%;border:1px solid #e3e7e7;border-radius:10px;height:300px;object-fit:cover;object-position:top')}</div>
  <div class="col fu" style="--d:.6s;flex:1;gap:8px"><div class="row" style="align-items:center;gap:8px"><span class="tag">3 · Herunterladen</span><span class="small">what was applied · the copy · preview · filing</span></div>{img('02b-download.jpg', 'width:100%;border:1px solid #e3e7e7;border-radius:10px;height:300px;object-fit:contain;background:#fff')}</div>
</div>
<div class="row" style="gap:12px;margin-top:14px">
  <div class="paper fu" style="--d:.9s;flex:1;padding:12px 14px;font-size:14px"><b>Why one finding at a time.</b> The only clicks are decisions; a decision moves on; the marker on the page is verified with a glance — a list would send the lawyer back into the PDF.</div>
  <div class="paper fu" style="--d:1.1s;flex:1;padding:12px 14px;font-size:14px"><b>Why no numbers for lawyers.</b> No confidences, no traces on these pages — quote, reason, marker, and whether it was cross-checked. German first, English one click.</div>
  <div class="paper fu" style="--d:1.3s;flex:1;padding:12px 14px;font-size:14px"><b>Why a Technik page.</b> Engineers get the same 14 stages with module, model, thresholds, the graph’s live counts and a trace of one contract — generated, so it cannot drift.</div>
</div>
"""))

S.append(slide("S12Infra", "Infrastructure", "Azure — and one switch per external dependency", f"""
<div class="row" style="gap:20px;height:100%">
  <div class="paper" style="flex:1.5;padding:10px">
    <svg width="700" height="500" viewBox="0 0 700 500">
      <defs><marker id="ar5" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#90a4ae"/></marker></defs>
      <rect x="150" y="20" width="420" height="440" rx="14" fill="#fff" stroke="#00695c" stroke-dasharray="6 5"/><text class="lbl t" x="360" y="44" text-anchor="middle">Azure · Container Apps environment · Terraform</text>
      <g class="po" style="--d:.2s"><rect class="node" x="20" y="90" width="110" height="56" rx="10"/><text class="lbl b" x="75" y="114" text-anchor="middle">SharePoint</text><text class="lbl m" x="75" y="132" text-anchor="middle">Graph delta</text></g>
      <path class="edge" d="M130 118 H190" marker-end="url(#ar5)"/>
      <g class="po" style="--d:.4s"><rect class="node light" x="190" y="80" width="150" height="76" rx="10"/><text class="lbl b" x="265" y="106" text-anchor="middle">API</text><text class="lbl m" x="265" y="124" text-anchor="middle">FastAPI · LangGraph</text><text class="lbl m" x="265" y="142" text-anchor="middle">internal ingress</text></g>
      <g class="po" style="--d:.5s"><rect class="node light" x="190" y="200" width="150" height="60" rx="10"/><text class="lbl b" x="265" y="226" text-anchor="middle">Web</text><text class="lbl m" x="265" y="244" text-anchor="middle">React · Entra ID sign-in</text></g>
      <path class="edge" d="M265 200 V156" marker-end="url(#ar5)"/>
      <g class="po" style="--d:.7s"><rect class="node teal" x="400" y="80" width="150" height="76" rx="10"/><text class="lbl w" x="475" y="108" text-anchor="middle">Neo4j</text><text class="lbl w" x="475" y="128" text-anchor="middle" font-size="12">AuraDB (Marketplace)</text><text class="lbl w" x="475" y="144" text-anchor="middle" font-size="12">or the container</text></g>
      <path class="edge" d="M340 118 H400" marker-end="url(#ar5)"/>
      <g class="po" style="--d:.9s"><rect class="node" x="400" y="200" width="150" height="46" rx="10"/><text class="lbl b" x="475" y="228" text-anchor="middle">Blob · working copies</text></g>
      <g class="po" style="--d:1s"><rect class="node" x="400" y="262" width="150" height="46" rx="10"/><text class="lbl b" x="475" y="290" text-anchor="middle">Key Vault</text></g>
      <g class="po" style="--d:1.1s"><rect class="node" x="400" y="324" width="150" height="46" rx="10"/><text class="lbl b" x="475" y="352" text-anchor="middle">Log Analytics</text></g>
      <g class="po" style="--d:1.2s"><rect class="node" x="400" y="386" width="150" height="46" rx="10"/><text class="lbl b" x="475" y="414" text-anchor="middle">Document Intelligence</text></g>
      <path class="edge" d="M340 128 C 370 200 370 300 400 300"/><path class="edge" d="M340 132 C 372 260 372 340 400 347"/><path class="edge" d="M340 136 C 374 320 374 400 400 409"/>
      <g class="po" style="--d:1.4s"><rect class="node" x="20" y="300" width="110" height="60" rx="10"/><text class="lbl b" x="75" y="324" text-anchor="middle">Gemini</text><text class="lbl m" x="75" y="342" text-anchor="middle">Vertex · EU</text></g>
      <g class="po" style="--d:1.5s"><rect class="node" x="20" y="380" width="110" height="60" rx="10"/><text class="lbl b" x="75" y="404" text-anchor="middle">Foundry</text><text class="lbl m" x="75" y="422" text-anchor="middle">GPT-5 · Data Zone</text></g>
      <path class="edge" d="M190 140 C 160 200 140 260 130 320"/><path class="edge" d="M190 146 C 150 240 140 330 130 400"/>
      <g class="po" style="--d:1.7s"><rect class="node" x="590" y="90" width="100" height="56" rx="10"/><text class="lbl b" x="640" y="114" text-anchor="middle">Contract</text><text class="lbl b" x="640" y="132" text-anchor="middle">storage</text></g>
      <path class="edge" d="M340 100 C 420 60 520 60 590 110" marker-end="url(#ar5)"/><text class="lbl m" x="470" y="66" text-anchor="middle">Idempotency-Key</text>
      <text class="lbl m" x="360" y="485" text-anchor="middle">documents never leave the tenant; only the checked contract’s pages go to the model</text>
    </svg>
  </div>
  <div class="col" style="flex:1;gap:10px">
    <div class="paper fu" style="--d:.5s;padding:12px 14px"><div class="tag">best-of-breed | Microsoft</div><table style="width:100%;margin-top:8px;font-size:13px;border-collapse:collapse"><tr><td style="padding:4px 0;color:var(--muted)">models</td><td>Gemini 3.x</td><td>Azure AI Foundry</td></tr><tr><td style="padding:4px 0;color:var(--muted)">OCR</td><td>Tesseract + vision</td><td>Document Intelligence</td></tr><tr><td style="padding:4px 0;color:var(--muted)">source</td><td>folder (demo)</td><td>SharePoint · Graph</td></tr><tr><td style="padding:4px 0;color:var(--muted)">database</td><td>Neo4j</td><td>AGE + pgvector on Azure PostgreSQL</td></tr></table><div class="small" style="margin-top:8px">each behind one environment variable — the comparison is a configuration, not a rewrite</div></div>
    <div class="paper fu" style="--d:1s;padding:12px 14px;font-size:14px"><b>Why Container Apps.</b> The smallest Azure service that runs containers with managed identity, secrets and scale-to-zero; everything else is the managed twin of what compose runs locally.</div>
    <div class="paper fu" style="--d:1.4s;padding:12px 14px;font-size:14px"><b>Why Gemini by default.</b> 1M context makes the full read routine; Pro reads handwriting; the statement names it. <b>Foundry when</b> EU-only inference is required today.</div>
  </div>
</div>
"""))

S.append(slide("S13Alignment", "Against the problem statement", "What was asked — and where it is", f"""
<div class="row" style="gap:20px">
  <div class="paper fu" style="flex:1.3;padding:14px 18px">
    <div style="font-weight:600;margin-bottom:8px">The task</div>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:5px 0"><span class="tag green">✓</span></td><td style="padding:5px 8px">basic pipeline · analyse and make accessible</td><td class="small">14 stages · graph · retrieval · cited Q&amp;A</td></tr>
      <tr><td style="padding:5px 0"><span class="tag green">✓</span></td><td style="padding:5px 8px">basic front-end</td><td class="small">three steps · DE/EN · 9 browser tests</td></tr>
      <tr><td style="padding:5px 0"><span class="tag green">✓</span></td><td style="padding:5px 8px">end-to-end workflow</td><td class="small">upload → check → decide → copy → filing</td></tr>
      <tr><td style="padding:5px 0"><span class="tag green">✓</span></td><td style="padding:5px 8px">contracts without a passage · old company name</td><td class="small">the two questions, on the page and across contracts</td></tr>
      <tr><td style="padding:5px 0"><span class="tag green">✓</span></td><td style="padding:5px 8px">scans and handwritten JPEGs</td><td class="small">per-page routing · vision</td></tr>
      <tr><td style="padding:5px 0"><span class="tag amber">◐</span></td><td style="padding:5px 8px">SharePoint</td><td class="small">Graph delta sync written · not run against a tenant</td></tr>
      <tr><td style="padding:5px 0"><span class="tag amber">◐</span></td><td style="padding:5px 8px">contract storage · store a copy only</td><td class="small">idempotent filing · mocked API</td></tr>
      <tr><td style="padding:5px 0"><span class="tag amber">◐</span></td><td style="padding:5px 8px">corporate guidelines · best interests</td><td class="small">guideline file · drafts · no playbook yet</td></tr>
      <tr><td style="padding:5px 0"><span class="tag green">✓</span></td><td style="padding:5px 8px">best-of-breed vs Microsoft</td><td class="small">every dependency, one switch</td></tr>
    </table>
  </div>
  <div class="paper fu" style="--d:.3s;flex:1;padding:14px 18px">
    <div style="font-weight:600;margin-bottom:8px">Your stack</div>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:5px 0;font-weight:500">Azure</td><td class="small">Container Apps, Key Vault, Blob, Log Analytics, Document Intelligence — Terraform</td></tr>
      <tr><td style="padding:5px 0;font-weight:500">Foundry / Gemini</td><td class="small">both, one routing table</td></tr>
      <tr><td style="padding:5px 0;font-weight:500">Containers</td><td class="small">compose: neo4j · api · web</td></tr>
      <tr><td style="padding:5px 0;font-weight:500">Python · FastAPI</td><td class="small">the API, PyMuPDF, Tesseract, Neo4j driver</td></tr>
      <tr><td style="padding:5px 0;font-weight:500">Terraform</td><td class="small">the production shape, documented</td></tr>
      <tr><td style="padding:5px 0;font-weight:500">React · TypeScript</td><td class="small">Vite, MUI, Playwright</td></tr>
      <tr><td style="padding:5px 0;font-weight:500">LangChain · LangGraph</td><td class="small">the check, the audits, the Q&amp;A as state graphs</td></tr>
    </table>
    <div class="small fu" style="--d:.8s;margin-top:12px">“AI usage as long as we understand what is happening”: docs/how-ai-was-used.md records what the AI built and what a human decided, turn by turn.</div>
  </div>
</div>
"""))

S.append(slide("S14Adoption", "Adoption", "How the legal team gets the most out of it", f"""
<svg width="1152" height="150" viewBox="0 0 1152 150">
  <defs><marker id="ar6" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="#90a4ae"/></marker></defs>
  <g class="po"><rect class="node light" x="10" y="30" width="250" height="90" rx="12"/><text class="lbl b" x="135" y="62" text-anchor="middle">1 · Pilot on the next sweep</text><text class="lbl m" x="135" y="84" text-anchor="middle">the bank rename, two lawyers,</text><text class="lbl m" x="135" y="102" text-anchor="middle">measured against the manual sample</text></g>
  <path class="edge" d="M260 75 H300" marker-end="url(#ar6)"/>
  <g class="po" style="--d:.3s"><rect class="node light" x="300" y="30" width="250" height="90" rx="12"/><text class="lbl b" x="425" y="62" text-anchor="middle">2 · Legal owns the rules</text><text class="lbl m" x="425" y="84" text-anchor="middle">the guideline file, the register,</text><text class="lbl m" x="425" y="102" text-anchor="middle">the clause types — no engineer needed</text></g>
  <path class="edge" d="M550 75 H590" marker-end="url(#ar6)"/>
  <g class="po" style="--d:.6s"><rect class="node light" x="590" y="30" width="250" height="90" rx="12"/><text class="lbl b" x="715" y="62" text-anchor="middle">3 · Decide on the page</text><text class="lbl m" x="715" y="84" text-anchor="middle">every decision teaches: precedents,</text><text class="lbl m" x="715" y="102" text-anchor="middle">the review rate as the trust meter</text></g>
  <path class="edge" d="M840 75 H880" marker-end="url(#ar6)"/>
  <g class="po" style="--d:.9s"><rect class="node teal" x="880" y="30" width="262" height="90" rx="12"/><text class="lbl w" x="1011" y="62" text-anchor="middle">4 · Routine</text><text class="lbl w" x="1011" y="84" text-anchor="middle" font-size="12">sweeps on events, the daily flow,</text><text class="lbl w" x="1011" y="102" text-anchor="middle" font-size="12">spot checks, the corrected copy filed</text></g>
</svg>
<div class="row" style="gap:14px;margin-top:14px">
  <div class="paper fu" style="--d:1.1s;flex:1;padding:14px 16px"><div class="tag">trust</div><div style="margin-top:8px;font-size:14px">Nothing is changed by the machine. The original is never touched; every decision is a named person’s; the audit log answers “who accepted what, when, on which file”.</div></div>
  <div class="paper fu" style="--d:1.3s;flex:1;padding:14px 16px"><div class="tag">learning</div><div style="margin-top:8px;font-size:14px"><i>So funktioniert es</i> for the team, <i>Technik</i> for IT and audit — both generated from the code. Half an hour of onboarding: drop, decide, download.</div></div>
  <div class="paper fu" style="--d:1.5s;flex:1;padding:14px 16px"><div class="tag">measure</div><div style="margin-top:8px;font-size:14px">Minutes per contract, review rate per class of finding, findings per 1,000 pages, and precision/recall against the answer key — reported, not asserted.</div></div>
  <div class="paper fu" style="--d:1.7s;flex:1;padding:14px 16px"><div class="tag amber">honest limits</div><div style="margin-top:8px;font-size:14px">Drafts are starting points. Handwriting depends on the vision model. A missing clause goes on an addendum page — a PDF does not reflow.</div></div>
</div>
"""))

S.append(slide("S15Demo", "Live demo · 5 minutes", "Demo — then what is next", f"""
<div class="row" style="gap:20px">
  <div class="paper fu" style="flex:1.2;padding:16px 20px">
    <div style="font-weight:600;margin-bottom:10px">Six beats</div>
    <div class="col" style="gap:8px;font-size:15px">
      <div class="row" style="gap:10px;align-items:center"><span class="tag">1</span>drop a contract → “Wird gelesen … Wird geprüft …” → the result line</div>
      <div class="row" style="gap:10px;align-items:center"><span class="tag">2</span>open it: the box on the page, the quote, the model’s reason, Übernehmen / Nicht zutreffend</div>
      <div class="row" style="gap:10px;align-items:center"><span class="tag">3</span>Weiter zum Download: the corrected copy, the preview, filing under an idempotency key</div>
      <div class="row" style="gap:10px;align-items:center"><span class="tag">4</span>the start page filter: which contracts lack a limitation of liability?</div>
      <div class="row" style="gap:10px;align-items:center"><span class="tag">5</span>Technik: the stages with their models, the graph’s live counts, the gap query, a trace</div>
      <div class="row" style="gap:10px;align-items:center"><span class="tag">6</span>the Neo4j browser: the contract as a graph</div>
    </div>
  </div>
  <div class="paper fu" style="--d:.4s;flex:1;padding:16px 20px">
    <div style="font-weight:600;margin-bottom:10px">Next</div>
    <div class="col" style="gap:8px;font-size:15px">
      <div>· SharePoint against the real tenant (app registration, Sites.Read.All)</div>
      <div>· the contract storage’s real API — an adapter</div>
      <div>· Entra ID sign-in, structured logging, metrics</div>
      <div>· a playbook of preferred positions for the drafts</div>
      <div>· parallel ingestion behind a queue for sweeps</div>
      <div>· a pairwise “compare two contracts” view</div>
    </div>
    <div class="small" style="margin-top:14px">Everything measured, every decision and its why: docs/architecture-decisions.md · docs/cost-benefit.md · docs/ps-coverage.md</div>
  </div>
</div>
<div class="fu" style="--d:.9s;margin-top:22px;font-size:22px;font-weight:500;text-align:center;color:var(--teal)">The AI finds and explains. A lawyer decides. The graph remembers.</div>
"""))


# ------------------------------------------------------------------ outputs
def render(s: dict, n: int) -> str:
    return (f'<section class="slide" id="s{n}"><header><span class="kicker">{s["kicker"]}</span><h1>{s["title"]}</h1></header>'
            f'<div class="body">{s["body"]}</div><footer><span>Contract Intelligence · Riverty case study</span><span>{n} / {len(S)}</span></footer></section>')


def inline_images(html: str) -> str:
    for name, data in IMG.items():
        html = html.replace(f'src="{name}"', f'src="data:image/jpeg;base64,{data}"')
    return html


DECK_JS = """
const slides=[...document.querySelectorAll('.slide')];let i=Math.max(0,Math.min(slides.length-1,(parseInt(location.hash.slice(1))||1)-1));
const stage=document.getElementById('stage');const bar=document.getElementById('bar');
function fit(){const k=Math.min(innerWidth/1280,innerHeight/720);stage.style.transform=`translate(-50%,-50%) scale(${k})`}
function count(el){const to=parseInt(el.dataset.count,10);const t0=performance.now();const f=(t)=>{const p=Math.min(1,(t-t0)/1200);const v=Math.round(to*(1-Math.pow(1-p,3)));el.textContent=v.toLocaleString('en-US');if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
function show(n){i=n;slides.forEach((s,k)=>{s.classList.toggle('active',k===i);s.style.display=k===i?'block':'none'});location.hash='#'+(i+1);bar.style.width=((i+1)/slides.length*100)+'%';slides[i].querySelectorAll('[data-count]').forEach(count)}
addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();show(Math.min(slides.length-1,i+1))}if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();show(Math.max(0,i-1))}if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1)});
stage.addEventListener('click',e=>{show(e.clientX>innerWidth/2?Math.min(slides.length-1,i+1):Math.max(0,i-1))});
addEventListener('resize',fit);addEventListener('hashchange',()=>{const n=(parseInt(location.hash.slice(1))||1)-1;if(n!==i)show(n)});
if(location.search.includes('print')){document.body.classList.add('print');slides.forEach(s=>{s.classList.add('active');s.style.display='block'})}else{fit();show(i)}
"""

DECK_CSS = """
html,body{margin:0;height:100%;background:#0f1a19}
#stage{position:absolute;left:50%;top:50%;width:1280px;height:720px;transform-origin:center;box-shadow:0 30px 80px rgba(0,0,0,.4)}
#bar{position:fixed;left:0;bottom:0;height:4px;background:#00695c;width:0;transition:width .3s}
.slide{display:none}
body.print{background:#fff;height:auto}body.print #stage{position:static;transform:none;width:1280px;height:auto;box-shadow:none;margin:0 auto}
body.print .slide{display:block;page-break-after:always;border-bottom:1px solid #e3e7e7}body.print #bar{display:none}
@page{size:1280px 720px;margin:0}
"""


def deck() -> str:
    body = "\n".join(render(s, n) for n, s in enumerate(S, start=1))
    return inline_images(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contract Intelligence — Riverty case study</title>{FONT}<style>{CSS}{DECK_CSS}</style></head>
<body><div id="stage">{body}</div><div id="bar"></div><script>{DECK_JS}</script></body></html>""")


def artboard(s: dict, n: int) -> str:
    inner = render(s, n).replace('class="slide"', 'class="slide active"', 1)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONT}
  <style>
    body {{ margin: 0; background: #f4f6f6; }}
    a {{ color: #00695c; }} a:hover {{ color: #004d40; }}
    {CSS}
  </style>
</helmet>
{inner}
</x-dc>
</body>
</html>
"""


def main() -> None:
    (HERE.parent / "presentation.html").write_text(deck(), encoding="utf-8")
    out = HERE / "artboards"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.dc.html"):
        old.unlink()
    boards = []
    for n, s in enumerate(S, start=1):
        (out / f"{s['stem']}.dc.html").write_text(artboard(s, n), encoding="utf-8")
        col, row = (n - 1) % 3, (n - 1) // 3
        boards.append({"file": f"{s['stem']}.dc.html", "x": col * (W + 120), "y": row * (H + 180), "w": W, "h": H,
                       "title": f"{n} · {s['title'][:40]}"})
    (out / "canvas.json").write_text(json.dumps({"artboards": boards, "launch": {"view": "canvas"}}, indent=2), encoding="utf-8")
    print(f"deck: docs/presentation.html ({len(S)} slides); artboards: {out}")


if __name__ == "__main__":
    main()
