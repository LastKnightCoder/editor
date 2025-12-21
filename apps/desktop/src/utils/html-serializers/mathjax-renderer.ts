import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

// let mathjaxInstance: {
//   adaptor: any;
//   document: any;
// } | null = null;

// async function getMathJax() {
//   if (mathjaxInstance) return mathjaxInstance;

//   const [
//     { mathjax },
//     { TeX },
//     { SVG },
//     { liteAdaptor },
//     { RegisterHTMLHandler },
//     { AllPackages },
//   ] = await Promise.all([
//     import("mathjax-full/js/mathjax.js"),
//     import("mathjax-full/js/input/tex.js"),
//     import("mathjax-full/js/output/svg.js"),
//     import("mathjax-full/js/adaptors/liteAdaptor.js"),
//     import("mathjax-full/js/handlers/html.js"),
//     import("mathjax-full/js/input/tex/AllPackages.js"),
//   ]);

//   const adaptor = liteAdaptor();
//   RegisterHTMLHandler(adaptor);
//   const tex = new TeX({ packages: AllPackages });
//   const svg = new SVG({ fontCache: "none" });
//   const document = mathjax.document("", { InputJax: tex, OutputJax: svg });

//   mathjaxInstance = { adaptor, document };
//   return mathjaxInstance;
// }

/**
 * Convert LaTeX to SVG HTML string
 * @param latex - LaTeX string to render
 * @param displayMode - true for block display, false for inline
 * @returns SVG HTML string
 */
export async function renderMathToSvg(
  latex: string,
  displayMode = true,
): Promise<string> {
  // return latex;
  try {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    const svg = new SVG({ fontCache: "none" });
    const document = mathjax.document("", { InputJax: tex, OutputJax: svg });
    const node = document.convert(latex, { display: displayMode });
    return adaptor.outerHTML(node);
  } catch (error) {
    console.error("MathJax rendering error:", error);
    const escapedLatex = latex
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return displayMode
      ? `<pre class="math-fallback">$$${escapedLatex}$$</pre>`
      : `<code class="math-fallback">$${escapedLatex}$</code>`;
  }
}

/**
 * Render block-level (display) math
 */
export async function renderBlockMath(latex: string): Promise<string> {
  return renderMathToSvg(latex, true);
}

/**
 * Render inline math
 */
export async function renderInlineMath(latex: string): Promise<string> {
  return renderMathToSvg(latex, false);
}
