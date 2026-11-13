import { agentById, departmentById, STATUS_META } from "@/lib/catalog";
import { TILE } from "@/lib/floorplan";
import { useHub } from "@/lib/store";
import type { AgentId } from "@/lib/types";

/**
 * Paints every screen in the office into one 2048×1024 atlas (4×4 tiles of 512×256).
 * Department tiles show a dashboard for that department plus its agent's live status line.
 */
export const ATLAS_W = 2048;
export const ATLAS_H = 1024;
export const TILE_W = 512;
export const TILE_H = 256;
export const COLS = 4;

export const tileRect = (i: number) => ({ x: (i % COLS) * TILE_W, y: Math.floor(i / COLS) * TILE_H });

const NAVY = "#101827";
const PANEL = "#16213a";
const GRID = "rgba(240,242,244,0.08)";
const TEXT = "#e9ecf1";
const MUTED = "#8d99ad";
const GOLD = "#c4a66a";
const BLUE = "#6d9bff";
const SLATE = "#52647d";
const GREEN = "#3fb27f";
const RED = "#e5484d";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

type Ctx = CanvasRenderingContext2D;

const noise = (i: number, t: number, k = 1) =>
  0.5 + 0.5 * Math.sin(i * 1.7 + t * 0.35 * k) * Math.cos(i * 0.9 + t * 0.21 * k);

function frame(c: Ctx, x: number, y: number, title: string, subtitle?: string) {
  const g = c.createLinearGradient(x, y, x, y + TILE_H);
  g.addColorStop(0, "#0e1729");
  g.addColorStop(1, NAVY);
  c.fillStyle = g;
  c.fillRect(x, y, TILE_W, TILE_H);
  // inner padding border hides atlas bleed at low mip levels
  c.strokeStyle = "#060a12";
  c.lineWidth = 6;
  c.strokeRect(x + 3, y + 3, TILE_W - 6, TILE_H - 6);
  c.fillStyle = GOLD;
  c.font = `600 9px ${SANS}`;
  c.fillText("HN.CO", x + 14, y + 20);
  c.fillStyle = TEXT;
  c.font = `600 13px ${SANS}`;
  c.fillText(title, x + 52, y + 21);
  if (subtitle) {
    c.fillStyle = MUTED;
    c.font = `10px ${SANS}`;
    c.textAlign = "right";
    c.fillText(subtitle, x + TILE_W - 14, y + 20);
    c.textAlign = "left";
  }
  c.fillStyle = "rgba(196,166,106,0.35)";
  c.fillRect(x + 14, y + 28, TILE_W - 28, 1);
}

function panel(c: Ctx, x: number, y: number, w: number, h: number, label?: string) {
  c.fillStyle = PANEL;
  roundRect(c, x, y, w, h, 5);
  c.fill();
  if (label) {
    c.fillStyle = MUTED;
    c.font = `9px ${SANS}`;
    c.fillText(label.toUpperCase(), x + 7, y + 12);
  }
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function kpi(c: Ctx, x: number, y: number, w: number, label: string, value: string, delta?: string, good = true) {
  panel(c, x, y, w, 46, label);
  c.fillStyle = TEXT;
  c.font = `600 17px ${SANS}`;
  c.fillText(value, x + 7, y + 34);
  if (delta) {
    c.fillStyle = good ? GREEN : RED;
    c.font = `10px ${SANS}`;
    c.textAlign = "right";
    c.fillText(delta, x + w - 7, y + 34);
    c.textAlign = "left";
  }
}

function line(c: Ctx, x: number, y: number, w: number, h: number, t: number, seed: number, color: string, label?: string, second?: string) {
  panel(c, x, y, w, h, label);
  const px = x + 8;
  const py = y + 18;
  const pw = w - 16;
  const ph = h - 26;
  c.strokeStyle = GRID;
  c.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    c.beginPath();
    c.moveTo(px, py + (ph * i) / 3);
    c.lineTo(px + pw, py + (ph * i) / 3);
    c.stroke();
  }
  const series = (col: string, k: number, fill: boolean) => {
    const n = 18;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const v = 0.25 + 0.5 * (i / n) * 0.8 + 0.3 * noise(i + seed * k, t, k) - 0.1;
      const xx = px + (pw * i) / (n - 1);
      const yy = py + ph - Math.min(1, Math.max(0, v)) * ph;
      if (i === 0) c.moveTo(xx, yy);
      else c.lineTo(xx, yy);
    }
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.stroke();
    if (fill) {
      c.lineTo(px + pw, py + ph);
      c.lineTo(px, py + ph);
      c.closePath();
      const g = c.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, col + "55");
      g.addColorStop(1, col + "00");
      c.fillStyle = g;
      c.fill();
    }
  };
  series(color, 1, true);
  if (second) series(second, 1.7, false);
}

