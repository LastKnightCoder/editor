import type Database from "better-sqlite3";
import type { ContentNode } from "@tau/collaboration";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import { basename } from "node:path";
import { getContentLength } from "@/utils/helper.ts";
import { contentSession } from "../collaboration/content-sessions";
import { assertContentIsLocal } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import {
  ContentReplacement,
  type ContentReplacementInput,
} from "../content-ownership/content-replacement";
import { ContentDocumentTable } from "./content-document";
import Operation from "./operation";

interface ContentReplacementOptions {
  onAccepted?: () => void;
}

function writeColdContent(
  db: Database.Database,
  contentId: number,
  value: ContentReplacementInput
): void {
  assertContentIsLocal(db, contentId);
  const { content, contracts, expectedRevision, count } = value;
  const stored = ContentDocumentTable.read(db, contentId);
  if (stored) {
    ContentDocumentTable.commit(
      db,
      contentId,
      { ...stored, content: content as ContentNode[], contracts: contracts ?? stored.contracts },
      { expectedRevision, count: getContentLength(content) }
    );
    Operation.insertOperation(db, "content", "update", contentId, Date.now());
    return;
  }

  if (expectedRevision !== undefined) {
    const row = db.prepare("SELECT update_time FROM contents WHERE id = ?").get(contentId) as
      | { update_time: number }
      | undefined;
    if (!row || expectedRevision !== `u:${row.update_time}`) throw new Error("正文修订冲突");
  }
  const now = Date.now();
  const actualCount = content ? getContentLength(content) : (count ?? 0);
  db.prepare("UPDATE contents SET update_time = ?, content = ?, count = ? WHERE id = ?").run(
    now,
    JSON.stringify(content || []),
    actualCount,
    contentId
  );
  Operation.insertOperation(db, "content", "update", contentId, now);
}

export function bindContentReplacement(
  db: Database.Database,
  ctx: CommandContext,
  options?: ContentReplacementOptions
) {
  return new ContentReplacement({
    openContent: contentId => {
      const session = contentSession(db, contentId);
      if (!session) return;
      if (session.doc.getMap("meta").get("version") !== 2) return { kind: "unsupported" };
      const replace = session.replaceContent;
      return {
        kind: "current",
        replace: replace
          ? value => {
              const check = () => {
                if (!db.open || contentSession(db, contentId) !== session)
                  throw new Error("正文会话已变化，请重新读取");
              };
              return replace.call(
                session,
                value.content as ContentNode[],
                value.contracts,
                value.expectedRevision,
                check,
                options?.onAccepted
              );
            }
          : undefined,
      };
    },
    transaction: apply => db.transaction(apply)(),
    writeCold: (contentId, value) => writeColdContent(db, contentId, value),
    notifyColdWrite: contentId => {
      ctx.broadcastOthers("content:updated", { databaseName: basename(db.name), contentId });
      emitContentWritten(db, contentId, "update");
    },
  });
}

export async function replaceContent(
  db: Database.Database,
  contentId: number,
  value: ContentReplacementInput,
  ctx: CommandContext = fallbackCommandContext,
  options?: ContentReplacementOptions
): Promise<void> {
  return bindContentReplacement(db, ctx, options).replace(contentId, value);
}

export function replaceColdContent(
  db: Database.Database,
  contentId: number,
  value: ContentReplacementInput,
  ctx: CommandContext = fallbackCommandContext
): void {
  bindContentReplacement(db, ctx).replaceCold(contentId, value);
}
