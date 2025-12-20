import { HtmlCleanOptions, HtmlCleanResult } from "./types";
import { makeUrlAbsolute } from "./url-utils";

const DEFAULT_CLEAN_OPTIONS: Required<HtmlCleanOptions> = {
  removeScripts: true,
  removeStyles: true,
  removeInlineStyles: true,
  makeUrlsAbsolute: true,
};

function ensureDomSupport() {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser is not available in this environment.");
  }
}

export function parseHtmlDocument(html: string, url?: string): Document {
  ensureDomSupport();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  if (url) {
    const baseTag = doc.querySelector("base");
    if (!baseTag) {
      const base = doc.createElement("base");
      base.href = url;
      doc.head?.prepend(base);
    }
  }
  return doc;
}

export function cleanHtmlDocument(
  doc: Document,
  options?: HtmlCleanOptions,
): Document {
  const config = { ...DEFAULT_CLEAN_OPTIONS, ...options };
  const cloned = doc.cloneNode(true) as Document;

  if (config.removeScripts) {
    cloned.querySelectorAll("script").forEach((el) => el.remove());
  }
  if (config.removeStyles) {
    cloned.querySelectorAll("style").forEach((el) => el.remove());
  }
  if (config.removeInlineStyles) {
    cloned.querySelectorAll("*").forEach((el) => el.removeAttribute("style"));
  }
  if (config.makeUrlsAbsolute) {
    try {
      const baseUrl = new URL(cloned.baseURI || doc.baseURI);
      cloned.querySelectorAll("[src], [href]").forEach((element) => {
        ["src", "href", "srcset"].forEach((attr) => {
          if (element.hasAttribute(attr)) {
            makeUrlAbsolute(element, attr, baseUrl);
          }
        });
      });
    } catch (error) {
      console.warn("Failed to resolve base URL for cleanup:", error);
    }
  }

  return cloned;
}

export function cleanHtml(
  html: string,
  url: string,
  options?: HtmlCleanOptions,
): HtmlCleanResult {
  const doc = parseHtmlDocument(html, url);
  const cleaned = cleanHtmlDocument(doc, options);
  return {
    document: cleaned,
    cleanedHtml: cleaned.documentElement.outerHTML,
  };
}
