// ── Charts ────────────────────────────────────────────────────────────
import { state } from "./state.js";
import { STAGE_DAYS, MAINT, calcRetention } from "./model.js";

// Load Chart.js once and reuse. Must be the ESM build (/+esm): the UMD
// bundle has no ES named exports, so importing it leaves Chart undefined.
let ChartLib = null;
async function getChart() {
  if (!ChartLib) {
    const { Chart, registerables } = await import(
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/+esm"
    );
    Chart.register(...registerables);
    ChartLib = Chart;
  }
  return ChartLib;
}

// Forgetting curve — static reference diagram (not tied to your data).
export async function drawCurve() {
  const canvas = document.getElementById("fc-canvas");
  if (!canvas) return;
  const Chart = await getChart();
  const days = Array.from({ length: 31 }, (_, i) => i);
  function forget(t, n) {
    const stabs = [1, 3, 7, 21];
    let r = 1;
    for (let i = 0; i < n; i++) {
      const s = stabs[i] || 21;
      if (t > s) r *= Math.exp((-0.693 * (t - s)) / s);
    }
    return Math.max(0, Math.min(1, r));
  }
  new Chart(canvas, {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: "No revision",
          data: days.map((d) => Math.round(Math.exp(-0.693 * d) * 100)),
          borderColor: "#E85D5D",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
          borderDash: [5, 3],
        },
        {
          label: "After R1 (day 1)",
          data: days.map((d) => Math.round(forget(d, 1) * 100)),
          borderColor: "#F5A623",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
        },
        {
          label: "After R4 (day 21)",
          data: days.map((d) => Math.round(forget(d, 4) * 100)),
          borderColor: "#2ECC8A",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#8B8FA8",
            font: { size: 11 },
            boxWidth: 14,
            padding: 16,
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (c) => " " + c.dataset.label + ": " + c.parsed.y + "%",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            maxTicksLimit: 8,
            callback: (v, i) => (i % 5 === 0 ? "Day " + i : ""),
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          title: {
            display: true,
            text: "Days since solving",
            color: "#555870",
            font: { size: 11 },
          },
        },
        y: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            callback: (v) => v + "%",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Retention",
            color: "#555870",
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// Your problems — retention forecast. One line per logged problem, using
// the same decay as calcRetention(), projected forward from today. Redrawn
// whenever the data changes, so it always reflects what you've logged.
let userChart = null;
export async function drawUserCurve() {
  const canvas = document.getElementById("uc-canvas");
  if (!canvas) return;
  const Chart = await getChart();
  if (userChart) {
    userChart.destroy();
    userChart = null;
  }
  if (state.entries.length === 0) return;
  const horizon = 30;
  const days = Array.from({ length: horizon + 1 }, (_, i) => i);
  const palette = [
    "#5B8DEF", "#2ECC8A", "#F5A623", "#E85D5D",
    "#A06BE0", "#22B8CF", "#E879B9", "#9BB13A",
  ];
  const datasets = [...state.entries]
    .sort((a, b) => calcRetention(b) - calcRetention(a))
    .map((e, i) => {
      const stability = STAGE_DAYS[Math.min(e.reviews, MAINT)];
      const daysSince = (Date.now() - e.lastReviewAt) / 86400000;
      const color = palette[i % palette.length];
      return {
        label: e.name.length > 18 ? e.name.slice(0, 17) + "…" : e.name,
        data: days.map((d) =>
          Math.round(
            Math.exp((-0.693 * (daysSince + d)) / stability) * 100,
          ),
        ),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 1.75,
        pointRadius: 0,
        fill: false,
        tension: 0.4,
      };
    });
  userChart = new Chart(canvas, {
    type: "line",
    data: { labels: days, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#8B8FA8",
            font: { size: 11 },
            boxWidth: 14,
            padding: 12,
          },
        },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            title: (items) =>
              items[0].label === "0"
                ? "Today"
                : "In " + items[0].label + " days",
            label: (c) => " " + c.dataset.label + ": " + c.parsed.y + "%",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            maxTicksLimit: 8,
            callback: (v, i) =>
              i === 0 ? "Today" : i % 5 === 0 ? "+" + i + "d" : "",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          title: {
            display: true,
            text: "Days from today",
            color: "#555870",
            font: { size: 11 },
          },
        },
        y: {
          ticks: {
            color: "#555870",
            font: { size: 10 },
            callback: (v) => v + "%",
          },
          grid: { color: "rgba(255,255,255,0.05)" },
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "Predicted retention",
            color: "#555870",
            font: { size: 11 },
          },
        },
      },
    },
  });
}
