/**
 * Renders the diagrams in docs/diagrams/*.mmd to PNG.
 *
 *   npm run docs:diagrams
 *
 * Mermaid code fences only render on GitHub. PNGs render everywhere the
 * document might be read or submitted: VS Code preview, a PDF export, a Word
 * document, a slide. The Mermaid source stays beside each image so a diagram
 * is edited and regenerated rather than redrawn.
 *
 * Rendered at 2x so the text stays crisp when scaled or printed.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const dir = path.join(process.cwd(), "docs", "diagrams");
const sources = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".mmd"))
  .sort();

if (sources.length === 0) {
  console.error("No .mmd files in docs/diagrams.");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(
  "<html><body style='margin:0;background:#ffffff'><div id='host'></div></body></html>",
);
await page.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" });
await page.evaluate(() =>
  window.mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "15px",
      primaryColor: "#f1f5f9",
      primaryTextColor: "#0f172a",
      primaryBorderColor: "#475569",
      lineColor: "#475569",
      textColor: "#0f172a",
    },
    flowchart: { curve: "basis", padding: 18, useMaxWidth: false },
    sequence: { useMaxWidth: false, width: 190 },
    er: { useMaxWidth: false },
  }),
);

let failed = 0;
for (const file of sources) {
  const src = fs.readFileSync(path.join(dir, file), "utf8");
  const name = file.replace(/\.mmd$/, "");

  const result = await page.evaluate(async ({ src, name }) => {
    const host = document.getElementById("host");
    host.innerHTML = "";
    try {
      const { svg } = await window.mermaid.render("m_" + name.replace(/\W/g, "_"), src);
      host.innerHTML = "<div id='shot' style='display:inline-block;padding:24px'>" + svg + "</div>";
      const el = host.querySelector("svg");
      el.removeAttribute("width");
      el.removeAttribute("height");
      const vb = el.viewBox.baseVal;
      el.style.width = vb.width + "px";
      el.style.height = vb.height + "px";
      return { ok: true, w: Math.round(vb.width), h: Math.round(vb.height) };
    } catch (e) {
      return { ok: false, msg: String(e.message ?? e).split("\n")[0] };
    }
  }, { src, name });

  if (!result.ok) {
    console.log("  " + file + ": FAILED — " + result.msg);
    failed++;
    continue;
  }

  await page.locator("#shot").screenshot({ path: path.join(dir, name + ".png") });
  console.log("  " + name + ".png  (" + result.w + "x" + result.h + " at 2x)");
}

await browser.close();
console.log(failed === 0 ? "\nAll diagrams rendered." : "\n" + failed + " failed.");
process.exit(failed ? 1 : 0);
