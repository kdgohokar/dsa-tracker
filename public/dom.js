// ── DOM & rendering primitives ────────────────────────────────────────

// HTML-escape user-supplied strings before injecting into innerHTML.
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

// ── Auto-escaping template tag ────────────────────────────────────────
// `html` builds a TemplateResult (an opaque, already-escaped fragment).
// Every ${value} interpolation is HTML-escaped by default, so render code
// can't forget to escape user data. Three values bypass escaping safely:
//   • another html`` result (nested fragments compose without double-escaping)
//   • an array of the above (lists join automatically — no `.join("")`)
//   • raw(str) — an explicit, deliberate opt-out for trusted markup.
const RAW = Symbol("html");
export const raw = (s) => ({ [RAW]: String(s) });
const part = (v) => {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(part).join("");
  if (typeof v === "object" && RAW in v) return v[RAW];
  return esc(v);
};
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++)
    out += part(values[i]) + strings[i + 1];
  return { [RAW]: out };
}
// Unwrap a TemplateResult to its HTML string (escapes a bare value as a
// safety net if something other than an html`` result is passed).
export const toHTML = (tpl) =>
  tpl && typeof tpl === "object" && RAW in tpl ? tpl[RAW] : esc(tpl);
// Set an element's contents from an html`` result.
export const renderTo = (el, tpl) => {
  el.innerHTML = toHTML(tpl);
};

// Populate a <select> from a list of values, with an optional leading
// placeholder. A disabled placeholder forces a real choice (required field).
export function fillSelect(id, values, placeholder, placeholderDisabled) {
  const sel = document.getElementById(id);
  // prettier-ignore — kept on single lines so no whitespace leaks into labels
  const ph = placeholder
    ? html`<option value="" ${placeholderDisabled ? raw("disabled ") : ""}selected>${placeholder}</option>`
    : "";
  const opts = values.map((v) => html`<option value="${v}">${v}</option>`);
  renderTo(sel, html`${ph}${opts}`);
}
