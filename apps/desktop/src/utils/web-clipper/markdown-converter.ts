import TurndownService from "turndown";
import { MathMLToLaTeX } from "mathml-to-latex";
import { processUrls } from "./url-utils";

function getElementHTML(element: Element): string {
  const serializer = new XMLSerializer();
  let result = "";
  Array.from(element.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      result += serializer.serializeToString(node);
    } else if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
    }
  });
  return result;
}

export interface MarkdownConvertOptions {
  debug?: boolean;
}

function debug(enabled: boolean | undefined, ...args: unknown[]) {
  if (enabled) {
    console.debug(...args);
  }
}

export function createMarkdownContent(
  content: string,
  url: string,
  options?: MarkdownConvertOptions,
) {
  debug(options?.debug, "[Markdown] Start conversion:", url);

  let processedContent = content;
  try {
    const baseUrl = new URL(url);
    processedContent = processUrls(content, baseUrl);
  } catch (error) {
    console.warn("Invalid URL for markdown conversion:", url);
  }

  const footnotes: { [key: string]: string } = {};

  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    preformattedCode: true,
  });

  turndownService.addRule("table", {
    filter: "table",
    replacement: function (content, node) {
      if (!(node instanceof HTMLTableElement)) return content;

      if (
        node.classList.contains("ltx_equation") ||
        node.classList.contains("ltx_eqn_table")
      ) {
        return handleNestedEquations(node);
      }

      const hasComplexStructure = Array.from(
        node.querySelectorAll("td, th"),
      ).some(
        (cell) => cell.hasAttribute("colspan") || cell.hasAttribute("rowspan"),
      );

      if (hasComplexStructure) {
        const cleanedTable = cleanupTableHTML(node);
        return `\n\n${cleanedTable}\n\n`;
      }

      const rows = Array.from(node.rows).map((row) => {
        const cells = Array.from(row.cells).map((cell) => {
          let cellContent = turndownService
            .turndown(getElementHTML(cell))
            .replace(/\n/g, " ")
            .trim();
          cellContent = cellContent.replace(/\|/g, "\\|");
          return cellContent;
        });
        return `| ${cells.join(" | ")} |`;
      });

      const separatorRow = `| ${Array(rows[0].split("|").length - 2)
        .fill("---")
        .join(" | ")} |`;

      const tableContent = [rows[0], separatorRow, ...rows.slice(1)].join("\n");
      return `\n\n${tableContent}\n\n`;
    },
  });

  turndownService.remove(["style", "script"]);
  turndownService.keep([
    "iframe",
    "video",
    "audio",
    "sup",
    "sub",
    "svg",
    "math",
  ]);
  turndownService.remove(["button"]);

  turndownService.addRule("list", {
    filter: ["ul", "ol"],
    replacement: function (content, node) {
      const trimmed = content.trim();
      const isTopLevel = !(
        node.parentNode && ["UL", "OL"].includes(node.parentNode.nodeName)
      );
      return (isTopLevel ? "\n" : "") + trimmed + "\n";
    },
  });

  turndownService.addRule("listItem", {
    filter: "li",
    replacement: function (content, node, options) {
      if (!(node instanceof HTMLElement)) return content;

      const isTaskListItem = node.classList.contains("task-list-item");
      const checkbox = node.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null;
      let taskListMarker = "";
      if (isTaskListItem && checkbox) {
        content = content.replace(/<input[^>]*>/, "");
        taskListMarker = checkbox.checked ? "[x] " : "[ ] ";
      }

      const cleanedContent = content
        .replace(/\n+$/, "")
        .split("\n")
        .filter((line) => line.length > 0)
        .join("\n\t");

      let prefix = options.bulletListMarker + " ";
      const parent = node.parentNode;

      let level = 0;
      let currentParent = node.parentNode;
      while (
        currentParent &&
        (currentParent.nodeName === "UL" || currentParent.nodeName === "OL")
      ) {
        level++;
        currentParent = currentParent.parentNode;
      }

      const indentLevel = Math.max(0, level - 1);
      prefix = "\t".repeat(indentLevel) + prefix;

      if (parent instanceof HTMLOListElement) {
        const start = parent.getAttribute("start");
        const index = Array.from(parent.children).indexOf(node) + 1;
        prefix =
          "\t".repeat(level - 1) +
          (start ? Number(start) + index - 1 : index) +
          ". ";
      }

      return (
        prefix +
        taskListMarker +
        cleanedContent.trim() +
        (node.nextSibling && !/\n$/.test(content) ? "\n" : "")
      );
    },
  });

  turndownService.addRule("figure", {
    filter: "figure",
    replacement: function (content, node) {
      const figure = node as HTMLElement;
      const img = figure.querySelector("img");
      const figcaption = figure.querySelector("figcaption");

      if (!img) return content;

      const alt = img.getAttribute("alt") || "";
      let src = img.getAttribute("src") || "";
      const srcset = img.getAttribute("srcset") || "";

      if (srcset) {
        const images: { src: string; width: number }[] = [];
        const srcsetUrls = srcset.split(",%20");
        for (const url of srcsetUrls) {
          const split = url.split("%20");
          const srcUrl = split[0];
          const width = parseInt(split[1], 10);
          images.push({ src: srcUrl, width });
        }
        src = images[0]?.src || src;
      }

      let caption = "";

      if (figcaption) {
        const tagSpan = figcaption.querySelector(".ltx_tag_figure");
        const tagText = tagSpan ? tagSpan.textContent?.trim() : "";

        let captionContent = getElementHTML(figcaption);
        captionContent = captionContent.replace(
          /<math.*?>(.*?)<\/math>/g,
          (match, _mathContent, offset, string) => {
            const mathElement = new DOMParser().parseFromString(
              match,
              "text/html",
            ).body.firstChild as Element;
            const latex = extractLatex(mathElement);
            const prevChar = string[offset - 1] || "";
            const nextChar = string[offset + match.length] || "";

            const isStartOfLine = offset === 0 || /\s/.test(prevChar);
            const isEndOfLine =
              offset + match.length === string.length || /\s/.test(nextChar);

            const leftSpace =
              !isStartOfLine && !/[\s$]/.test(prevChar) ? " " : "";
            const rightSpace =
              !isEndOfLine && !/[\s$]/.test(nextChar) ? " " : "";

            return `${leftSpace}$${latex}$${rightSpace}`;
          },
        );

        const captionMarkdown = turndownService.turndown(captionContent);
        caption = `${tagText} ${captionMarkdown}`.trim();
      }

      caption = caption.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match) => match);

      return `![${alt}](${src})\n\n${caption}\n\n`;
    },
  });

  turndownService.addRule("embedToMarkdown", {
    filter: function (node: Node): boolean {
      if (node instanceof HTMLIFrameElement) {
        const src = node.getAttribute("src");
        return (
          !!src &&
          (!!src.match(/(?:youtube\.com|youtu\.be)/) ||
            !!src.match(/(?:twitter\.com|x\.com)/))
        );
      }
      return false;
    },
    replacement: function (content: string, node: Node): string {
      if (node instanceof HTMLIFrameElement) {
        const src = node.getAttribute("src");
        if (src) {
          const youtubeMatch = src.match(
            /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/,
          );
          if (youtubeMatch && youtubeMatch[1]) {
            return `![](https://www.youtube.com/watch?v=${youtubeMatch[1]})`;
          }
          const tweetMatch = src.match(
            /(?:twitter\.com|x\.com)\/.*?(?:status|statuses)\/(\d+)/,
          );
          if (tweetMatch && tweetMatch[1]) {
            return `![](https://x.com/i/status/${tweetMatch[1]})`;
          }
        }
      }
      return content;
    },
  });

  turndownService.addRule("highlight", {
    filter: "mark",
    replacement: function (content) {
      return `==${content}==`;
    },
  });

  turndownService.addRule("strikethrough", {
    filter: (node: Node) =>
      node.nodeName === "DEL" ||
      node.nodeName === "S" ||
      node.nodeName === "STRIKE",
    replacement: function (content) {
      return `~~${content}~~`;
    },
  });

  turndownService.addRule("complexLinkStructure", {
    filter: function (node: Node) {
      return (
        node.nodeName === "A" &&
        node.childNodes.length > 1 &&
        Array.from(node.childNodes).some((child: Node) =>
          ["H1", "H2", "H3", "H4", "H5", "H6"].includes(child.nodeName),
        )
      );
    },
    replacement: function (content, node) {
      if (!(node instanceof HTMLElement)) return content;
      const href = node.getAttribute("href");
      const title = node.getAttribute("title");

      const headingNode = node.querySelector("h1, h2, h3, h4, h5, h6");
      const headingContent = headingNode
        ? turndownService.turndown(getElementHTML(headingNode))
        : "";

      if (headingNode) {
        headingNode.remove();
      }

      const remainingContent = turndownService.turndown(getElementHTML(node));
      let markdown = `${headingContent}\n\n${remainingContent}\n\n`;
      if (href) {
        markdown += `[View original](${href})`;
        if (title) {
          markdown += ` "${title}"`;
        }
      }
      return markdown;
    },
  });

  turndownService.addRule("arXivEnumerate", {
    filter: (node: Node) =>
      node.nodeName === "OL" &&
      (node as HTMLElement).classList.contains("ltx_enumerate"),
    replacement: function (_content, node) {
      if (!(node instanceof HTMLElement)) return "";
      const items = Array.from(node.children).map((item, index) => {
        if (item instanceof HTMLElement) {
          const itemContent = getElementHTML(item).replace(
            /^<span class="ltx_tag ltx_tag_item">\d+\.<\/span>\s*/,
            "",
          );
          return `${index + 1}. ${turndownService.turndown(itemContent)}`;
        }
        return "";
      });
      return `\n\n${items.join("\n\n")}\n\n`;
    },
  });

  turndownService.addRule("removeHiddenElements", {
    filter: function (node: Node) {
      return node instanceof HTMLElement && node.style.display === "none";
    },
    replacement: function () {
      return "";
    },
  });

  turndownService.addRule("citations", {
    filter: (node: Node): boolean => {
      if (node instanceof Element) {
        return node.nodeName === "SUP" && node.id.startsWith("fnref:");
      }
      return false;
    },
    replacement: (_content, node) => {
      if (node instanceof HTMLElement && node.id.startsWith("fnref:")) {
        const id = node.id.replace("fnref:", "");
        const primaryNumber = id.split("-")[0];
        return `[^${primaryNumber}]`;
      }
      return "";
    },
  });

  turndownService.addRule("footnotesList", {
    filter: (node: Node): boolean => {
      if (node instanceof HTMLOListElement) {
        return node.parentElement?.id === "footnotes";
      }
      return false;
    },
    replacement: (_content, node) => {
      if (node instanceof HTMLElement) {
        const references = Array.from(node.children).map((li) => {
          let id = li.id;
          if (li.id.startsWith("fn:")) {
            id = li.id.replace("fn:", "");
          } else {
            const match = li.id
              .split("/")
              .pop()
              ?.match(/cite_note-(.+)/);
            id = match ? match[1] : li.id;
          }

          const supElement = li.querySelector("sup");
          if (supElement && supElement.textContent?.trim() === id) {
            supElement.remove();
          }

          const referenceContent = turndownService.turndown(getElementHTML(li));
          const cleanedContent = referenceContent.replace(/\s*↩︎$/, "").trim();
          footnotes[id.toLowerCase()] = cleanedContent;
          return `[^${id.toLowerCase()}]: ${cleanedContent}`;
        });
        return `\n\n${references.join("\n\n")}\n\n`;
      }
      return "";
    },
  });

  turndownService.addRule("removals", {
    filter: function (node: Node) {
      if (!(node instanceof HTMLElement)) return false;
      if (node.getAttribute("href")?.includes("#fnref")) return true;
      if (node.classList.contains("footnote-backref")) return true;
      return false;
    },
    replacement: function () {
      return "";
    },
  });

  turndownService.addRule("handleTextNodesInTables", {
    filter: function (node: Node): boolean {
      return (
        node.nodeType === Node.TEXT_NODE &&
        node.parentNode !== null &&
        node.parentNode.nodeName === "TD"
      );
    },
    replacement: function (content: string): string {
      return content;
    },
  });

  turndownService.addRule("preformattedCode", {
    filter: (node: Node) => node.nodeName === "PRE",
    replacement: (content, node) => {
      if (!(node instanceof HTMLElement)) return content;

      const codeElement = node.querySelector("code");
      if (!codeElement) return content;

      const language = codeElement.getAttribute("data-lang") || "";
      const code = codeElement.textContent || "";
      const cleanCode = code.trim().replace(/`/g, "\\`");
      return `\n\`\`\`${language}\n${cleanCode}\n\`\`\`\n`;
    },
  });

  turndownService.addRule("MathJax", {
    filter: (node: Node) => node.nodeName.toLowerCase() === "mjx-container",
    replacement: (content, node) => {
      if (!(node instanceof HTMLElement)) {
        return content;
      }

      const assistiveMml = node.querySelector("mjx-assistive-mml");
      if (!assistiveMml) {
        return content;
      }

      const mathElement = assistiveMml.querySelector("math");
      if (!mathElement) {
        return content;
      }

      let latex;
      try {
        latex = MathMLToLaTeX.convert(mathElement.outerHTML);
      } catch (error) {
        console.error("Error converting MathML to LaTeX:", error);
        return content;
      }

      const isBlock = mathElement.getAttribute("display") === "block";
      return isBlock ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
    },
  });

  turndownService.addRule("math", {
    filter: (node: Node) =>
      node.nodeName.toLowerCase() === "math" ||
      (node instanceof Element &&
        node.classList &&
        (node.classList.contains("mwe-math-element") ||
          node.classList.contains("mwe-math-fallback-image-inline") ||
          node.classList.contains("mwe-math-fallback-image-display"))),
    replacement: (content, node) => {
      if (!(node instanceof Element)) return content;

      const latex = extractLatex(node).trim();
      const isInTable = node.closest("table") !== null;

      if (
        !isInTable &&
        (node.getAttribute("display") === "block" ||
          node.classList.contains("mwe-math-fallback-image-display") ||
          (node.parentElement &&
            node.parentElement.classList.contains("mwe-math-element") &&
            node.parentElement.previousElementSibling &&
            node.parentElement.previousElementSibling.nodeName.toLowerCase() ===
              "p"))
      ) {
        return `\n$$\n${latex}\n$$\n`;
      }

      const prevNode = node.previousSibling;
      const nextNode = node.nextSibling;
      const prevChar = prevNode?.textContent?.slice(-1) || "";
      const nextChar = nextNode?.textContent?.[0] || "";

      const isStartOfLine =
        !prevNode ||
        (prevNode.nodeType === Node.TEXT_NODE &&
          prevNode.textContent?.trim() === "");
      const isEndOfLine =
        !nextNode ||
        (nextNode.nodeType === Node.TEXT_NODE &&
          nextNode.textContent?.trim() === "");

      const leftSpace =
        !isStartOfLine && prevChar && !/[\s$]/.test(prevChar) ? " " : "";
      const rightSpace =
        !isEndOfLine && nextChar && !/[\s$]/.test(nextChar) ? " " : "";

      return `${leftSpace}$${latex}$${rightSpace}`;
    },
  });

  turndownService.addRule("katex", {
    filter: (node: Node) =>
      node instanceof HTMLElement &&
      (node.classList.contains("math") || node.classList.contains("katex")),
    replacement: (content, node) => {
      if (!(node instanceof HTMLElement)) return content;

      let latex = node.getAttribute("data-latex");
      if (!latex) {
        const mathml = node.querySelector(
          '.katex-mathml annotation[encoding="application/x-tex"]',
        );
        latex = mathml?.textContent || "";
      }
      if (!latex) {
        latex = node.textContent?.trim() || "";
      }

      const mathElement = node.querySelector(".katex-mathml math");
      const isInline =
        node.classList.contains("math-inline") ||
        (mathElement && mathElement.getAttribute("display") !== "block");

      return isInline ? `$${latex}$` : `\n$$\n${latex}\n$$\n`;
    },
  });

  turndownService.addRule("callout", {
    filter: (node: Node) =>
      node.nodeName.toLowerCase() === "div" &&
      (node as HTMLElement).classList.contains("markdown-alert"),
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const alertClasses = Array.from(element.classList);
      const typeClass = alertClasses.find(
        (c) => c.startsWith("markdown-alert-") && c !== "markdown-alert",
      );
      const type = typeClass
        ? typeClass.replace("markdown-alert-", "").toUpperCase()
        : "NOTE";

      const titleElement = element.querySelector(".markdown-alert-title");
      const contentElement = element.querySelector(
        "p:not(.markdown-alert-title)",
      );

      let alertContent = content;
      if (titleElement && titleElement.textContent) {
        alertContent =
          contentElement?.textContent ||
          content.replace(titleElement.textContent, "");
      }

      return `\n> [!${type}]\n> ${alertContent.trim().replace(/\n/g, "\n> ")}\n`;
    },
  });

  function handleNestedEquations(table: Element): string {
    const mathElements = table.querySelectorAll("math[alttext]");
    if (mathElements.length === 0) return "";

    return Array.from(mathElements)
      .map((mathElement) => {
        const alttext = mathElement.getAttribute("alttext");
        if (alttext) {
          const isInline = mathElement.closest(".ltx_eqn_inline") !== null;
          return isInline
            ? `$${alttext.trim()}$`
            : `\n$$\n${alttext.trim()}\n$$`;
        }
        return "";
      })
      .join("\n\n");
  }

  function cleanupTableHTML(table: HTMLTableElement): string {
    const allowedAttributes = [
      "src",
      "href",
      "style",
      "align",
      "width",
      "height",
      "rowspan",
      "colspan",
      "bgcolor",
      "scope",
      "valign",
      "headers",
    ];

    const cleanElement = (element: Element) => {
      Array.from(element.attributes).forEach((attr) => {
        if (!allowedAttributes.includes(attr.name)) {
          element.removeAttribute(attr.name);
        }
      });
      element.childNodes.forEach((child) => {
        if (child instanceof Element) {
          cleanElement(child);
        }
      });
    };

    const tableClone = table.cloneNode(true) as HTMLTableElement;
    cleanElement(tableClone);
    return tableClone.outerHTML;
  }

  function extractLatex(element: Element): string {
    if (element.nodeName.toLowerCase() === "math") {
      const latex = element.getAttribute("data-latex");
      const alttext = element.getAttribute("alttext");
      if (latex) {
        return latex.trim();
      }
      if (alttext) {
        return alttext.trim();
      }
    }

    const mathElement = element.querySelector("math[alttext]");
    if (mathElement) {
      const alttext = mathElement.getAttribute("alttext");
      if (alttext) {
        return alttext.trim();
      }
    }

    const annotation = element.querySelector(
      'annotation[encoding="application/x-tex"]',
    );
    if (annotation?.textContent) {
      return annotation.textContent.trim();
    }

    const mathNode =
      element.nodeName.toLowerCase() === "math"
        ? element
        : element.querySelector("math");
    if (mathNode) {
      return MathMLToLaTeX.convert(mathNode.outerHTML);
    }

    const imgNode = element.querySelector("img");
    return imgNode?.getAttribute("alt") || "";
  }

  try {
    let markdown = turndownService.turndown(processedContent);

    const titleMatch = markdown.match(/^# .+\n+/);
    if (titleMatch) {
      markdown = markdown.slice(titleMatch[0].length);
    }

    markdown = markdown.replace(/\n*(?<!!)\[]\([^)]+\)\n*/g, "");
    markdown = markdown.replace(/\n{3,}/g, "\n\n");

    if (Object.keys(footnotes).length > 0) {
      markdown += "\n\n---\n\n";
      for (const [id, footnoteContent] of Object.entries(footnotes)) {
        markdown += `[^${id}]: ${footnoteContent}\n\n`;
      }
    }

    return markdown.trim();
  } catch (error) {
    console.error("Error converting HTML to Markdown:", error);
    return `Partial conversion completed with errors. Original HTML:\n\n${processedContent}`;
  }
}
