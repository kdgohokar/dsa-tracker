// Smoke tests for the pure, framework-free modules. No deps, no DOM:
//   node test/smoke.test.mjs
// These cover the logic most worth locking down — the auto-escaping html``
// helper (XSS surface) and the model/SRS helpers — without a browser.
import assert from "node:assert/strict";
import { esc, html, raw, toHTML } from "../public/dom.js";
import {
  patternLabel,
  noteOf,
  nextStage,
  revLabel,
  until,
  MAINT,
} from "../public/model.js";

let passed = 0;
const it = (name, fn) => {
  fn();
  passed++;
  console.log("  ✓ " + name);
};

console.log("dom.js — escaping");
it("esc() escapes HTML metacharacters", () => {
  assert.equal(esc(`<b>"&'`), "&lt;b&gt;&quot;&amp;&#39;");
  assert.equal(esc(null), "");
});
it("html`` escapes interpolated user values by default", () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(
    toHTML(html`<div>${evil}</div>`),
    "<div>&lt;img src=x onerror=alert(1)&gt;</div>",
  );
});
it("html`` composes nested fragments without double-escaping", () => {
  const inner = html`<span>${"a&b"}</span>`;
  assert.equal(toHTML(html`<p>${inner}</p>`), "<p><span>a&amp;b</span></p>");
});
it("html`` joins arrays of fragments (no manual join)", () => {
  const items = ["x", "y"].map((v) => html`<li>${v}</li>`);
  assert.equal(toHTML(html`<ul>${items}</ul>`), "<ul><li>x</li><li>y</li></ul>");
});
it("html`` skips null/false, keeps numbers", () => {
  assert.equal(toHTML(html`${null}${false}${0}`), "0");
});
it("raw() is a deliberate escape bypass", () => {
  assert.equal(toHTML(html`${raw("<hr>")}`), "<hr>");
});

console.log("model.js — taxonomy & notes");
it("patternLabel() prefers category, shows DP sub-type, falls back to legacy", () => {
  assert.equal(patternLabel({ category: "Graph" }), "Graph");
  assert.equal(patternLabel({ category: "DP", subCategory: "2D" }), "DP · 2D");
  assert.equal(patternLabel({ pattern: "knapsack" }), "knapsack");
});
it("noteOf() recovers legacy pattern text once categorized", () => {
  assert.equal(noteOf({ note: "mine" }), "mine");
  assert.equal(noteOf({ category: "DP", pattern: "old text" }), "old text");
  assert.equal(noteOf({ pattern: "old text" }), ""); // uncategorized: shown as label, not note
  assert.equal(noteOf({ category: "Graph" }), "");
});

console.log("model.js — SRS");
it("nextStage() promotes on easy, demotes on hard", () => {
  assert.equal(nextStage(0, "easy"), 1);
  assert.equal(nextStage(MAINT, "easy"), MAINT);
  assert.equal(nextStage(1, "hard"), 0);
  assert.equal(nextStage(2, "hard"), 1);
});
it("revLabel() maps stages to labels", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(revLabel), [
    "R1",
    "R2",
    "R3",
    "R4",
    "Maint.",
    "Maint.",
  ]);
});
it("until() renders relative day phrasing", () => {
  const day = 86400000;
  assert.equal(until(Date.now() + day * 2), "In 2 days");
  assert.equal(until(Date.now() - day * 3), "3 days overdue");
});

console.log(`\n${passed} tests passed.`);
