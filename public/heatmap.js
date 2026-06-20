// ── Heatmap (retention map) ───────────────────────────────────────────
import { state } from "./state.js";
import { html, raw, renderTo } from "./dom.js";
import {
  calcRetention,
  rColor,
  rTextColor,
  isDue,
  patternLabel,
  noteOf,
  revLabel,
  until,
} from "./model.js";
import { drawCurve, drawUserCurve } from "./charts.js";

const tooltip = document.getElementById("tooltip");

function fillTooltip(e, r) {
  document.getElementById("tt-name").textContent = e.name;
  document.getElementById("tt-pat").textContent =
    patternLabel(e) || "No pattern tagged";
  document.getElementById("tt-ret").textContent =
    `Retention: ${Math.round(r * 100)}% · ${revLabel(e.reviews)}`;
  document.getElementById("tt-nxt").textContent =
    `Next review: ${until(e.nextReview)}`;
  const ttNote = document.getElementById("tt-note");
  const note = noteOf(e);
  ttNote.textContent = note;
  ttNote.style.display = note ? "" : "none";
  tooltip.classList.add("show");
}
// Position the (fixed) tooltip near a point, clamped to the viewport
function placeTooltip(x, y) {
  const tw = tooltip.offsetWidth || 200;
  const th = tooltip.offsetHeight || 90;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - tw - 8));
  const top = Math.max(8, Math.min(y - 10, window.innerHeight - th - 8));
  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}
const hideTooltip = () => tooltip.classList.remove("show");
// Tap anywhere else dismisses the tooltip (mobile has no hover/leave)
document.addEventListener("click", hideTooltip);

export function renderHeatmap() {
  const grid = document.getElementById("heatmap-grid");
  if (state.entries.length === 0) {
    grid.innerHTML =
      '<div class="hm-empty">No problems logged yet.<br>Add problems in the "Log problem" tab.</div>';
    return;
  }
  grid.innerHTML = "";
  [...state.entries]
    .sort((a, b) => calcRetention(a) - calcRetention(b))
    .forEach((e) => {
      const r = calcRetention(e);
      const cell = document.createElement("div");
      cell.className = "hm-cell";
      cell.style.background = rColor(r);
      const label = e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name;
      renderTo(
        cell,
        html`${isDue(e) ? raw('<div class="hm-due-dot"></div>') : ""}
<div class="cell-label">${label}</div>
<div class="cell-pct" style="color:${rTextColor(r)}">${Math.round(r * 100)}%</div>`,
      );
      // Desktop: hover to show, follow the cursor, leave to hide
      cell.addEventListener("mouseenter", () => fillTooltip(e, r));
      cell.addEventListener("mousemove", (ev) =>
        placeTooltip(ev.clientX, ev.clientY),
      );
      cell.addEventListener("mouseleave", hideTooltip);
      // Touch/click: tap to show near the cell (no hover on mobile).
      // stopPropagation so the document handler doesn't instantly hide it.
      cell.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const rect = cell.getBoundingClientRect();
        fillTooltip(e, r);
        placeTooltip(rect.left + rect.width / 2, rect.bottom + 10);
      });
      grid.appendChild(cell);
    });
  if (!state.chartDrawn) {
    drawCurve();
    state.chartDrawn = true;
  }
  drawUserCurve();
}
