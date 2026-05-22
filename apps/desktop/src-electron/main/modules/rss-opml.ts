import { ipcMain, dialog } from "electron";
import { readFileSync, writeFileSync } from "fs";
import log from "electron-log";
import { Module } from "../types/module";
import databaseModule from "./database";

interface OpmlOutline {
  title: string;
  xmlUrl?: string;
  htmlUrl?: string;
  type?: string;
  category?: string;
  children?: OpmlOutline[];
}

export function parseOpml(xml: string): OpmlOutline[] {
  const outlines: OpmlOutline[] = [];

  function parseOutlines(
    content: string,
    parentCategory?: string,
  ): OpmlOutline[] {
    const results: OpmlOutline[] = [];
    let match: RegExpExecArray | null;
    const regex = /<outline([^>]*?)(?:\/>|>([\s\S]*?)<\/outline>)/gi;

    while ((match = regex.exec(content)) !== null) {
      const attrs = match[1];
      const innerContent = match[2] || "";

      const getAttr = (name: string): string | undefined => {
        const attrMatch = attrs.match(
          new RegExp(`${name}=["']([^"']*)["']`, "i"),
        );
        return attrMatch ? decodeXml(attrMatch[1]) : undefined;
      };

      const title = getAttr("title") || getAttr("text") || "";
      const xmlUrl = getAttr("xmlUrl");
      const htmlUrl = getAttr("htmlUrl");
      const type = getAttr("type");

      if (xmlUrl) {
        results.push({
          title,
          xmlUrl,
          htmlUrl,
          type: type || "rss",
          category: parentCategory,
        });
      } else if (innerContent.includes("<outline")) {
        const children = parseOutlines(innerContent, title);
        results.push(...children);
      }
    }
    return results;
  }

  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return parseOutlines(bodyMatch[1]);
  }
  return outlines;
}

function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function generateOpml(
  feeds: {
    title: string;
    url: string;
    siteUrl: string | null;
    category: string | null;
  }[],
): string {
  const grouped: Record<string, typeof feeds> = {};
  for (const feed of feeds) {
    const cat = feed.category || "";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(feed);
  }

  let body = "";
  for (const [category, items] of Object.entries(grouped)) {
    if (category) {
      body += `    <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n`;
      for (const item of items) {
        body += `      <outline type="rss" text="${escapeXml(item.title)}" title="${escapeXml(item.title)}" xmlUrl="${escapeXml(item.url)}"${item.siteUrl ? ` htmlUrl="${escapeXml(item.siteUrl)}"` : ""}/>\n`;
      }
      body += `    </outline>\n`;
    } else {
      for (const item of items) {
        body += `    <outline type="rss" text="${escapeXml(item.title)}" title="${escapeXml(item.title)}" xmlUrl="${escapeXml(item.url)}"${item.siteUrl ? ` htmlUrl="${escapeXml(item.siteUrl)}"` : ""}/>\n`;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Tau RSS Subscriptions</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>
${body}  </body>
</opml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

class RssOpmlModule implements Module {
  name: string;

  constructor() {
    this.name = "rss-opml";
  }

  async init(): Promise<void> {
    ipcMain.handle("rss:import-opml", async (_event) => {
      return this.importOpml();
    });

    ipcMain.handle("rss:export-opml", async (_event) => {
      return this.exportOpml();
    });

    log.info("[RssOpml] initialized");
  }

  async importOpml(): Promise<{ imported: number; errors: string[] }> {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, errors: [] };
    }

    const filePath = result.filePaths[0];
    const content = readFileSync(filePath, "utf-8");
    const outlines = parseOpml(content);

    const db = databaseModule.getCurrentDatabase();
    if (!db) return { imported: 0, errors: ["No database"] };

    let imported = 0;
    const errors: string[] = [];
    const now = Date.now();

    for (const outline of outlines) {
      if (!outline.xmlUrl) continue;
      try {
        const existing = db
          .prepare(`SELECT id FROM rss_feed WHERE url = ?`)
          .get(outline.xmlUrl);
        let feedId: number;

        if (existing) {
          feedId = (existing as { id: number }).id;
        } else {
          const res = db
            .prepare(
              `INSERT INTO rss_feed (create_time, update_time, title, url, site_url, feed_type)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              now,
              now,
              outline.title || outline.xmlUrl,
              outline.xmlUrl,
              outline.htmlUrl || null,
              outline.type === "atom" ? "atom" : "rss",
            );
          feedId = Number(res.lastInsertRowid);
        }

        const existingSub = db
          .prepare(`SELECT id FROM rss_subscription WHERE feed_id = ?`)
          .get(feedId);
        if (!existingSub) {
          db.prepare(
            `INSERT INTO rss_subscription (create_time, update_time, feed_id, title, category)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(
            now,
            now,
            feedId,
            outline.title || null,
            outline.category || null,
          );
        }

        imported++;
      } catch (e: any) {
        errors.push(`${outline.title || outline.xmlUrl}: ${e.message}`);
      }
    }

    return { imported, errors };
  }

  async exportOpml(): Promise<{ success: boolean; path?: string }> {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return { success: false };

    const rows = db
      .prepare(
        `SELECT f.title, f.url, f.site_url, s.category
         FROM rss_feed f
         JOIN rss_subscription s ON s.feed_id = f.id
         ORDER BY s.category, f.title`,
      )
      .all() as {
      title: string;
      url: string;
      site_url: string | null;
      category: string | null;
    }[];

    const opml = generateOpml(
      rows.map((r) => ({
        title: r.title,
        url: r.url,
        siteUrl: r.site_url,
        category: r.category,
      })),
    );

    const result = await dialog.showSaveDialog({
      defaultPath: "subscriptions.opml",
      filters: [{ name: "OPML", extensions: ["opml"] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false };
    }

    writeFileSync(result.filePath, opml, "utf-8");
    return { success: true, path: result.filePath };
  }
}

export default new RssOpmlModule();
