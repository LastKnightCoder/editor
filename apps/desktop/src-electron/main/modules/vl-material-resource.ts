/**
 * Notebook 的「外部材料」资源（source_type = material）：问题立项时带入的摘录、PDF 标注、剪藏。
 * 索引时取快照：摘录 / 标注每条写成「引文 + 想法 + 出处」，剪藏取解析文档全文。
 */

import type Database from "better-sqlite3";
import { materialQuoteMarkdown } from "@/entity/material-markdown";
import type { MaterialSourceMeta } from "@/types/vibe-learning";
import { getMarkdownText } from "../services/content-conversion";
import ContentTable from "./tables/content";
import MaterialTable from "./tables/material";

/** 材料资源的 Markdown；全部材料都已不存在时返回空串 */
export async function buildMaterialResourceMarkdown(
  db: Database.Database,
  meta: MaterialSourceMeta
): Promise<string> {
  const sections = await Promise.all(
    MaterialTable.resolve(db, meta.refs).map(async info => {
      if (info.ref.kind !== "web-clip")
        return materialQuoteMarkdown({
          ...info,
          meta: info.deleted ? `${info.meta}（原划线已删除）` : info.meta,
        });
      const row = db.prepare(`SELECT content_id FROM web_clip WHERE id = ?`).get(info.ref.id) as
        { content_id: number } | undefined;
      const content = row ? ContentTable.getContentById(db, row.content_id) : null;
      const body = content ? (await getMarkdownText(content.content)).trim() : "";
      return [`## ${info.title}`, body, `—— ${info.meta}`].filter(Boolean).join("\n\n");
    })
  );
  const body = sections.filter(Boolean).join("\n\n---\n\n");
  return body ? `# ${meta.title}\n\n${body}\n` : "";
}