function bars(c: Ctx, x: number, y: number, w: number, h: number, t: number, seed: number, n: number, label?: string, color = GOLD, labels?: string[]) {
  panel(c, x, y, w, h, label);
  const px = x + 8;
  const py = y + 18;
  const pw = w - 16;
  const ph = h - (labels ? 36 : 26);
  const bw = (pw / n) * 0.62;
  for (let i = 0; i < n; i++) {
    const v = 0.3 + 0.65 * noise(i + seed, t);
    const bx = px + (pw / n) * i + (pw / n - bw) / 2;
    c.fillStyle = i === n - 1 ? color : SLATE;
    c.fillRect(bx, py + ph - v * ph, bw, v * ph);
    if (labels) {
      c.fillStyle = MUTED;
      c.font = `8px ${SANS}`;
      c.fillText(labels[i] ?? "", bx - 2, py + ph + 11);
    }
  }
}

function donut(c: Ctx, x: number, y: number, r: number, parts: number[], colors: string[], centre?: string) {
  const total = parts.reduce((a, b) => a + b, 0);
  let a0 = -Math.PI / 2;
  parts.forEach((p, i) => {
    const a1 = a0 + (p / total) * Math.PI * 2;
    c.beginPath();
    c.arc(x, y, r, a0, a1);
    c.strokeStyle = colors[i % colors.length];
    c.lineWidth = r * 0.38;
    c.stroke();
    a0 = a1;
  });
  if (centre) {
    c.fillStyle = TEXT;
    c.font = `600 13px ${SANS}`;
    c.textAlign = "center";
    c.fillText(centre, x, y + 5);
    c.textAlign = "left";
  }
}

function rows(c: Ctx, x: number, y: number, w: number, items: [string, string, string][]) {
  items.forEach(([a, b, col], i) => {
    const yy = y + i * 17;
    c.fillStyle = i % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)";
    c.fillRect(x, yy, w, 15);
    c.fillStyle = TEXT;
    c.font = `10px ${SANS}`;
    c.fillText(a, x + 6, yy + 11);
    c.fillStyle = col;
    c.textAlign = "right";
    c.fillText(b, x + w - 6, yy + 11);
    c.textAlign = "left";
  });
}

