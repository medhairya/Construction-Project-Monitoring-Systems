/**
 * Generates docs/architecture.excalidraw.
 *
 * Written as a script rather than hand-placed JSON so the coordinates are
 * computed: rows line up, arrows meet box edges, and the file can be
 * regenerated after a change instead of nudged by hand.
 *
 *   npm run docs:diagram
 *
 * Open the result at excalidraw.com (File -> Open) to edit or export a PNG.
 */
import fs from "node:fs";
import path from "node:path";

let seedCounter = 1;
const nextSeed = () => seedCounter++ * 104729;
const elements = [];

const PALETTE = {
  ministry: { bg: "#e0f2fe", stroke: "#0c8599" },
  finance: { bg: "#fff9db", stroke: "#e67700" },
  rb: { bg: "#d3f9d8", stroke: "#2b8a3e" },
  tender: { bg: "#ffe3e3", stroke: "#c92a2a" },
  site: { bg: "#f3d9fa", stroke: "#9c36b5" },
  neutral: { bg: "#f1f3f5", stroke: "#495057" },
  app: { bg: "#e7f5ff", stroke: "#1971c2" },
  db: { bg: "#d3f9d8", stroke: "#2b8a3e" },
  ai: { bg: "#f3d9fa", stroke: "#9c36b5" },
  alert: { bg: "#ffe3e3", stroke: "#c92a2a" },
  white: { bg: "transparent", stroke: "#343a40" },
};

function base(extra) {
  return {
    id: "el-" + elements.length + "-" + Math.random().toString(36).slice(2, 9),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    angle: 0,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    seed: nextSeed(),
    ...extra,
  };
}

