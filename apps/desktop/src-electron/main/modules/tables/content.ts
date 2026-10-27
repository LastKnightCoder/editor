import { asynchronousDatabaseCommand } from "../database-command";
import { hasDurableEntityHold } from "../durable-entity-holds";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { ContentIdentityTable } from "./content-identity";
import { dfs, getContentLength } from "@/utils/helper.ts";
import { IContent, ICreateContent, IUpdateContent } from "@/types";
import { Descendant } from "slate";
import { basename } from "node:path";

import Operation from "./operation";
import WhiteBoardContentTable from "./white-board-content";
import ContentAiMetaTable from "./content-ai-meta";
import ContentAiInsightsTable from "./content-ai-insights";
import ContentLinkTable from "./content-link";
import ComposeBoardTable from "./compose-board";
import { assertContentIsLocal, findCollaborationBinding } from "../collaboration-guard";
import { emitContentWritten } from "../content-events";
import {
  contentSession,
  contentRevision,
  patchSessionNodes,
  readLocalSessionContent,
} from "../collaboration/content-sessions";
import {
  nodeText,
  patchParagraph,
  type NodeAttributePatcher,
  type TextPatcher,
  type ParagraphPatcher,
  type PatchNode,
} from "../content-node-patches";
import { type ContentNode } from "@tau/collaboration";
import { createTaskIdPatcher } from "@tau/editor/extensions/list/task-ids";
import { getNextTaskEntityId } from "./module-entity-id";
import { ContentDocumentTable } from "./content-document";
import { NODE_CONTRACT_PROPERTY } from "@tau/db-schema/content-contracts";

