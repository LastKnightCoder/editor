import juice from "juice";
import { load } from "cheerio";
import { getWechatStyles } from "./wechat-styles";

/**
 * Resolve CSS variables in CSS string
 * Extracts variable definitions and replaces var() references with actual values
 * Only keeps utility classes, discards @layer blocks
 */
export function resolveCssVariables(css: string): string {
  // Extract all CSS variable definitions
  const variables = new Map<string, string>();

  // Match :root or :host blocks and extract variables
  const rootBlockRegex = /(:root|:host)\s*\{([^}]+)\}/g;
  let match;

  while ((match = rootBlockRegex.exec(css)) !== null) {
    const block = match[2];
    const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    let varMatch;

    while ((varMatch = varRegex.exec(block)) !== null) {
      const varName = `--${varMatch[1]}`;
      const varValue = varMatch[2].trim();
      variables.set(varName, varValue);
    }
  }

  // Resolve nested variables
  for (const [name, value] of variables.entries()) {
    if (value.includes("var(")) {
      const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, varName) => {
        return variables.get(varName) || `var(${varName})`;
      });
      variables.set(name, resolved);
    }
  }

  // Extract utility classes and replace var() with actual values
  const utilityRegex = /\.[\w-]+\s*\{[^}]+\}/g;
  const utilities: string[] = [];
  let utilMatch;

  while ((utilMatch = utilityRegex.exec(css)) !== null) {
    let rule = utilMatch[0];
    // Replace var() references
    for (const [name, value] of variables.entries()) {
      const varRegex = new RegExp(
        `var\\(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
        "g",
      );
      rule = rule.replace(varRegex, value);
    }
    utilities.push(rule);
  }

  return utilities.join("\n");
}

export interface WechatProcessorOptions {
  /** Whether to inline CSS styles into HTML elements */
  inlineStyles?: boolean;
  /** Whether to remove empty paragraphs */
  removeEmptyParagraphs?: boolean;
  /** Whether to convert div to section (WeChat compatibility) */
  convertDivToSection?: boolean;
  /** Whether to handle SVG use elements */
  handleSvgUse?: boolean;
  /** Whether to handle MathJax SVG elements */
  handleMathJax?: boolean;
  /** Whether to convert external links to footnotes (WeChat doesn't support clickable external links) */
  convertLinksToFootnotes?: boolean;
}

const defaultOptions: WechatProcessorOptions = {
  inlineStyles: true,
  removeEmptyParagraphs: true,
  convertDivToSection: true,
  handleSvgUse: true,
  handleMathJax: true,
  convertLinksToFootnotes: true,
};

interface FootnoteLink {
  text: string;
  href: string;
}

/**
 * Generate footnotes section HTML
 * Format: [n] link text: URL
 */
function generateFootnotesSection(footnotes: FootnoteLink[]): string {
  if (footnotes.length === 0) {
    return "";
  }

  const footnotesItems = footnotes
    .map((footnote, index) => {
      const num = index + 1;
      // If text equals href, just show the URL
      const content =
        footnote.text === footnote.href
          ? `<em class="footnote-url">${footnote.href}</em>`
          : `${footnote.text}: <em class="footnote-url">${footnote.href}</em>`;

      return `<span id="fn${num}" class="footnote-item" style="font-size: 14px; font-family: Optima, 'Microsoft YaHei', PingFangSC-regular, serif;">
        <span class="footnote-num" style="font-size: 14px; font-family: Optima, 'Microsoft YaHei', PingFangSC-regular, serif;">[${num}] </span>
        <span class="footnote-content" style="font-size: 14px; font-family: Optima, 'Microsoft YaHei', PingFangSC-regular, serif;">${content}</span>
      </span>`;
    })
    .join("");

  return `<section class="footnotes-sep"><span>参考资料</span></section>
    <section class="footnotes-section">${footnotesItems}</section>`;
}

/**
 * Process HTML for WeChat Official Account compatibility
 * Based on the implementation from mdx-notes project
 */
export function processHtmlForWechat(
  html: string,
  css?: string,
  options: WechatProcessorOptions = {},
): string {
  const opts = { ...defaultOptions, ...options };
  const styles = css || getWechatStyles();

  let processedHtml = html;

  // 1. Inline CSS styles using juice
  if (opts.inlineStyles) {
    processedHtml = juice.inlineContent(processedHtml, styles, {
      inlinePseudoElements: true,
      preserveImportant: true,
    });
  }

  // 2. Parse HTML with cheerio for DOM manipulation
  const $ = load(processedHtml, null, false);

  // 3. Remove empty paragraphs
  if (opts.removeEmptyParagraphs) {
    $("p").each((_, element) => {
      const $el = $(element);
      const htmlContent = $el.html()?.trim();
      if (!htmlContent || htmlContent === "<br>" || htmlContent === "<br/>") {
        $el.remove();
      }
    });
  }

  // 4. Handle SVG use elements (WeChat doesn't support SVG use references)
  if (opts.handleSvgUse) {
    $("svg use").each((_, element) => {
      const $el = $(element);
      const href = $el.attr("href") || $el.attr("xlink:href");
      if (href) {
        const targetId = href.replace("#", "");
        const $target = $(`#${targetId}`);
        if ($target.length) {
          const $clone = $target.clone();
          $clone.removeAttr("id");
          const transform = $el.attr("transform");
          if (transform) {
            $clone.attr("transform", transform);
          }
          $el.parent().append($clone);
          $el.remove();
        }
      }
    });

    // Remove SVG defs as they're no longer needed
    $("svg defs").remove();
  }

  // 5. Handle MathJax SVG width/height attributes
  if (opts.handleMathJax) {
    $("mjx-container svg, .MathJax svg, .katex svg").each((_, element) => {
      const $el = $(element);
      const width = $el.attr("width");
      const height = $el.attr("height");
      if (width || height) {
        const currentStyle = $el.attr("style") || "";
        const widthStyle = width ? `width: ${width};` : "";
        const heightStyle = height ? `height: ${height};` : "";
        const newStyle = `${widthStyle} ${heightStyle} ${currentStyle}`.trim();
        $el.attr("style", newStyle);
        $el.removeAttr("width");
        $el.removeAttr("height");
      }
    });
  }

  // 6. Convert external links to footnotes (WeChat doesn't support clickable external links)
  const footnotes: FootnoteLink[] = [];
  if (opts.convertLinksToFootnotes) {
    $("a[href]").each((_, element) => {
      const $el = $(element);
      const href = $el.attr("href");

      // Skip internal anchors and javascript links
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }

      // Get link text
      const text = $el.text().trim() || href;

      // Check if this link is already in footnotes (avoid duplicates for same URL)
      let footnoteIndex = footnotes.findIndex((f) => f.href === href);
      if (footnoteIndex === -1) {
        footnotes.push({ text, href });
        footnoteIndex = footnotes.length - 1;
      }

      // Replace <a> with <span> containing text and footnote reference
      const footnoteRef = `<span class="footnote-ref">[${footnoteIndex + 1}]</span>`;
      const $span = $(`<span class="link">${text}${footnoteRef}</span>`);

      // Copy inline styles from original link
      const style = $el.attr("style");
      if (style) {
        $span.attr("style", style);
      }

      $el.replaceWith($span);
    });

    // Append footnotes section at the end if there are any links
    if (footnotes.length > 0) {
      const footnotesHtml = generateFootnotesSection(footnotes);
      $.root().append(footnotesHtml);
    }
  }

  // 7. Get processed HTML
  let result = $.html();

  // 7.5. 保护代码块中的空格，将连续空格转换为 &nbsp;
  result = result.replace(
    /<code[^>]*class="[^"]*hljs[^"]*"[^>]*>([\s\S]*?)<\/code>/g,
    (match, codeContent) => {
      // 将每行开头的空格转换为 &nbsp;
      const protectedContent = codeContent.replace(
        /^( +)/gm,
        (spaces: string) => {
          return spaces.replace(/ /g, "&nbsp;");
        },
      );
      return match.replace(codeContent, protectedContent);
    },
  );

  // 8. Convert div to section (WeChat compatibility)
  if (opts.convertDivToSection) {
    result = result
      .replace(/<div/g, "<section")
      .replace(/<\/div>/g, "</section>");
  }

  // 9. Replace CSS variables with concrete values (WeChat doesn't support CSS variables)
  result = result
    .replace(/var\(--weui-BG-0\)/g, "#ededed")
    .replace(/var\(--weui-BG-2\)/g, "#ffffff")
    .replace(/var\(--weui-FG-0\)/g, "#000000")
    .replace(/var\(--weui-FG-1\)/g, "#333333")
    .replace(/var\(--weui-FG-2\)/g, "#666666")
    .replace(/var\(--weui-BRAND\)/g, "#07c160")
    .replace(/var\(--weui-LINK\)/g, "#576b95");

  return result;
}

/**
 * Convert image URL to base64 data URL
 * Useful for cross-origin images or QR codes
 */
export async function convertImageToBase64(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } else {
        reject(new Error("Failed to get canvas context"));
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