/** A labelled box. The label is bound to the container so it stays centred. */
function box({ x, y, w, h, label, tone = "neutral", size = 16, dashed = false }) {
  const { bg, stroke } = PALETTE[tone];
  const rectId = "rect-" + elements.length + "-" + Math.random().toString(36).slice(2, 9);
  const textId = "text-" + elements.length + "-" + Math.random().toString(36).slice(2, 9);
  const lines = label.split("\n");

  elements.push(
    base({
      id: rectId,
      type: "rectangle",
      x,
      y,
      width: w,
      height: h,
      strokeColor: stroke,
      backgroundColor: bg,
      strokeStyle: dashed ? "dashed" : "solid",
      boundElements: [{ id: textId, type: "text" }],
    }),
  );
  elements.push(
    base({
      id: textId,
      type: "text",
      x: x + 8,
      y: y + h / 2 - (lines.length * size * 1.25) / 2,
      width: w - 16,
      height: lines.length * size * 1.25,
      strokeColor: stroke,
      backgroundColor: "transparent",
      text: label,
      fontSize: size,
      fontFamily: 2,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: rectId,
      originalText: label,
      lineHeight: 1.25,
      baseline: size,
      roundness: null,
    }),
  );
  return { id: rectId, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/** Free-standing text, for headings and annotations. */
function label({ x, y, text, size = 18, color = "#343a40", align = "left", width }) {
  const lines = text.split("\n");
  elements.push(
    base({
      type: "text",
      x,
      y,
      width: width ?? Math.max(...lines.map((l) => l.length)) * size * 0.58,
      height: lines.length * size * 1.25,
      strokeColor: color,
      backgroundColor: "transparent",
      text,
      fontSize: size,
      fontFamily: 2,
      textAlign: align,
      verticalAlign: "top",
      containerId: null,
      originalText: text,
      lineHeight: 1.25,
      baseline: size,
      roundness: null,
      strokeWidth: 1,
    }),
  );
}

function arrow({ from, to, text, dashed = false, color = "#343a40", bend = 0 }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const points = bend
    ? [
        [0, 0],
        [dx / 2, dy / 2 + bend],
        [dx, dy],
      ]
    : [
        [0, 0],
        [dx, dy],
      ];
  elements.push(
    base({
      type: "arrow",
      x: from.x,
      y: from.y,
      width: Math.abs(dx),
      height: Math.abs(dy),
      strokeColor: color,
      backgroundColor: "transparent",
      strokeStyle: dashed ? "dashed" : "solid",
      strokeWidth: 2,
      points,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
      roundness: { type: 2 },
    }),
  );
  if (text) {
    label({
      x: from.x + dx / 2 - text.length * 3.6,
      y: from.y + dy / 2 + bend - 20,
      text,
      size: 12,
      color,
    });
  }
}

function panel({ x, y, w, h, title, color = "#adb5bd" }) {
  elements.push(
    base({
      type: "rectangle",
      x,
      y,
      width: w,
      height: h,
      strokeColor: color,
      backgroundColor: "transparent",
      strokeStyle: "dashed",
      strokeWidth: 1,
      roughness: 0,
    }),
  );
  label({ x: x + 14, y: y + 12, text: title, size: 14, color });
}

// ===========================================================================
// 1. Title
// ===========================================================================
label({ x: 40, y: 20, text: "PWFTS — Public Works File Tracking & Project Monitoring", size: 28, color: "#1864ab" });
label({
  x: 40,
  y: 62,
  text: "Where is the file? With whom? For how long? Why?",
  size: 16,
  color: "#5c7cfa",
});

// ===========================================================================
// 2. The nine stages
// ===========================================================================
label({ x: 40, y: 120, text: "① THE FILE'S JOURNEY — nine stages, one active at a time (R1)", size: 18, color: "#212529" });

const STAGES = [
  ["1 · Ministry\nProposal", "MIN · 15d", "ministry"],
  ["2 · Admin\nApproval", "FIN · 21d", "finance"],
  ["3 · Technical\nSanction", "RB · 21d", "rb"],
  ["4 · Tender", "TND · 45d", "tender"],
  ["5 · Work\nOrder", "RB · 7d", "rb"],
  ["6 · Site\nExecution", "SITE · 180d", "site"],
  ["7 · Completion\nReport", "RB · 15d", "rb"],
  ["8 · Final Bill", "FIN · 30d", "finance"],
  ["9 · DLP &\nClosure", "RB · 365d", "rb"],
];

const stageBoxes = [];
const SW = 138;
const SGAP = 20;
STAGES.forEach(([name, meta, tone], i) => {
  const x = 40 + i * (SW + SGAP);
  const b = box({ x, y: 160, w: SW, h: 92, label: name + "\n" + meta, tone, size: 13 });
  stageBoxes.push(b);
  if (i > 0) {
    arrow({
      from: { x: stageBoxes[i - 1].x + SW, y: 206 },
      to: { x: x - 4, y: 206 },
    });
  }
});

// Return loop, drawn under the strip.
arrow({
  from: { x: stageBoxes[3].cx, y: 252 },
  to: { x: stageBoxes[1].cx, y: 252 },
  text: "RETURN — reason mandatory, SLA restarts, new stage instance (R4)",
  dashed: true,
  color: "#e8590c",
  bend: 60,
});

// ===========================================================================
// 3. Departments and desks
// ===========================================================================
label({ x: 40, y: 400, text: "② WHO HOLDS IT — departments, desks and who may approve", size: 18, color: "#212529" });

const cmo = box({ x: 40, y: 440, w: 240, h: 76, label: "MINISTRY (CMO)\ncreates projects · decides escalations", tone: "ministry", size: 13 });

const depts = [
  ["FINANCE\nstages 2, 8", "finance", ["Section Officer", "Accounts Officer", "Planning Officer", "Deputy Secretary", "✅ Secretary — approves"]],
  ["ROADS & BUILDINGS\nstages 3, 5, 7, 9", "rb", ["Junior Engineer", "Deputy Engineer", "Executive Engineer", "Superintending Eng.", "✅ Chief Engineer — approves"]],
  ["TENDER CELL\nstage 4", "tender", ["Tender Clerk", "✅ Tender Officer — approves"]],
  ["SITE EXECUTION WING\nstage 6", "site", ["Site Engineer — reports", "✅ EE (Site Wing) — approves"]],
];

depts.forEach(([name, tone, desks], i) => {
  const x = 340 + i * 270;
  const d = box({ x, y: 440, w: 240, h: 76, label: name, tone, size: 13 });
  arrow({ from: { x: cmo.x + cmo.w, y: 478 }, to: { x: x - 4, y: 478 }, dashed: true, color: "#adb5bd" });
  desks.forEach((desk, j) => {
    const isHead = desk.startsWith("✅");
    box({
      x: x + 16,
      y: 540 + j * 46,
      w: 208,
      h: 38,
      label: desk,
      tone: isHead ? tone : "white",
      size: 12,
    });
    if (j > 0) {
      arrow({ from: { x: x + 120, y: 540 + (j - 1) * 46 + 38 }, to: { x: x + 120, y: 540 + j * 46 - 2 }, color: "#adb5bd" });
    }
  });
});

label({
  x: 340,
  y: 790,
  text: "Only the head of the owning department may approve or return (R3).\nOperators forward between desks inside their own department only.\nSub-tasks may run in parallel inside a stage; the stage cannot advance until all are closed (R2).",
  size: 13,
  color: "#495057",
});

// ===========================================================================
// 4. Escalation loop
// ===========================================================================
label({ x: 40, y: 880, text: "③ WHEN THE CLOCK BREAKS — rule R7, the accountability loop", size: 18, color: "#212529" });

const e1 = box({ x: 40, y: 925, w: 200, h: 80, label: "SLA BREACHED\nstage → BREACHED\nproject → ESCALATED", tone: "alert", size: 13 });
const e2 = box({ x: 290, y: 925, w: 200, h: 80, label: "🔒 FROZEN\nno forward movement\nuntil decided", tone: "alert", size: 13 });
const e3 = box({ x: 540, y: 925, w: 220, h: 80, label: "JUSTIFICATION\ncause · explanation · impact\nfix · new ETA", tone: "finance", size: 13 });
const e4 = box({ x: 810, y: 925, w: 220, h: 80, label: "OFFICIAL CHAT\nappend-only · timestamped\nMinistry ↔ officer", tone: "ministry", size: 13 });
const e5 = box({ x: 1080, y: 925, w: 220, h: 80, label: "MINISTRY DECISION\ntype · changes · reason\nnew SLA · re-entry stage", tone: "ministry", size: 13 });
const e6 = box({ x: 1350, y: 925, w: 200, h: 80, label: "RE-ENTRY\npriority HIGH\ntop of the inbox", tone: "rb", size: 13 });

[[e1, e2], [e2, e3], [e3, e4], [e4, e5], [e5, e6]].forEach(([a, b]) =>
  arrow({ from: { x: a.x + a.w, y: 965 }, to: { x: b.x - 4, y: 965 } }),
);
arrow({
  from: { x: e6.cx, y: 1005 },
  to: { x: stageBoxes[1].cx, y: 1005 },
  text: "file re-enters the flow at the stage the Ministry chose",
  dashed: true,
  color: "#2b8a3e",
  bend: 70,
});

label({
  x: 40,
  y: 1030,
  text: "Green until 75% of the SLA is used · amber from 75% · red once breached.\nThe demo clock (+1 / +7 days) moves now_app(), so a breach can be shown live.",
  size: 13,
  color: "#495057",
});

// ===========================================================================
// 5. System architecture
// ===========================================================================
label({ x: 40, y: 1130, text: "④ SYSTEM ARCHITECTURE", size: 18, color: "#212529" });

panel({ x: 40, y: 1170, w: 420, h: 130, title: "BROWSER" });
box({ x: 70, y: 1210, w: 360, h: 70, label: "React Server Components + client islands\nTailwind · Recharts · shadcn-style primitives", tone: "neutral", size: 13 });

panel({ x: 500, y: 1170, w: 560, h: 330, title: "VERCEL — Next.js 16 App Router" });
const pages = box({ x: 530, y: 1210, w: 240, h: 70, label: "Pages (server)\npassport · inbox · escalations", tone: "app", size: 13 });
const actions = box({ x: 790, y: 1210, w: 240, h: 70, label: "Server Actions\nZod-validated", tone: "app", size: 13 });
const libs = box({ x: 530, y: 1300, w: 500, h: 80, label: "/lib/workflow — rules R1–R5, pure TypeScript, unit tested\n/lib/rbac — visibility matrix   ·   /lib/sla · /lib/execution — maths", tone: "app", size: 13 });
const cron = box({ x: 530, y: 1400, w: 240, h: 60, label: "/api/cron/sla\nprotected sweep", tone: "app", size: 13 });
const upload = box({ x: 790, y: 1400, w: 240, h: 60, label: "photo upload", tone: "app", size: 13 });

panel({ x: 1100, y: 1170, w: 480, h: 330, title: "SUPABASE" });
const rpc = box({ x: 1130, y: 1210, w: 420, h: 90, label: "PL/pgSQL functions — the same rules again\nfn_create_project · fn_approve_stage · fn_return_stage\nfn_forward_file · fn_sla_sweep · fn_record_decision", tone: "db", size: 12 });
const tables = box({ x: 1130, y: 1320, w: 420, h: 70, label: "Postgres tables\nprojects · stage_instances · file_movements · escalations", tone: "db", size: 12 });
const guards = box({ x: 1130, y: 1410, w: 200, h: 60, label: "RLS + append-only\ntriggers (R8)", tone: "db", size: 12 });
const storage = box({ x: 1350, y: 1410, w: 200, h: 60, label: "Storage\nsite photos", tone: "db", size: 12 });

arrow({ from: { x: 430, y: 1245 }, to: { x: pages.x - 4, y: 1245 }, text: "navigate" });
arrow({ from: { x: 430, y: 1265 }, to: { x: actions.x - 4, y: 1265 }, text: "submit" });
arrow({ from: { x: actions.cx, y: actions.y + actions.h }, to: { x: libs.cx, y: libs.y - 4 } });
arrow({ from: { x: actions.x + actions.w, y: 1245 }, to: { x: rpc.x - 4, y: 1245 }, text: "rpc()" });
arrow({ from: { x: libs.x + libs.w, y: 1340 }, to: { x: tables.x - 4, y: 1350 }, text: "select" });
arrow({ from: { x: cron.x + cron.w, y: 1430 }, to: { x: upload.x - 4, y: 1430 }, color: "#adb5bd", dashed: true });
arrow({ from: { x: upload.x + upload.w, y: 1430 }, to: { x: storage.x - 4, y: 1440 } });
arrow({ from: { x: guards.cx, y: guards.y }, to: { x: tables.cx - 100, y: tables.y + tables.h + 4 }, dashed: true, color: "#2b8a3e" });

const ai = box({
  x: 1130,
  y: 1520,
  w: 420,
  h: 90,
  label: "AI LAYER — PHASE 6 (designed, not implemented)\nmetrics computed in code · Claude explains and drafts\nstrict JSON + Zod · advisory only · logged to ai_outputs",
  tone: "ai",
  size: 12,
  dashed: true,
});
arrow({ from: { x: libs.cx, y: libs.y + libs.h }, to: { x: ai.x - 4, y: ai.cy }, dashed: true, color: "#9c36b5", bend: 40 });

label({
  x: 40,
  y: 1560,
  text:
    "THE ONE IDEA:  the rules live in one place, twice.\n\n" +
    "  /lib/workflow (TypeScript)  →  the interface is honest before you click:\n" +
    "                                  the Approve button is absent when you may not approve.\n\n" +
    "  0003_functions.sql (PL/pgSQL) →  the rule holds even if the interface is bypassed:\n" +
    "                                  the database refuses the write.\n\n" +
    "Verified both ways: browser tests assert the button is hidden,\n" +
    "17 database checks assert the function raises.",
  size: 14,
  color: "#1864ab",
});

// ===========================================================================
// Write the file
// ===========================================================================
const doc = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
  files: {},
};

const out = path.join(process.cwd(), "docs", "architecture.excalidraw");
fs.writeFileSync(out, JSON.stringify(doc, null, 2));
console.log("Wrote " + out + " (" + elements.length + " elements)");
console.log("Open it at excalidraw.com → File → Open, or with the VS Code Excalidraw extension.");
