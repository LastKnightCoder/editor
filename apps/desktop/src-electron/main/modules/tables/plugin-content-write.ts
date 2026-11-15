import type Database from "better-sqlite3";
import { basename } from "node:path";
import type { CommandContext } from "@tau/rpc";
import type { IContent } from "@/types/content";
import type { PluginContentEdit, PluginDataScope } from "@/types/plugin-data";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import { getMarkdownText } from "../../services/content-conversion";
import { contentSession } from "../collaboration/content-sessions";
import { markContentOrigin, writeAsPlugin } from "../domain-event-origin";
import type { replaceContent } from "./content-replacement";
import { resolvePluginContent } from "./plugin-content-input";

export const CONFLICT_PREFIX = "PLUGIN_CONFLICT:";

export interface PluginContentEditRequest extends PluginDataScope {
  pluginId: string;
  contentId: number;
  createdAt: number;
  edit: PluginContentEdit;
  expectedRevision: string;
}

interface PluginContentWritePorts {
  assertDatabase(db: Database.Database, scope: PluginDataScope): void;
  readContent(db: Database.Database, contentId: number): IContent | null;
  replace: typeof replaceContent;
}

export function pluginContentRevision(content: Pick<IContent, "revision" | "updateTime">) {
  return content.revision ?? `u:${content.updateTime}`;
}

async function applyEdit(
  db: Database.Database,
  current: Pick<IContent, "content" | "contracts">,
  edit: PluginContentEdit
): Promise<Pick<IContent, "content" | "contracts">> {
  switch (edit.op) {
    case "append":
    case "prepend": {
      const added = await resolvePluginContent(db, edit.content, []);
      return {
        content:
          edit.op === "append"
            ? [...current.content, ...added.content]
            : [...added.content, ...current.content],
        contracts: { ...current.contracts, ...added.contracts },
      };
    }
    case "replaceAll": {
      const replacement = await resolvePluginContent(db, edit.content, DEFAULT_CARD_CONTENT);
      return { ...replacement, contracts: { ...current.contracts, ...replacement.contracts } };
    }
    case "replaceText": {
      const markdown = await getMarkdownText(current.content, current.contracts);
      const first = markdown.indexOf(edit.find);
      if (first < 0) throw new Error("没有找到要替换的文字");
      if (markdown.indexOf(edit.find, first + 1) >= 0)
        throw new Error("要替换的文字出现了多次，请提供更长的上下文");
      const replacement = await resolvePluginContent(
        db,
        {
          markdown:
            markdown.slice(0, first) + edit.markdown + markdown.slice(first + edit.find.length),
        },
        DEFAULT_CARD_CONTENT
      );
      return { ...replacement, contracts: { ...current.contracts, ...replacement.contracts } };
    }
    default:
      throw new Error("未知的正文修改");
  }
}

export async function writePluginContentEdit(
  db: Database.Database,
  request: PluginContentEditRequest,
  ctx: CommandContext,
  ports: PluginContentWritePorts
): Promise<{ revision: string }> {
  const assertDatabase = () => {
    ports.assertDatabase(db, request);
    if (!db.open) throw new Error("数据库连接已失效");
  };
  assertDatabase();
  const { contentId, createdAt, pluginId } = request;
  const exists = db.prepare("SELECT 1 FROM content_snapshots WHERE id = ? AND create_time = ?");
  const read = () => (exists.get(contentId, createdAt) ? ports.readContent(db, contentId) : null);
  const current = read();
  if (!current) throw new Error("正文不存在");
  const revision = pluginContentRevision(current);
  if (revision !== request.expectedRevision)
    throw new Error(`${CONFLICT_PREFIX}正文已被修改，请重新读取后再试`);
  const session = contentSession(db, contentId);

  const prepared = await applyEdit(db, current, request.edit);
  assertDatabase();
  const latest = read();
  if (
    !latest ||
    pluginContentRevision(latest) !== revision ||
    contentSession(db, contentId) !== session
  )
    throw new Error(`${CONFLICT_PREFIX}转换期间正文已变化，请重新读取后再试`);

  await writeAsPlugin(pluginId, () =>
    ports.replace(db, contentId, { ...prepared, expectedRevision: revision }, ctx, {
      onAccepted: () => {
        markContentOrigin(basename(db.name), contentId, pluginId);
      },
    })
  );
  assertDatabase();
  const saved = read();
  if (!saved) throw new Error("正文不存在");
  return { revision: pluginContentRevision(saved) };
}
