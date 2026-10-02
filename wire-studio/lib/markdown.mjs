// Minimal Markdown → HTML for the bundled guides (headings, paragraphs, lists, tables, code,
// links, bold, inline code). Input is our own docs; everything is escaped before formatting.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (/^(https?:|\/|#|\.\.?\/)/.test(href) ? `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>` : label))
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function markdown(src) {
  const lines = String(src).replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  const cells = (row) => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
    } else if (/^#{1,4} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const html = inline(line.slice(level + 1));
      out.push(`<h${level} id="${slug(html)}">${html}</h${level}>`);
      i++;
    } else if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3}/.test(lines[i + 1] || "")) {
      const head = cells(line);
      i += 2;
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i]); i++) {
        let item = lines[i].replace(/^\s*([-*]|\d+\.) /, "");
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*]|\d+\.) /.test(lines[i + 1])) item += " " + lines[++i].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
    } else if (/^\s*<!--.*-->\s*$/.test(line)) {
      i++; // section markers for the generator
    } else if (/^---+\s*$/.test(line)) {
      out.push("<hr>");
      i++;
    } else if (!line.trim()) i++;
    else {
      const para = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,4} |```|\s*\||\s*([-*]|\d+\.) |---+\s*$)/.test(lines[i]); i++) para.push(lines[i].trim());
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
  }
  return out.join("\n");
}

export function guidePage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light">
<title>${esc(title)} · Wire Studio</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/app.css">
<style>
  body { overflow: auto; }
  .doc { max-width: 980px; margin: 0 auto; padding: 32px 20px 80px; line-height: 1.6; font-size: 14.5px; }
  .doc h1 { font-size: 26px; letter-spacing: -0.02em; margin: 0 0 6px; }
  .doc h2 { font-size: 19px; margin: 36px 0 10px; padding-top: 14px; border-top: 1px solid var(--line); }
  .doc h3 { font-size: 15.5px; margin: 24px 0 8px; }
  .doc p, .doc li { color: var(--text-2); }
  .doc b { color: var(--text); }
  .doc a { color: var(--accent); }
  .doc code { font-family: var(--mono); font-size: 12.5px; background: var(--raised); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; color: var(--text); }
  .doc pre { background: var(--panel); border: 1px solid var(--line-2); border-radius: 10px; padding: 14px 16px; overflow-x: auto; }
  .doc pre code { background: none; border: 0; padding: 0; font-size: 12.5px; line-height: 1.55; white-space: pre; }
  .doc .table { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; margin: 12px 0; }
  .doc table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .doc th, .doc td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .doc th { color: var(--text-3); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--panel-2); }
  .doc tr:last-child td { border-bottom: 0; }
  .doc td { color: var(--text-2); }
  .top { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .top a { color: var(--text-2); text-decoration: none; font-size: 13px; }
</style>
<script>try { document.documentElement.dataset.theme = localStorage.getItem("wire-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); } catch {}</script>
</head>
<body><main class="doc"><div class="top"><a href="/">← Back to Wire Studio</a><span style="flex:1"></span><input id="find" type="search" placeholder="Find a model or folder…" aria-label="Find a model or folder" style="width:min(320px,60vw)"><span id="hits" class="hint"></span></div>
${body}
</main>
<script>
// Find: show only matching table rows and tree lines (and their folders).
const find = document.getElementById("find"), hits = document.getElementById("hits");
const pres = [...document.querySelectorAll("pre code")].map((c) => ({ c, lines: c.textContent.split("\\n") }));
find.addEventListener("input", () => {
  const q = find.value.trim().toLowerCase();
  let n = 0;
  for (const tr of document.querySelectorAll(".doc tbody tr")) { const on = !q || tr.textContent.toLowerCase().includes(q); tr.hidden = !on; if (on && q) n++; }
  for (const { c, lines } of pres) {
    if (!q) { c.textContent = lines.join("\\n"); continue; }
    const keep = new Set();
    lines.forEach((l, i) => { if (l.toLowerCase().includes(q)) { n++; keep.add(i); const depth = l.search(/[^│├└─ ]/); for (let j = i - 1, d = depth; j >= 0 && d > 0; j--) { const dj = lines[j].search(/[^│├└─ ]/); if (dj < d) { keep.add(j); d = dj; } } } });
    c.textContent = keep.size ? lines.filter((_, i) => keep.has(i)).join("\\n") : "(no match)";
  }
  hits.textContent = q ? n + " match" + (n === 1 ? "" : "es") : "";
});
</script>
</body></html>`;
}
