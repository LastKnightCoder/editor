import { ipcMain } from "electron";
import log from "electron-log";
import { Module } from "../types/module";
import { safeFetchHtml } from "./safe-fetch";

export interface ReadabilityResult {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
  length: number;
}

class RssReadabilityModule implements Module {
  name: string;

  constructor() {
    this.name = "rss-readability";
  }

  async init(): Promise<void> {
    ipcMain.handle(
      "rss:extract-content",
      async (_event, url: string): Promise<ReadabilityResult | null> => {
        return this.extractContent(url);
      },
    );

    log.info("[RssReadability] initialized");
  }

  async extractContent(url: string): Promise<ReadabilityResult | null> {
    try {
      const html = await safeFetchHtml(url);

      const { parseHTML } = await import("linkedom");
      const { Readability } = await import("@mozilla/readability");

      const { document } = parseHTML(html);
      const baseEl = document.createElement("base");
      baseEl.setAttribute("href", url);
      document.head.appendChild(baseEl);
      const reader = new Readability(document as any);
      const article = reader.parse();

      if (!article) {
        log.warn(`[RssReadability] Could not extract content from ${url}`);
        return null;
      }

      return {
        title: article.title,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName,
        length: article.length,
      };
    } catch (error: any) {
      log.error(
        `[RssReadability] Failed to extract content from ${url}:`,
        error,
      );
      return null;
    }
  }
}

export default new RssReadabilityModule();