function statusLine(c: Ctx, x: number, y: number, id: AgentId) {
  const st = useHub.getState().agents[id];
  if (!st) return;
  const meta = STATUS_META[st.status];
  const yy = y + TILE_H - 26;
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(x + 8, yy, TILE_W - 16, 18);
  c.fillStyle = meta.color;
  c.beginPath();
  c.arc(x + 18, yy + 9, 4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = TEXT;
  c.font = `600 10px ${SANS}`;
  const name = agentById[id].name;
  c.fillText(`${name} · ${meta.label}`, x + 28, yy + 12.5);
  const w = c.measureText(`${name} · ${meta.label}`).width;
  c.fillStyle = MUTED;
  c.font = `10px ${SANS}`;
  let label = st.taskLabel;
  const room = TILE_W - 60 - w - (st.progress != null ? 70 : 0);
  while (c.measureText(label).width > room && label.length > 4) label = label.slice(0, -2);
  if (label !== st.taskLabel) label += "…";
  c.fillText(`— ${label}`, x + 34 + w, yy + 12.5);
  if (st.progress != null) {
    const bx = x + TILE_W - 80;
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(bx, yy + 6, 60, 6);
    c.fillStyle = meta.color;
    c.fillRect(bx, yy + 6, (60 * Math.min(100, st.progress)) / 100, 6);
  }
}

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function paintDepartment(c: Ctx, i: number, id: AgentId, t: number) {
  const { x, y } = tileRect(i);
  const d = departmentById[id];
  frame(c, x, y, d.name, "Simulated data");
  const X = x + 14;
  const Y = y + 38;
  const W = TILE_W - 28;
  switch (id) {
    case "executive": {
      kpi(c, X, Y, 110, "Revenue YTD", "£3.82m", "+6.4%");
      kpi(c, X + 118, Y, 110, "Gross margin", "42.1%", "+1.2pt");
      kpi(c, X + 236, Y, 110, "Utilisation", `${(78 + 6 * noise(1, t)).toFixed(0)}%`, "+3pt");
      kpi(c, X + 354, Y, 130, "Client NPS", "+62", "+4");
      line(c, X, Y + 54, 300, 112, t, 1, GOLD, "Revenue vs target", BLUE);
      bars(c, X + 308, Y + 54, 176, 112, t, 3, 6, "By practice");
      break;
    }
    case "strategy": {
      panel(c, X, Y, 230, 128, "Market attractiveness × position");
      c.strokeStyle = GRID;
      c.beginPath();
      c.moveTo(X + 115, Y + 18);
      c.lineTo(X + 115, Y + 124);
      c.moveTo(X + 8, Y + 71);
      c.lineTo(X + 222, Y + 71);
      c.stroke();
      for (let k = 0; k < 7; k++) {
        const bx = X + 20 + 190 * noise(k, t * 0.3);
        const by = Y + 26 + 90 * noise(k + 9, t * 0.3);
        c.fillStyle = k === 2 ? GOLD + "cc" : BLUE + "88";
        c.beginPath();
        c.arc(bx, by, 5 + 8 * noise(k + 3, 0), 0, Math.PI * 2);
        c.fill();
      }
      bars(c, X + 238, Y, 246, 128, t, 5, 7, "Market share by segment", GOLD);
      rows(c, X, Y + 136, W, [
        ["Recommendation: partnership-led entry", "Draft", GOLD],
        ["Competitor scan — 14 firms profiled", "Complete", GREEN],
      ]);
      break;
    }
    case "bizdev": {
      panel(c, X, Y, 270, 150, "Client pipeline");
      const stages = ["Lead", "Qualified", "Proposal", "Negotiation", "Won"];
      stages.forEach((s, k) => {
        const w = 240 - k * 38 + 6 * Math.sin(t * 0.4 + k);
        const yy = Y + 20 + k * 25;
        c.fillStyle = k === 4 ? GOLD : [SLATE, "#5d7392", "#6c84a6", "#8197b8"][k];
        c.fillRect(X + 8 + (240 - w) / 2, yy, w, 19);
        c.fillStyle = TEXT;
        c.font = `10px ${SANS}`;
        c.fillText(`${s}  ${Math.round(42 / (k + 1))}`, X + 14, yy + 13);
      });
      kpi(c, X + 278, Y, 206, "Weighted pipeline", "£2.41m", "+8.2%");
      kpi(c, X + 278, Y + 52, 100, "Win rate", "38%", "+3pt");
      kpi(c, X + 384, Y + 52, 100, "Proposals", "6");
      rows(c, X + 278, Y + 108, 206, [
        ["Public sector tender", "72%", GOLD],
        ["Logistics BI rollout", "55%", TEXT],
      ]);
      break;
    }
    case "marketing": {
      line(c, X, Y, 300, 120, t, 7, GOLD, "Engagement — LinkedIn vs web", BLUE);
      panel(c, X + 308, Y, 176, 120, "Channel mix");
      donut(c, X + 396, Y + 70, 34, [44, 26, 18, 12], [GOLD, BLUE, SLATE, "#9fb0c8"], "5.8%");
      kpi(c, X, Y + 128, 155, "Followers", "18.4k", "+2.1%");
      kpi(c, X + 163, Y + 128, 155, "MQLs (month)", "84", "+12");
      kpi(c, X + 326, Y + 128, 158, "Posts queued", "4", "approval");
      break;
    }
    case "project": {
      panel(c, X, Y, W, 128, "Programme Gantt — ERP data migration");
      const tasks = ["Discovery", "Data mapping", "Migration build", "UAT", "Go-live"];
      tasks.forEach((n, k) => {
        const yy = Y + 22 + k * 20;
        c.fillStyle = MUTED;
        c.font = `10px ${SANS}`;
        c.fillText(n, X + 8, yy + 10);
        const s0 = 100 + k * 62;
        const len = 90 + (k % 2) * 40;
        c.fillStyle = "rgba(255,255,255,0.07)";
        c.fillRect(X + s0, yy + 2, len, 11);
        const done = Math.min(1, Math.max(0, 1.5 - k * 0.38 + 0.05 * Math.sin(t * 0.3)));
        c.fillStyle = k === 3 ? GOLD : BLUE;
        c.fillRect(X + s0, yy + 2, len * done, 11);
      });
      c.strokeStyle = RED;
      c.beginPath();
      c.moveTo(X + 300, Y + 18);
      c.lineTo(X + 300, Y + 124);
      c.stroke();
      const cols = ["Backlog", "In progress", "Review", "Done"];
      cols.forEach((n, k) => kpi(c, X + k * 122, Y + 136, 114, n, String([7, 4, 2, 15][k] + (k === 1 ? Math.round(noise(4, t)) : 0))));
      break;
    }
    case "bi": {
      ["Revenue", "Active clients", "Churn", "Avg. order"].forEach((n, k) =>
        kpi(c, X + k * 122, Y, 114, n, ["£1.24m", "312", "3.1%", "£4.0k"][k], ["+4%", "+9", "-0.4pt", "+2%"][k]),
      );
      bars(c, X, Y + 54, 230, 112, t, 11, 12, "Monthly trend", GOLD, MONTHS);
      line(c, X + 238, Y + 54, 150, 112, t, 13, BLUE, "Forecast");
      panel(c, X + 396, Y + 54, 88, 112, "Segments");
      donut(c, X + 440, Y + 116, 26, [40, 30, 20, 10], [GOLD, BLUE, SLATE, "#9fb0c8"]);
      break;
    }
    case "dataeng": {
      panel(c, X, Y, W, 92, "ETL pipeline — lakehouse");
      const nodes = ["CRM", "ERP", "Bronze", "Silver", "Gold", "Model"];
      nodes.forEach((n, k) => {
        const nx = X + 12 + k * 79;
        const ny = Y + 34 + (k < 2 ? (k === 0 ? -8 : 22) : 8);
        c.fillStyle = k >= 2 ? "#1f2d4a" : "#24314a";
        roundRect(c, nx, ny, 64, 26, 4);
        c.fill();
        c.strokeStyle = k === 4 ? GOLD : SLATE;
        c.stroke();
        c.fillStyle = TEXT;
        c.font = `10px ${SANS}`;
        c.fillText(n, nx + 8, ny + 17);
        const flow = (t * 0.6 + k * 0.2) % 1;
        if (k > 0 && k < nodes.length) {
          c.fillStyle = GOLD;
          c.beginPath();
          c.arc(nx - 15 + 14 * flow, Y + 55, 2.5, 0, Math.PI * 2);
          c.fill();
        }
      });
      const err = useHub.getState().agents.dataeng?.status === "error";
      rows(c, X, Y + 100, W, [
        ["crm_daily  · incremental", err ? "FAILED" : "Succeeded 02:14", err ? RED : GREEN],
        ["erp_gl  · nightly", "Succeeded 01:40", GREEN],
        ["silver_conform  · after load", "Running", BLUE],
        ["dq_checks  · 412 rules", "98.6% pass", GOLD],
      ]);
      break;
    }
    case "technology": {
      panel(c, X, Y, 270, 100, "Workflow — invoice automation");
      const steps = ["Trigger", "Extract", "Validate", "Approve", "Post"];
      steps.forEach((n, k) => {
        const nx = X + 10 + k * 52;
        c.fillStyle = k === 3 ? GOLD + "33" : "#22304a";
        roundRect(c, nx, Y + 40, 44, 26, 4);
        c.fill();
        c.fillStyle = k === 3 ? GOLD : TEXT;
        c.font = `9px ${SANS}`;
        c.fillText(n, nx + 4, Y + 57);
      });
      line(c, X + 278, Y, 206, 100, t, 17, GREEN, "CPU / latency", BLUE);
      panel(c, X, Y + 108, W, 70, "Deploy log");
      ["$ az deployment group create --template infra/main.bicep", "✓ api  revision 41 healthy · p95 182 ms", "✓ automation  invoice_intake  1,240 runs / 30 days"].forEach((l, k) => {
        c.fillStyle = k === 0 ? MUTED : TEXT;
        c.font = `10px ui-monospace, Menlo, monospace`;
        c.fillText(l, X + 8, Y + 134 + k * 14);
      });
      break;
    }
    case "finance": {
      panel(c, X, Y, 300, 128, "Cash-flow waterfall");
      let base = 60;
      const vals = [60, 22, -14, 18, -9, 26];
      const labels = ["Open", "Fees", "Payroll", "Retainers", "Opex", "Close"];
      vals.forEach((v, k) => {
        const bx = X + 14 + k * 46;
        const h = Math.abs(v) * 1.1;
        const top = k === 0 || k === 5 ? Y + 118 - (k === 5 ? 103 * 1.1 : v * 1.1) : v > 0 ? Y + 118 - (base + v) * 1.1 : Y + 118 - base * 1.1;
        c.fillStyle = k === 0 || k === 5 ? GOLD : v > 0 ? GREEN : RED;
        c.fillRect(bx, top, 30, k === 5 ? 103 * 1.1 : h);
        if (k > 0 && k < 5) base += v;
        c.fillStyle = MUTED;
        c.font = `8px ${SANS}`;
        c.fillText(labels[k], bx, Y + 126);
      });
      bars(c, X + 308, Y, 176, 128, t, 21, 6, "Revenue by month", GOLD);
      kpi(c, X, Y + 136, 155, "Budget variance", "-1.8%", "on track");
      kpi(c, X + 163, Y + 136, 155, "Debtor days", "44", "-3");
      kpi(c, X + 326, Y + 136, 158, "Forecast accuracy", "96.4%");
      break;
    }
    case "hr": {
      panel(c, X, Y, 300, 128, "Onboarding progress");
      ["New consultant — Analytics", "New consultant — Data Eng", "Office coordinator"].forEach((n, k) => {
        const yy = Y + 26 + k * 32;
        c.fillStyle = TEXT;
        c.font = `10px ${SANS}`;
        c.fillText(n, X + 10, yy);
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.fillRect(X + 10, yy + 6, 270, 8);
        c.fillStyle = k === 0 ? GREEN : GOLD;
        c.fillRect(X + 10, yy + 6, 270 * [1, 0.62, 0.3][k], 8);
      });
      panel(c, X + 308, Y, 176, 128, "Headcount by practice");
      donut(c, X + 396, Y + 74, 34, [9, 7, 6, 5, 4], [GOLD, BLUE, SLATE, "#9fb0c8", "#6c84a6"], "31");
      kpi(c, X, Y + 136, 236, "Training hours / FTE", "34", "+6");
      kpi(c, X + 244, Y + 136, 240, "Records up to date", "100%");
      break;
    }
    case "legal": {
      panel(c, X, Y, 200, 150, "Risk heatmap");
      for (let r = 0; r < 5; r++)
        for (let k = 0; k < 5; k++) {
          const sev = (r + k) / 8;
          c.fillStyle = sev > 0.7 ? RED + "aa" : sev > 0.45 ? GOLD + "99" : GREEN + "66";
          c.fillRect(X + 12 + k * 36, Y + 20 + (4 - r) * 25, 33, 22);
        }
      c.fillStyle = TEXT;
      c.beginPath();
      c.arc(X + 12 + 3 * 36 + 16, Y + 20 + 1 * 25 + 11, 4, 0, Math.PI * 2);
      c.fill();
      panel(c, X + 208, Y, 276, 150, "Contract review queue");
      rows(c, X + 214, Y + 20, 264, [
        ["MSA — limitation of liability", "High", RED],
        ["Supplier NDA v3", "Reviewed", GREEN],
        ["DPA — healthcare client", "In review", GOLD],
        ["SOW — logistics automation", "Queued", TEXT],
        ["Licence renewal — BI platform", "Low", GREEN],
        ["GDPR register update", "Due Fri", GOLD],
      ]);
      break;
    }
    case "clientsuccess": {
      panel(c, X, Y, 170, 128, "CSAT");
      c.beginPath();
      c.arc(X + 85, Y + 98, 52, Math.PI, Math.PI * 2);
      c.strokeStyle = "rgba(255,255,255,0.1)";
      c.lineWidth = 12;
      c.stroke();
      const v = 0.86 + 0.05 * noise(3, t);
      c.beginPath();
      c.arc(X + 85, Y + 98, 52, Math.PI, Math.PI * (1 + v));
      c.strokeStyle = GOLD;
      c.stroke();
      c.fillStyle = TEXT;
      c.font = `600 18px ${SANS}`;
      c.textAlign = "center";
      c.fillText((4.3 + v * 0.6).toFixed(1), X + 85, Y + 96);
      c.textAlign = "left";
      line(c, X + 178, Y, 306, 128, t, 31, GREEN, "Sentiment (30 days)");
      kpi(c, X, Y + 136, 155, "NPS", "+62", "+4");
      kpi(c, X + 163, Y + 136, 155, "Open tickets", String(10 + Math.round(4 * noise(5, t))));
      kpi(c, X + 326, Y + 136, 158, "Renewals at risk", "1", "watch", false);
      break;
    }
  }
  statusLine(c, x, y, id);
}

function paintBoardroom(c: Ctx, t: number) {
  const { x, y } = tileRect(TILE.boardroom);
  c.fillStyle = "#f4f2ee";
  c.fillRect(x, y, TILE_W, TILE_H);
  c.strokeStyle = "#060a12";
  c.lineWidth = 6;
  c.strokeRect(x + 3, y + 3, TILE_W - 6, TILE_H - 6);
  const presenter = Object.values(useHub.getState().agents).find((a) => a.activity.kind === "present");
  const topic = presenter ? presenter.taskLabel.replace(/^Presenting: /, "") : "HN.CO — Weekly Leadership Review";
  c.fillStyle = NAVY;
  c.font = `600 22px ${SERIF}`;
  c.fillText(topic, x + 24, y + 46);
  c.fillStyle = GOLD;
  c.fillRect(x + 24, y + 56, 60, 2);
  c.fillStyle = "#3a4558";
  c.font = `12px ${SANS}`;
  ["Delivery on track across 9 of 11 engagements", "Pipeline up 8% — two proposals awaiting approval", "Lakehouse foundation: wave 2 starts Monday"].forEach((l, k) =>
    c.fillText(`•  ${l}`, x + 24, y + 86 + k * 22),
  );
  for (let k = 0; k < 6; k++) {
    const h = 30 + 70 * noise(k + 40, t * 0.3);
    c.fillStyle = k === 5 ? GOLD : SLATE;
    c.fillRect(x + 330 + k * 26, y + 210 - h, 18, h);
  }
  c.fillStyle = "#8a94a6";
  c.font = `10px ${SANS}`;
  c.fillText(presenter ? `Presented by ${agentById[presenter.id].name} · simulated content` : "HN.CO Intelligence Hub", x + 24, y + TILE_H - 18);
}

function paintReception(c: Ctx) {
  const { x, y } = tileRect(TILE.reception);
  const g = c.createLinearGradient(x, y, x + TILE_W, y + TILE_H);
  g.addColorStop(0, "#0d1526");
  g.addColorStop(1, "#18243c");
  c.fillStyle = g;
  c.fillRect(x, y, TILE_W, TILE_H);
  c.textAlign = "center";
  c.fillStyle = MUTED;
  c.font = `11px ${SANS}`;
  c.fillText("WELCOME TO", x + TILE_W / 2, y + 70);
  c.fillStyle = GOLD;
  c.font = `500 44px ${SERIF}`;
  c.fillText("HN.CO", x + TILE_W / 2, y + 120);
  c.fillStyle = TEXT;
  c.font = `italic 15px ${SERIF}`;
  c.fillText("Intelligence Behind Every Transformation.", x + TILE_W / 2, y + 152);
  const now = new Date();
  c.fillStyle = MUTED;
  c.font = `11px ${SANS}`;
  c.fillText(
    `${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · ${now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
    x + TILE_W / 2,
    y + 200,
  );
  c.textAlign = "left";
}

function paintCafe(c: Ctx) {
  const { x, y } = tileRect(TILE.cafe);
  c.fillStyle = "#1a1612";
  c.fillRect(x, y, TILE_W, TILE_H);
  c.fillStyle = GOLD;
  c.font = `500 24px ${SERIF}`;
  c.fillText("HN.CO Café", x + 24, y + 42);
  c.fillStyle = "#e8dfcf";
  c.font = `13px ${SANS}`;
  [
    ["Flat white", "Espresso"],
    ["Cortado", "Matcha latte"],
    ["Cold brew", "Fresh mint tea"],
  ].forEach(([a, b], k) => {
    c.fillText(a, x + 24, y + 86 + k * 30);
    c.fillText(b, x + 270, y + 86 + k * 30);
  });
}

export function paintAtlas(c: Ctx, t: number) {
  const ids: AgentId[] = ["executive", "strategy", "bizdev", "marketing", "project", "bi", "dataeng", "technology", "finance", "hr", "legal", "clientsuccess"];
  ids.forEach((id) => paintDepartment(c, TILE[id], id, t));
  // The Managing Director's media wall reuses the executive layout with a wider view.
  paintDepartment(c, TILE.execMediaWall, "executive", t + 7);
  paintBoardroom(c, t);
  paintReception(c);
  paintCafe(c);
}

/** Department signage atlas: 1024×1024, 2×8 tiles of 512×128. */
export const SIGN_TILE_W = 512;
export const SIGN_TILE_H = 128;
export const SIGN_LABELS: Record<string, string> = {
  strategy: "Strategy & Advisory",
  bizdev: "Business Development",
  marketing: "Marketing",
  project: "Project Management",
  bi: "BI & Analytics",
  dataeng: "Data Engineering",
  technology: "Technology & Automation",
  finance: "Finance",
  cafe: "HN.CO Café",
  hr: "HR & Administration",
  legal: "Legal & Compliance",
  clientsuccess: "Client Success",
  executive: "Executive Office",
  boardroom: "Glass Boardroom",
};
export const SIGN_ORDER = Object.keys(SIGN_LABELS);

export function paintSigns(c: Ctx) {
  SIGN_ORDER.forEach((key, i) => {
    const x = (i % 2) * SIGN_TILE_W;
    const y = Math.floor(i / 2) * SIGN_TILE_H;
    c.fillStyle = NAVY;
    c.fillRect(x, y, SIGN_TILE_W, SIGN_TILE_H);
    c.fillStyle = GOLD;
    c.fillRect(x + 40, y + 92, 48, 2);
    c.font = `500 15px ${SANS}`;
    c.fillStyle = GOLD;
    c.fillText("HN.CO", x + 40, y + 40);
    c.fillStyle = "#f0f2f4";
    c.font = `500 30px ${SERIF}`;
    c.fillText(SIGN_LABELS[key], x + 40, y + 78);
  });
}