/** 引用归零后延迟回收的宽限期：窗口内撤销重新引用即可救回正文（D-136） */
export const CONTENT_RELEASE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export default class ContentTable {
  static ensureTaskIds(db: Database.Database, contentId: number): number {
    const session = contentSession(db, contentId);
    if (
      session?.info.frozen ||
      session?.info.leaving ||
      (session && session.info.status !== "active")
    )
      return 0;
    if (session && session.doc.getMap("meta").get("version") !== 2) return 0;
    if (session && session.info.mode !== "local" && session.info.role !== "owner") return 0;
    return this.patchNodes(db, contentId, createTaskIdPatcher(), { silent: !session });
  }
  static getListenEvents() {
    return {
      "content:update": asynchronousDatabaseCommand(this.writeContent.bind(this)),
      "content:create": this.createContent.bind(this),
      "content:create-pending": this.createPendingContent.bind(this),
      "content:get-by-id": asynchronousDatabaseCommand(this.readContent.bind(this)),
      "content:delete": this.deleteContent.bind(this),
      "content:increment-ref-count": this.incrementRefCount.bind(this),
      "content:decrement-ref-count": this.decrementRefCount.bind(this),
    };
  }
  static parseContent(content: any): IContent {
    return {
      id: content.id,
      createTime: content.create_time,
      updateTime: content.update_time,
      content: JSON.parse(content.content),
      count: content.count,
      refCount: content.ref_count,
      ...(content.contracts
        ? { contracts: JSON.parse(content.contracts), revision: content.revision }
        : {}),
    };
  }

  /** 渲染端读取正文：不合格的正文先自愈（备份原文、补身份与契约）再返回，读到的总能编辑与写回 */
  static async readContent(db: Database.Database, contentId: number): Promise<IContent | null> {
    const { repairContentForOpen } = await import("../content-repair");
    const name = basename(db.name, ".db");
    await repairContentForOpen(db, name, contentId, () => db.open);
    return this.getContentById(db, contentId);
  }

  static getContentById(db: Database.Database, contentId: number | bigint): IContent | null {
    const stmt = db.prepare("SELECT * FROM contents WHERE id = ?");
    const content = stmt.get(contentId);
    if (!content) {
      return null;
    }
    const stored = ContentDocumentTable.read(db, Number(contentId));
    const parsed = {
      ...this.parseContent(content),
      ...(stored ? { revision: stored.revision, contracts: stored.contracts } : {}),
    };
    const session = contentSession(db, Number(contentId));
    return session?.doc.getMap("meta").get("version") === 2
      ? {
          ...parsed,
          content: readLocalSessionContent(session).content as Descendant[],
          revision: contentRevision(session),
          ...(session.doc.getMap("meta").get("version") === 2
            ? {
                contracts: session.doc
                  .getMap("node-tree:contracts")
                  .toJSON() as import("@tau/db-schema/content-contracts").ContentContractDictionary,
              }
            : {}),
        }
      : parsed;
  }

  static getAllContents(db: Database.Database): IContent[] {
    const stmt = db.prepare(
      "SELECT c.*,d.contracts,d.revision FROM contents c LEFT JOIN content_documents d ON d.content_id=c.id ORDER BY c.create_time DESC"
    );
    const contents = stmt.all();
    return contents.map(content => this.parseContent(content));
  }

  static getContentByIds(db: Database.Database, contentIds: number[]): IContent[] {
    if (contentIds.length === 0) return [];

    const placeholders = contentIds.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT c.*,d.contracts,d.revision FROM contents c LEFT JOIN content_documents d ON d.content_id=c.id WHERE c.id IN (${placeholders})`
    );
    const contents = stmt.all(contentIds);
    return contents.map(content => this.parseContent(content));
  }

  static createContent(db: Database.Database, contentData: Partial<ICreateContent>): number {
    return this.insertContent(db, contentData, 1);
  }

  /** 正文与契约在同一次读取中取得，调用方只消费转换后的文本。 */
  static async readText(
    db: Database.Database,
    contentId: number,
    title = "",
    whole = false,
    sections = true,
    signal?: AbortSignal
  ) {
    if (signal?.aborted) throw new Error("正文转换已结束");
    const document = db
      .prepare(
        "SELECT c.content, d.contracts, d.format_version FROM contents c LEFT JOIN content_documents d ON d.content_id=c.id WHERE c.id=?"
      )
      .get(contentId) as
      | { content: string; contracts: string | null; format_version: number | null }
      | undefined;
    if (!document) return { content: "", sections: sections ? [] : undefined };
    if (document.format_version !== null && document.format_version !== 2)
      throw new Error("正文数据格式不兼容");
    const session = contentSession(db, contentId);
    const active = session?.doc.getMap("meta").get("version") === 2;
    const raw = active
      ? JSON.stringify(readLocalSessionContent(session).content)
      : document.content;
    const contracts = active
      ? (session.doc
          .getMap("node-tree:contracts")
          .toJSON() as import("@tau/db-schema/content-contracts").ContentContractDictionary)
      : document.contracts
        ? JSON.parse(document.contracts)
        : undefined;
    const { prepareContentNodes } = await import("../../services/content-conversion");
    return prepareContentNodes(raw, title, whole, contracts, sections, signal);
  }

  /** 以待回收状态创建正文（ref_count 0 + 登记待回收），首次保存进表时由差集 retain（D-136） */
  static createPendingContent(db: Database.Database, contentData: Partial<ICreateContent>): number {
    const contentId = this.insertContent(db, contentData, 0);
    db.prepare("INSERT INTO content_pending_releases (content_id, released_at) VALUES (?, ?)").run(
      contentId,
      Date.now()
    );
    return contentId;
  }

  private static insertContent(
    db: Database.Database,
    contentData: Partial<ICreateContent>,
    initialRefCount: number
  ): number {
    const createdContentId = db.transaction(() => {
      const content = structuredClone(contentData.content ?? []);
      if (contentData.contracts) {
        const assign = (nodes: ContentNode[]) => {
          for (const node of nodes)
            if (Array.isArray(node.children)) {
              node.collabId = randomUUID();
              assign(node.children);
            }
        };
        assign(content as ContentNode[]);
      }
      const count = getContentLength(content);
      const now = Date.now();
      const id = getNextTaskEntityId(db, "contents");
      db.prepare(
        "INSERT INTO contents (id,create_time,update_time,content,count,ref_count) VALUES (?,?,?,?,?,?)"
      ).run(id, now, now, JSON.stringify(content), count, initialRefCount);
      if (contentData.contracts) {
        ContentIdentityTable.establishBaseline(db);
        ContentDocumentTable.commit(
          db,
          id,
          {
            documentId: randomUUID(),
            content: content as ContentNode[],
            contracts: contentData.contracts,
          },
          { installDocument: true, count }
        );
      }
      Operation.insertOperation(db, "content", "insert", id, now);
      return id;
    })();
    emitContentWritten(db, createdContentId, "create");
    return createdContentId;
  }

  static async writeContent(
    db: Database.Database,
    contentId: number,
    value: Partial<IUpdateContent> & { content: Descendant[]; expectedRevision?: string },
    ctx: CommandContext = fallbackCommandContext
  ): Promise<IContent | null> {
    const session = contentSession(db, contentId);
    if (session?.doc.getMap("meta").get("version") === 2) {
      if (!session.replaceContent) throw new Error("正文写入服务尚未就绪");
      await session.replaceContent(
        value.content as ContentNode[],
        value.contracts,
        value.expectedRevision
      );
      return this.getContentById(db, contentId);
    }
    return this.updateContent(db, contentId, value, ctx);
  }

  static updateContent(
    db: Database.Database,
    contentId: number,
    contentData: Partial<IUpdateContent> & { content: Descendant[]; expectedRevision?: string },
    ctx: CommandContext = fallbackCommandContext
  ): IContent | null {
    const { content, count } = contentData;
    const session = contentSession(db, contentId);
    if (session) {
      throw new Error("CONTENT_VERSION_CONFLICT: 活跃正文必须通过带修订的文档写入入口修改");
    }
    assertContentIsLocal(db, contentId);

    const stored = ContentDocumentTable.read(db, contentId);
    if (stored) {
      db.transaction(() => {
        ContentDocumentTable.commit(
          db,
          contentId,
          {
            ...stored,
            content: content as ContentNode[],
            contracts: contentData.contracts ?? stored.contracts,
          },
          {
            expectedRevision: contentData.expectedRevision,
            count: getContentLength(content),
          }
        );
        Operation.insertOperation(db, "content", "update", contentId, Date.now());
      })();
      ctx.broadcastOthers("content:updated", { databaseName: basename(db.name), contentId });
      emitContentWritten(db, contentId, "update");
      return this.getContentById(db, contentId);
    }

    const stmt = db.prepare(
      "UPDATE contents SET update_time = ?, content = ?, count = ? WHERE id = ?"
    );
    const now = Date.now();
    const actualCount = content ? getContentLength(content) : (count ?? 0);
    stmt.run(now, JSON.stringify(content || []), actualCount, contentId);
    Operation.insertOperation(db, "content", "update", contentId, now);
    ctx.broadcastOthers("content:updated", { databaseName: basename(db.name), contentId });
    emitContentWritten(db, contentId, "update");
    return this.getContentById(db, contentId);
  }

  /**
   * 就地修改正文（勾选、补身份、改写 `#项目` 文字等），不整篇替换；返回改动的元素 / 文本段数，
   * 正文不存在为 0。patcher 看元素属性；text 看每段同格式的连续文字，返回改后的文字。
   * 有编辑会话时在会话文档上做增量修改（文字只删改差异的一段），由会话投影落库；否则改 JSON 后写库。
   *
   * silent 仅维护关闭正文的身份，不改时间及操作记录，通知视图刷新但不发写入事件。
   * canonical 元信息不计用户操作；有视图编辑时暂缓文字规范化，实际改文字仍重算字数并发事件。
   */
  static patchNodes(
    db: Database.Database,
    contentId: number,
    patcher: NodeAttributePatcher,
    options: {
      silent?: boolean;
      canonical?: boolean;
      text?: TextPatcher;
      paragraph?: ParagraphPatcher;
    } = {},
    ctx: CommandContext = fallbackCommandContext
  ): number {
    const session = contentSession(db, contentId);
    if (options.canonical && session?.info.mode !== "local" && session?.info.role === "editor")
      return 0;
    if (session) {
      const editing =
        options.canonical &&
        [...session.awareness.getStates().values()].some(state => state.activity === "editing");
      return options.silent
        ? 0
        : patchSessionNodes(
            session,
            patcher,
            options.text,
            editing ? undefined : options.paragraph
          );
    }
    if (options.silent) {
      if (findCollaborationBinding(db, contentId)) return 0;
    } else assertContentIsLocal(db, contentId);

    const row = db.prepare("SELECT content FROM contents WHERE id = ?").get(contentId) as
      | { content: string }
      | undefined;
    if (!row) return 0;
    const content = JSON.parse(row.content) as Descendant[];
    const stored = ContentDocumentTable.read(db, contentId);
    let patched = 0;
    let textChanged = false;
    const walk = (node: PatchNode, parent: Record<string, unknown>, index: number) => {
      const leaf = node as { text?: unknown };
      // 文本叶子也带 type（formatted），与会话路径一致：叶子只交给文本补丁
      if (typeof leaf.text === "string") {
        const next = options.text?.(leaf.text);
        if (next != null && next !== leaf.text) {
          leaf.text = next;
          textChanged = true;
          patched++;
        }
        return;
      }
      const patch = patcher(node as unknown as Record<string, unknown>, {
        get firstText() {
          return nodeText(node.children?.[0]);
        },
      });
      if (patch) {
        if (stored) {
          const data = node as unknown as ContentNode;
          const contractId = data[NODE_CONTRACT_PROPERTY];
          const contract =
            typeof contractId === "string" ? stored.contracts[contractId] : undefined;
          if (!contract) throw new Error("正文节点契约缺失");
          if (
            ["children", "collabId", "text", NODE_CONTRACT_PROPERTY, ...contract.textFields].some(
              key => Object.hasOwn(patch, key)
            ) ||
            (Object.hasOwn(patch, "type") && patch.type !== data.type)
          )
            throw new Error("节点身份、结构或文本字段不能通过属性补丁改写");
        }
        Object.assign(node, patch);
        patched++;
      }
      node.children?.forEach((child, childIndex) =>
        walk(child, node as unknown as Record<string, unknown>, childIndex)
      );
      if (node.type === "paragraph" && options.paragraph) {
        const changed = patchParagraph(node, options.paragraph(nodeText(node), parent, index));
        textChanged ||= changed > 0;
        patched += changed;
      }
    };
    content.forEach((node, index) => walk(node as PatchNode, {}, index));
    if (patched === 0) return 0;

    if (stored) {
      db.transaction(() => {
        const previous = db
          .prepare("SELECT update_time FROM contents WHERE id=?")
          .get(contentId) as { update_time: number };
        ContentDocumentTable.commit(
          db,
          contentId,
          { ...stored, content: content as ContentNode[] },
          { expectedRevision: stored.revision, count: getContentLength(content) }
        );
        if (options.silent || (options.canonical && !textChanged))
          db.prepare("UPDATE contents SET update_time=? WHERE id=?").run(
            previous.update_time,
            contentId
          );
        else Operation.insertOperation(db, "content", "update", contentId, Date.now());
      })();
      ctx.broadcastAll("content:updated", { databaseName: basename(db.name), contentId });
      if (!options.silent) emitContentWritten(db, contentId, "update");
      return patched;
    }

    if (options.silent || (options.canonical && !textChanged)) {
      db.prepare("UPDATE contents SET content = ? WHERE id = ?").run(
        JSON.stringify(content),
        contentId
      );
      ctx.broadcastAll("content:updated", { databaseName: basename(db.name), contentId });
      if (!options.silent) emitContentWritten(db, contentId, "update");
      return patched;
    }
    const now = Date.now();
    db.prepare("UPDATE contents SET update_time = ?, content = ?, count = ? WHERE id = ?").run(
      now,
      JSON.stringify(content),
      getContentLength(content),
      contentId
    );
    Operation.insertOperation(db, "content", "update", contentId, now);
    ctx.broadcastAll("content:updated", { databaseName: basename(db.name), contentId });
    emitContentWritten(db, contentId, "update");
    return patched;
  }

  static deleteContent(db: Database.Database, contentId: number): number {
    assertContentIsLocal(db, contentId);
    // 元信息与正文同生同灭：引用计数归零时在同一事务里一并删除
    return db.transaction(() => this.releaseContent(db, contentId))();
  }

  private static releaseContent(db: Database.Database, contentId: number): number {
    // 先减少引用计数
    const decrementStmt = db.prepare("UPDATE contents SET ref_count = ref_count - 1 WHERE id = ?");
    decrementStmt.run(contentId);

    // 查询当前引用计数
    const refCountStmt = db.prepare("SELECT ref_count FROM contents WHERE id = ?");
    const result = refCountStmt.get(contentId) as { ref_count: number } | undefined;

    // 如果引用计数为0，则删除
    if (result && result.ref_count <= 0) {
      return this.purgeContent(db, contentId);
    }

    return 0;
  }

  /** 真正删除正文并级联清理关联行（不检查引用计数），releaseContent 硬删与延迟回收共用 */
  private static purgeContent(db: Database.Database, contentId: number): number {
    const deleteStmt = db.prepare("DELETE FROM contents WHERE id = ?");
    db.prepare("DELETE FROM doc_task_settings WHERE content_id = ?").run(contentId);
    db.prepare("DELETE FROM content_pending_releases WHERE content_id = ?").run(contentId);
    Operation.insertOperation(db, "content", "delete", contentId, Date.now());
    // 删除嵌入的白板内容
    const content = this.getContentById(db, contentId);
    const stored = ContentDocumentTable.read(db, contentId);
    if (stored)
      ContentDocumentTable.commit(
        db,
        contentId,
        { ...stored, content: [] },
        { expectedRevision: stored.revision, count: 0 }
      );
    const whiteBoardContentId: number[] = [];
    dfs(stored ? [] : content?.content || [], node => {
      if (node.type === "whiteboard" && node.whiteBoardContentId) {
        whiteBoardContentId.push(node.whiteBoardContentId);
      }
    });
    whiteBoardContentId.forEach(id => {
      WhiteBoardContentTable.deleteWhiteboard(db, id);
    });

    ContentAiMetaTable.delete(db, contentId);
    ContentAiInsightsTable.delete(db, contentId);
    ContentLinkTable.releaseContent(db, contentId);
    ComposeBoardTable.releaseContent(db, contentId);
    const changes = deleteStmt.run(contentId).changes;
    emitContentWritten(db, contentId, "delete");
    return changes;
  }

  static incrementRefCount(db: Database.Database, contentId: number): void {
    const stmt = db.prepare("UPDATE contents SET ref_count = ref_count + 1 WHERE id = ?");
    stmt.run(contentId);
  }

  static decrementRefCount(db: Database.Database, contentId: number): void {
    const stmt = db.prepare(
      "UPDATE contents SET ref_count = ref_count - 1 WHERE id = ? AND ref_count > 0"
    );
    stmt.run(contentId);
  }

  /** 撤销登记并重新引用：宽限期内把正文从待回收救回（D-136） */
  static retain(db: Database.Database, contentId: number): void {
    db.prepare("UPDATE contents SET ref_count = ref_count + 1 WHERE id = ?").run(contentId);
    db.prepare("DELETE FROM content_pending_releases WHERE content_id = ?").run(contentId);
  }

  /** 延迟释放：引用减 1（不低于 0），归零只登记待回收不删正文；已登记则保留更早的 released_at */
  static releaseDeferred(db: Database.Database, contentId: number): void {
    db.prepare("UPDATE contents SET ref_count = ref_count - 1 WHERE id = ? AND ref_count > 0").run(
      contentId
    );
    const row = db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(contentId) as
      | { ref_count: number }
      | undefined;
    if (!row || row.ref_count > 0) return;
    db.prepare(
      "INSERT OR IGNORE INTO content_pending_releases (content_id, released_at) VALUES (?, ?)"
    ).run(contentId, Date.now());
  }

  /** 回收超过宽限期且引用仍为 0 的待回收正文，返回实际删除的正文数；单条失败只记日志不阻断 */
  static collectPendingReleases(
    db: Database.Database,
    options: { now: number; graceMs: number }
  ): number {
    const dueRows = db
      .prepare("SELECT content_id FROM content_pending_releases WHERE released_at <= ?")
      .all(options.now - options.graceMs) as Array<{ content_id: number }>;
    let purged = 0;
    for (const { content_id: contentId } of dueRows) {
      if (hasDurableEntityHold(db, "content", contentId)) continue;
      try {
        // better-sqlite3 事务可嵌套（自动降级为 savepoint），外层已有事务时也能安全调用
        purged += db.transaction(() => {
          const row = db.prepare("SELECT ref_count FROM contents WHERE id = ?").get(contentId) as
            | { ref_count: number }
            | undefined;
          if (!row || row.ref_count > 0) {
            db.prepare("DELETE FROM content_pending_releases WHERE content_id = ?").run(contentId);
            return 0;
          }
          return this.purgeContent(db, contentId);
        })();
      } catch (error) {
        console.error(`[content] 回收待释放正文失败: contentId=${contentId}`, error);
      }
    }
    return purged;
  }

  static searchContentByText(db: Database.Database, text: string, limit = 100): IContent[] {
    const stmt = db.prepare(
      `SELECT * FROM contents WHERE content LIKE ? ORDER BY update_time DESC LIMIT ?`
    );
    const contents = stmt.all(`%${text}%`, limit);
    return contents.map(content => this.parseContent(content));
  }

  static getTotalCount(db: Database.Database): number {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM contents");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  static getStatistics(db: Database.Database): {
    totalCount: number;
    totalCharacters: number;
  } {
    const countStmt = db.prepare("SELECT COUNT(*) as count FROM contents");
    const totalCountResult = countStmt.get() as { count: number };

    const charsStmt = db.prepare("SELECT SUM(count) as totalChars FROM contents");
    const totalCharsResult = charsStmt.get() as { totalChars: number };

    return {
      totalCount: totalCountResult.count || 0,
      totalCharacters: totalCharsResult.totalChars || 0,
    };
  }
}
