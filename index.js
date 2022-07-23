import * as fs_extra from "fs-extra";
import * as fs from "fs";
import { unifiedLatexFromString } from "@unified-latex/unified-latex-util-parse";
import { execSync } from "child_process";
import { JSDOM } from "jsdom";
import { macros } from "./src/custom_macros.js";
import { unifiedLatexToHast } from "@unified-latex/unified-latex-to-hast";
import { unified } from "unified";
import rehypeStringify from "rehype-stringify/lib/index.js";
import katex from "katex";
import { format } from "prettier";

const MAKE_PDF = true;

/**
 * COMPILE PDF
 */

if (MAKE_PDF) {
  try {
    await fs_extra.copy("./book", "./tmp", {});

    execSync("cd ./tmp && pdflatex main.tex");

    fs.copyFileSync("./tmp/main.pdf", "./output/main.pdf");
  } catch (error) {
    console.log(error.output.toString());
    process.exit(0);
  }
}

/**
 * COMPILE HTML
 */

const _main_file = fs.readFileSync("./book/main.tex", { encoding: "utf-8" });

const latex_doc = _main_file
  // Remove preamble
  .replace("\\input{preamble.tex}", "")
  // Expand include macro
  .replaceAll(/\\include{(.*?)}/g, (match) => {
    const path = match.replace("\\include{", "./book/").replace("}", "");
    return fs.readFileSync(path, { encoding: "utf-8" });
  })
  // Expand input macro
  .replaceAll(/\\\\input{(.*?)}/g, (match) => {
    const path = match.replace("\\input{", "./book/").replace("}", "");
    return fs.readFileSync(path, { encoding: "utf-8" });
  });

const latex_html = unified()
  .use(unifiedLatexFromString, {
    macros: {
      label: { signature: "m" },
      HTMLclassTitle: { signature: "m" },
      newthought: { signature: "m" },
    },
  })
  .use(unifiedLatexToHast)
  .use(rehypeStringify)
  .processSync(latex_doc);

const jsdom = new JSDOM(latex_html.value);

// Render KaTeX expressions
jsdom.window.document
  .querySelectorAll(".display-math, .inline-math")
  .forEach(
    (node) =>
      (node.innerHTML = katex.renderToString(
        node.innerHTML.replace(/amp;|&&/g, "&"),
        node.classList.contains("inline-math")
          ? { macros: macros }
          : { macros: macros, displayMode: true, fleqn: true }
      ))
  );

// Add id to label to be referenced
jsdom.window.document
  .querySelectorAll(".macro-label")
  .forEach((node) => (node.id = node.innerHTML.slice(1, -1)));

// Convert ref in anchors tags
jsdom.window.document.querySelectorAll(".macro-ref").forEach((node) => {
  const refId = node.innerHTML.slice(1, -1);
  node.outerHTML = `<a href="#${refId}">ref</a>`;
});

// Remove braces from custom macros
jsdom.window.document
  .querySelectorAll(
    ["macro-label", ".macro-HTMLclassTitle", ".macro-newthought"].join(", ")
  )
  .forEach((node) => (node.innerHTML = node.innerHTML.slice(1, -1)));

const html = `
 <!DOCTYPE html>
 <html lang="es">
 <head>
     <meta charset="UTF-8">
     <meta http-equiv="X-UA-Compatible" content="IE=edge">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <link type="text/css" rel="stylesheet" href="output/css/base.css">
     <link type="text/css" rel="stylesheet" href="output/katex/katex.min.css">
     <title>Notas</title>
 </head>
 <body>
    <header>
      <div class="title">
        <h1>Matemáticas</h1>
        <h3>Notas para una licenciatura</h3>
      </div>
      <h2>José Julián Villalba Vásquez</h2>
    </header>
    <main>
        ${format(
          jsdom.window.document.documentElement.querySelector("body").innerHTML,
          { parser: "html" }
        )}
      </main>
    </body>
 </html>
 `;

fs.writeFileSync("./index.html", html);
