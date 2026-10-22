import Database from "better-sqlite3";
import { asynchronousDatabaseCommand } from "../database-command";
import { basename } from "node:path";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import type { Descendant } from "slate";
import { getMarkdownText } from "../../services/content-conversion";
import { resolvePluginContent, sharedContentId } from "./plugin-content-input";
import { readPageQuery, toPage } from "./plugin-data-page";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import type {
  PluginContentEdit,
  PluginContentRecord,
  PluginContentSource,
  PluginContentOwnerEntity,
  PluginCreatableEntity,
  PluginDataCreateInput,
  PluginDataEntity,
  PluginDataPage,
  PluginDataQuery,
  PluginDataRecord,
  PluginDataScope,
  PluginDocumentCreateInput,
  PluginDocumentMoveInput,
  PluginProjectNodeRecord,
  PluginOperationRecord,
} from "@/types/plugin-data";
import { contentTitle, contentTitles } from "./content-ai-meta";
import EntitySearchTable from "./entity-search";
import PluginEntityTable from "./plugin-entity";
import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import { EProjectItemType } from "@/types/project";
import WhiteboardsTable from "./whiteboard";
import WhiteBoardContentTable, { emptyWhiteboardPage } from "./white-board-content";
import ContentTable from "./content";
import Operation from "./operation";
import { emitContentWritten } from "../content-events";
import { setCanonicalContentTitle } from "../collaboration/content-sessions";
import { markContentOrigin, writeAsPlugin } from "../domain-event-origin";
import { PLUGIN_OPERATION_RETENTION_MS, insertPluginOperation } from "./plugin-operations";

/** 项目目录最多展开的节点数；IN 列表每批的条目数 */
const MAX_TREE_NODES = 5000;
const LOCATE_BATCH = 500;
const CARD_TITLE_LENGTH = 30;
/** 主进程抛出、渲染端适配层转换为 PluginConflictError 的错误前缀 */
export const CONFLICT_PREFIX = "PLUGIN_CONFLICT:";

const ENTITY_TABLES: Record<PluginDataEntity, string> = {
  card: "cards",
  article: "articles",
  document: "project_item",
  whiteboard: "white_boards",
  project: "project",
};

const ENTITY_LABELS: Record<PluginDataEntity, string> = {
  card: "卡片",
  article: "文章",
  document: "项目文档",
  whiteboard: "白板",
  project: "项目",
};

const jsonLength = (column: string) =>
  `json_array_length(CASE WHEN json_valid(${column}) THEN ${column} ELSE '[]' END)`;

/** 各实体统一投影成 id / created / updated / tags / pinned / title / 正文身份 */
const BASE_SQL: Record<PluginDataEntity, string> = {
  card: `SELECT c.id, c.create_time AS created, c.update_time AS revision,
      MAX(c.update_time, IFNULL(ct.update_time, 0)) AS updated,
      c.tags, c.is_top AS pinned, '' AS title, c.content_id AS content_id,
      ct.create_time AS content_created, IFNULL(ct.count, 0) AS word_count,
      NULL AS kind, NULL AS projects
    FROM cards c LEFT JOIN contents ct ON ct.id = c.content_id`,
  article: `SELECT a.id, a.create_time AS created, a.update_time AS revision,
      MAX(a.update_time, IFNULL(ct.update_time, 0)) AS updated,
      a.tags, a.is_top AS pinned, a.title, a.content_id AS content_id,
      ct.create_time AS content_created, IFNULL(ct.count, 0) AS word_count,
      NULL AS kind, NULL AS projects
    FROM articles a LEFT JOIN contents ct ON ct.id = a.content_id
    WHERE a.is_delete = 0`,
  // 引用型条目只是指向卡片 / 文章的入口，正文归被引用的实体
  document: `SELECT p.id, p.create_time AS created, p.update_time AS revision,
      MAX(p.update_time, IFNULL(ct.update_time, 0)) AS updated,
      p.tags, 0 AS pinned, p.title, p.content_id AS content_id,
      ct.create_time AS content_created, IFNULL(ct.count, 0) AS word_count,
      p.project_item_type AS kind, p.projects
    FROM project_item p LEFT JOIN contents ct ON ct.id = p.content_id
    WHERE p.ref_type IS NULL OR p.ref_type = ''`,
  // 白板与项目没有正文：画板内容不开放，项目文档另见 document
  whiteboard: `SELECT w.id, w.create_time AS created, w.update_time AS revision,
      w.update_time AS updated, w.tags, 0 AS pinned, w.title, NULL AS content_id,
      NULL AS content_created, 0 AS word_count, NULL AS kind, NULL AS projects,
      w.description, ${jsonLength("w.white_board_content_ids")} AS item_count, 0 AS archived
    FROM white_boards w`,
  project: `SELECT p.id, p.create_time AS created, p.update_time AS revision,
      p.update_time AS updated, '[]' AS tags, p.pinned, p.title, NULL AS content_id,
      NULL AS content_created, 0 AS word_count, NULL AS kind, NULL AS projects,
      '' AS description, ${jsonLength("p.children")} AS item_count, p.archived
    FROM project p`,
};

interface Row {
  id: number;
  revision: number;
  created: number;
  updated: number;
  tags: string | null;
  pinned: number;
  title: string;
  content_id: number | null;
  content_created: number | null;
  word_count: number;
  kind: string | null;
  projects: string | null;
  /** 白板与项目：说明、页数 / 根文档数、是否归档 */
  description?: string | null;
  item_count?: number;
  archived?: number;
}

const ENTITIES = new Set<PluginDataEntity>(Object.keys(ENTITY_TABLES) as PluginDataEntity[]);

/** 项目文档删除前的一处挂载：项目根目录（parentId 为 null）或父文档下的序号 */
interface DocumentPlacement {
  projectId: number | null;
  parentId: number | null;
  index: number;
}

function parseList(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 插件业务数据只读查询；身份与库绑定由渲染端适配层负责，权限在渲染端宿主校验。 */
export default class PluginDataTable {
  static getListenEvents() {
    return {
      "plugin-data:query": this.query.bind(this),
      "plugin-data:get": this.get.bind(this),
      "plugin-data:content": asynchronousDatabaseCommand(this.content.bind(this)),
      "plugin-data:resolve-content": asynchronousDatabaseCommand(this.resolveContent.bind(this)),
      "plugin-data:shared-content": this.sharedContent.bind(this),
      "plugin-data:create": asynchronousDatabaseCommand(this.create.bind(this)),
      "plugin-data:project-tree": this.projectTree.bind(this),
      "plugin-data:create-document": asynchronousDatabaseCommand(this.createDocument.bind(this)),
      "plugin-data:move-document": this.moveDocument.bind(this),
      "plugin-data:update": this.update.bind(this),
      "plugin-data:delete": this.remove.bind(this),
      "plugin-data:edit-content": asynchronousDatabaseCommand(this.editContent.bind(this)),
      "plugin-data:operations": this.operations.bind(this),
      "plugin-data:record-operation": this.recordOperation.bind(this),
      "plugin-data:restore": this.restore.bind(this),
      "plugin-data:mark-restored": this.markRestored.bind(this),
    };
  }

  private static assertDatabase(db: Database.Database, scope: PluginDataScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  private static assertEntity(entity: unknown): asserts entity is PluginDataEntity {
    if (!ENTITIES.has(entity as PluginDataEntity)) throw new Error("未知的数据类型");
  }

  static query(
    db: Database.Database,
    request: PluginDataScope & { entity: PluginDataEntity; query: PluginDataQuery }
  ): PluginDataPage {
    this.assertDatabase(db, request);
    this.assertEntity(request.entity);
    const query = request.query;
    const { sort, limit, where, params } = readPageQuery(query, { column: "id", numeric: true });
    if (query.tag !== undefined) {
      if (typeof query.tag !== "string" || !query.tag.trim()) throw new Error("标签无效");
      // 层级标签：筛「读书」同时命中「读书/小说」
      where.push(
        `EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(tags) THEN tags ELSE '[]' END)
          WHERE value = ? OR substr(value, 1, length(?) + 1) = ? || '/')`
      );
      params.push(query.tag, query.tag, query.tag);
    }
    const rows = db
      .prepare(
        `SELECT * FROM (${BASE_SQL[request.entity]})
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY ${sort} DESC, id DESC LIMIT ?`
      )
      .all(...params, limit + 1) as Row[];
    const page = toPage(rows, limit, sort, row => row.id);
    return {
      items: this.records(db, request.entity, page.rows),
      ...(page.cursor ? { cursor: page.cursor } : {}),
    };
  }

  static get(
    db: Database.Database,
    request: PluginDataScope & { entity: PluginDataEntity; id: number }
  ): PluginDataRecord | null {
    this.assertDatabase(db, request);
    this.assertEntity(request.entity);
    if (!Number.isSafeInteger(request.id) || request.id <= 0) return null;
    const row = db
      .prepare(`SELECT * FROM (${BASE_SQL[request.entity]}) WHERE id = ?`)
      .get(request.id) as Row | undefined;
    return row ? this.records(db, request.entity, [row])[0] : null;
  }

  static async content(
    db: Database.Database,
    request: PluginDataScope & {
      contentId: number;
      createdAt: number;
      format: "markdown" | "nodes";
    }
  ): Promise<PluginContentRecord | null> {
    this.assertDatabase(db, request);
    const row = db
      .prepare(
        "SELECT id, create_time, update_time, content, count FROM contents WHERE id = ? AND create_time = ?"
      )
      .get(request.contentId, request.createdAt) as
      | { id: number; create_time: number; update_time: number; content: string; count: number }
      | undefined;
    if (!row) return null;
    const nodes = parseList(row.content);
    const owners = new Set<PluginContentOwnerEntity>();
    for (const ref of EntitySearchTable.locateAll(db, [row.id]).get(row.id) ?? []) {
      if (ref.kind === "card" || ref.kind === "article") owners.add(ref.kind);
      else if (ref.kind === "project-item") owners.add("document");
    }
    return {
      contentId: row.id,
      createdAt: row.create_time,
      updatedAt: row.update_time,
      revision: this.contentRevision(db, row.id),
      wordCount: row.count || 0,
      ...(request.format === "nodes"
        ? { nodes }
        : { markdown: await getMarkdownText(nodes as Descendant[]) }),
      owners: [...owners],
      pluginOwners: PluginEntityTable.pluginOwners(db, row.id),
    };
  }

  /**
   * 把插件的正文输入解析为节点，供宿主界面（如新建卡片窗口）预填；结果只交给宿主渲染端，不经插件。
   * copyOf 与写入时同一范围；结果为空时返回空数组，由界面决定默认内容。
   */
  static async resolveContent(
    db: Database.Database,
    request: PluginDataScope & { content: PluginContentSource }
  ): Promise<Descendant[]> {
    this.assertDatabase(db, request);
    return resolvePluginContent(db, request.content, []);
  }

  /** 「插入到项目」的 shareOf：核对来源是本插件内容的正文，返回正文 ID 交给宿主弹窗 */
  static sharedContent(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      source: { contentId: number; createdAt: number };
    }
  ): number {
    this.assertDatabase(db, request);
    return sharedContentId(db, request.pluginId, request.source);
  }

  /** 有协作会话时为会话文档的版本，否则为正文的修改时间 */
  private static contentRevision(db: Database.Database, contentId: number): string {
    const content = ContentTable.getContentById(db, contentId);
    if (!content) throw new Error("正文不存在");
    return content.revision ?? `u:${content.updateTime}`;
  }

  private static assertRevision(
    db: Database.Database,
    entity: PluginDataEntity,
    id: number,
    expectedRevision: string
  ) {
    const row = db
      .prepare(`SELECT update_time FROM ${ENTITY_TABLES[entity]} WHERE id = ?`)
      .get(id) as { update_time: number } | undefined;
    if (!row || (entity === "article" && this.articleDeleted(db, id)))
      throw new Error(`${ENTITY_LABELS[entity]}不存在`);
    if (String(row.update_time) !== expectedRevision)
      throw new Error(`${CONFLICT_PREFIX}数据已被修改，请重新读取后再试`);
  }

  private static articleDeleted(db: Database.Database, id: number) {
    const row = db.prepare("SELECT is_delete FROM articles WHERE id = ?").get(id) as
      { is_delete: number } | undefined;
    return !row || Boolean(row.is_delete);
  }

  /** 插件写入与用户在其他窗口的操作一样，经已有广播让所有窗口（含发起窗口）刷新 */
  private static broadcastAll(ctx: CommandContext): CommandContext {
    return { ...ctx, broadcastOthers: ctx.broadcastAll };
  }

  static async create(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      entity: PluginCreatableEntity;
      input: PluginDataCreateInput;
    },
    ctx: CommandContext = fallbackCommandContext
  ): Promise<PluginDataRecord> {
    this.assertDatabase(db, request);
    const { input } = request;
    if (request.entity === "whiteboard" || request.entity === "project")
      return this.createObject(db, { ...request, entity: request.entity });
    if (input.content && "shareOf" in input.content)
      return this.createShared(
        db,
        { ...request, entity: request.entity },
        input.content.shareOf,
        ctx
      );
    const content = await resolvePluginContent(db, input.content, DEFAULT_CARD_CONTENT);
    this.assertDatabase(db, request);
    if (!db.open) throw new Error("数据库连接已失效");
    const id = db.transaction(() =>
      writeAsPlugin(request.pluginId, () => {
        if (request.entity === "card")
          return CardTable.createCard(db, {
            content,
            tags: input.tags ?? [],
            isTop: Boolean(input.pinned),
          } as Parameters<typeof CardTable.createCard>[1]).id;
        if (request.entity === "article")
          return ArticleTable.createArticle(db, {
            title: input.title ?? "",
            author: "",
            tags: input.tags ?? [],
            links: [],
            content,
            bannerBg: "",
            bannerPosition: "center",
            isTop: false,
            isDelete: false,
            count: 0,
          }).id;
        throw new Error("不支持新建该类型");
      })
    )();
    const channel = request.entity === "card" ? "card:updated" : "article:updated";
    ctx.broadcastAll(channel, {
      databaseName: basename(db.name),
      [request.entity === "card" ? "cardId" : "articleId"]: id,
    });
    return this.get(db, { ...request, entity: request.entity, id }) as PluginDataRecord;
  }

  /**
   * 与本插件内容共用正文的卡片或文章：引用同一份正文并增加引用计数，任一处删除不影响另一处。
   * 一份正文只对应一张卡片、一篇未删除的文章，已有时拒绝，不返回已有的那一项。
   */
  private static createShared(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      entity: "card" | "article";
      input: PluginDataCreateInput;
    },
    source: { contentId: number; createdAt: number },
    ctx: CommandContext
  ): PluginDataRecord {
    const { input } = request;
    const id = db.transaction(() =>
      writeAsPlugin(request.pluginId, () => {
        const contentId = sharedContentId(db, request.pluginId, source);
        if (request.entity === "card") {
          if (db.prepare("SELECT 1 FROM cards WHERE content_id = ?").get(contentId))
            throw new Error("这份正文已经是卡片");
          return CardTable.buildCardFromContent(db, contentId, {
            tags: input.tags ?? [],
            isTop: Boolean(input.pinned),
          }).id;
        }
        if (
          db.prepare("SELECT 1 FROM articles WHERE content_id = ? AND is_delete = 0").get(contentId)
        )
          throw new Error("这份正文已经是文章");
        return ArticleTable.buildArticleFromContent(
          db,
          contentId,
          input.title ?? "",
          input.tags ?? []
        ).id;
      })
    )();
    const channel = request.entity === "card" ? "card:updated" : "article:updated";
    ctx.broadcastAll(channel, {
      databaseName: basename(db.name),
      [request.entity === "card" ? "cardId" : "articleId"]: id,
    });
    return this.get(db, { ...request, id }) as PluginDataRecord;
  }

  /** 白板带一张空白画板页，项目为空项目；两者都没有写入广播，列表在渲染端按查询失效刷新 */
  private static createObject(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      entity: "whiteboard" | "project";
      input: PluginDataCreateInput;
    }
  ): PluginDataRecord {
    const title = request.input.title ?? "";
    const id = db.transaction(() =>
      writeAsPlugin(request.pluginId, () =>
        request.entity === "whiteboard"
          ? WhiteboardsTable.createWhiteboard(db, {
              title,
              description: request.input.description ?? "",
              tags: request.input.tags ?? [],
              snapshot: "",
              whiteBoardContentList: [emptyWhiteboardPage(title || "未命名")],
            }).id
          : ProjectTable.createProject(db, {
              title,
              desc: [],
              children: [],
              archived: false,
              pinned: false,
            }).id
      )
    )();
    return this.get(db, { ...request, id }) as PluginDataRecord;
  }

  /**
   * 项目目录：从项目根逐层展开。同一文档挂在多处时在多处列出；沿路径去重防止环，
   * 节点总数有上限，避免多处挂载在大项目里成倍展开。
   */
  static projectTree(
    db: Database.Database,
    request: PluginDataScope & { projectId: number }
  ): PluginProjectNodeRecord[] | null {
    this.assertDatabase(db, request);
    const project = ProjectTable.getProjectOrNull(db, request.projectId);
    if (!project) return null;
    type ItemRow = {
      id: number;
      title: string;
      update_time: number;
      project_item_type: string | null;
      ref_type: string | null;
      ref_id: number | null;
      children: string | null;
    };
    const rows = new Map<number, ItemRow>();
    const pending = [...new Set(project.children)];
    while (pending.length) {
      const batch = pending.splice(0, LOCATE_BATCH).filter(id => !rows.has(id));
      if (!batch.length) continue;
      const found = db
        .prepare(
          `SELECT id, title, update_time, project_item_type, ref_type, ref_id, children
           FROM project_item WHERE id IN (${batch.map(() => "?").join(",")})`
        )
        .all(...batch) as ItemRow[];
      for (const row of found) {
        rows.set(row.id, row);
        for (const child of parseList(row.children))
          if (Number.isSafeInteger(child) && !rows.has(child as number))
            pending.push(child as number);
      }
    }
    let budget = MAX_TREE_NODES;
    const build = (ids: number[], path: Set<number>): PluginProjectNodeRecord[] =>
      ids.flatMap(id => {
        const row = rows.get(id);
        if (!row || path.has(id) || budget <= 0) return [];
        budget--;
        const refKind = row.ref_type === "card" || row.ref_type === "article" ? row.ref_type : null;
        const ref: PluginProjectNodeRecord["ref"] =
          refKind && row.ref_id ? { kind: refKind, id: row.ref_id } : undefined;
        const children = parseList(row.children).filter((child): child is number =>
          Number.isSafeInteger(child)
        );
        return [
          {
            id: row.id,
            revision: String(row.update_time),
            title: row.title,
            kind: row.project_item_type || "document",
            ...(ref ? { ref } : {}),
            children: build(children, new Set(path).add(id)),
          },
        ];
      });
    return build(project.children, new Set());
  }

  /** 父文档须已在该项目中；正文缺省为空段落 */
  static async createDocument(
    db: Database.Database,
    request: PluginDataScope & { pluginId: string; input: PluginDocumentCreateInput }
  ): Promise<PluginDataRecord> {
    this.assertDatabase(db, request);
    const { input } = request;
    const shared = input.content && "shareOf" in input.content ? input.content.shareOf : null;
    const content = shared
      ? []
      : await resolvePluginContent(db, input.content, DEFAULT_CARD_CONTENT);
    this.assertDatabase(db, request);
    if (!db.open) throw new Error("数据库连接已失效");
    const id = db.transaction(() =>
      writeAsPlugin(request.pluginId, () => {
        if (!ProjectTable.getProjectOrNull(db, input.projectId)) throw new Error("项目不存在");
        const item = {
          title: input.title,
          content,
          // 共用正文：项目文档引用同一份正文（建文档时增加引用计数）
          ...(shared ? { contentId: sharedContentId(db, request.pluginId, shared) } : {}),
          children: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
          tags: input.tags ?? [],
        };
        if (input.parentId === undefined)
          return ProjectTable.addRootProjectItem(db, input.projectId, item)[1]?.id;
        this.assertInProject(db, input.parentId, input.projectId);
        return ProjectTable.addChildProjectItem(db, input.parentId, item)?.[1]?.id;
      })
    )();
    if (!id) throw new Error("新建项目文档失败");
    return this.get(db, { ...request, entity: "document", id }) as PluginDataRecord;
  }

  /**
   * 在同一项目内移动文档的一处：from 下的那一处移到 to 的第 index 位（移动后的序号）。
   * 复用项目页拖拽的移动与校验（不能移到自己或子文档下、目标不能已含这篇文档）。
   */
  static moveDocument(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      id: number;
      move: PluginDocumentMoveInput;
      expectedRevision: string;
    }
  ): { revision: string } {
    this.assertDatabase(db, request);
    this.assertRevision(db, "document", request.id, request.expectedRevision);
    const { projectId, from, to, index } = request.move;
    const project = ProjectTable.getProjectOrNull(db, projectId);
    if (!project) throw new Error("项目不存在");
    const childrenOf = (parentId: number | null) =>
      parentId === null ? project.children : this.assertInProject(db, parentId, projectId).children;
    const source = childrenOf(from);
    if (!source.includes(request.id)) throw new Error("文档不在 from 指定的位置");
    const target = childrenOf(to);
    const same = from === to;
    const last = same ? target.length - 1 : target.length;
    const position = Math.min(index ?? last, last);
    const previous = target.indexOf(request.id);
    const moved = writeAsPlugin(request.pluginId, () =>
      ProjectTable.moveProjectTreeItem(db, projectId, {
        dragItem: {
          itemId: request.id,
          parentId: from ?? 0,
          isRoot: from === null,
          parentChildren: source,
        },
        dropTargetId: 0,
        dropTargetParentId: 0,
        dropTargetIsRoot: to === null,
        dragPosition: "inside",
        insertParentId: to ?? 0,
        insertParentIsRoot: to === null,
        // 宿主按「拖动前的列表」计算插入位置，同一父节点内向后移动时要多算原来那一格
        insertIndex: same && previous >= 0 && previous < position ? position + 1 : position,
      })
    );
    if (!moved) throw new Error("不能移动到这个位置");
    const row = db.prepare("SELECT update_time FROM project_item WHERE id = ?").get(request.id) as {
      update_time: number;
    };
    return { revision: String(row.update_time) };
  }

  private static assertInProject(db: Database.Database, itemId: number, projectId: number) {
    const item = ProjectTable.getProjectItem(db, itemId);
    if (!item || !item.projects.includes(projectId)) throw new Error("父文档不在该项目中");
    return item;
  }

  static update(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      entity: PluginDataEntity;
      id: number;
      patch: {
        tags?: string[];
        pinned?: boolean;
        title?: string;
        description?: string;
        archived?: boolean;
      };
      expectedRevision: string;
    },
    ctx: CommandContext = fallbackCommandContext
  ): PluginDataRecord {
    this.assertDatabase(db, request);
    this.assertEntity(request.entity);
    this.assertRevision(db, request.entity, request.id, request.expectedRevision);
    const { patch } = request;
    const all = this.broadcastAll(ctx);
    writeAsPlugin(request.pluginId, () => {
      if (request.entity === "card") {
        const card = CardTable.getCardById(db, request.id);
        if (!card) throw new Error("卡片不存在");
        CardTable.updateCard(
          db,
          { ...card, tags: patch.tags ?? card.tags, isTop: patch.pinned ?? card.isTop },
          all
        );
      } else if (request.entity === "article") {
        const article = ArticleTable.getArticleById(db, request.id);
        if (patch.title !== undefined) setCanonicalContentTitle(db, article.contentId, patch.title);
        ArticleTable.updateArticle(
          db,
          {
            ...article,
            title: patch.title ?? article.title,
            tags: patch.tags ?? article.tags,
            isTop: patch.pinned ?? article.isTop,
          },
          all
        );
      } else if (request.entity === "whiteboard") {
        WhiteboardsTable.updateWhiteboardMeta(db, request.id, {
          title: patch.title,
          description: patch.description,
          tags: patch.tags,
        });
      } else if (request.entity === "project") {
        const project = ProjectTable.getProject(db, request.id);
        ProjectTable.updateProject(db, {
          ...project,
          title: patch.title ?? project.title,
          archived: patch.archived ?? project.archived,
          pinned: patch.pinned ?? project.pinned,
        });
      } else {
        const item = ProjectTable.getProjectItem(db, request.id);
        if (!item) throw new Error("项目文档不存在");
        ProjectTable.updateProjectItem(
          db,
          { ...item, title: patch.title ?? item.title, tags: patch.tags ?? item.tags },
          all
        );
      }
    });
    return this.get(db, request) as PluginDataRecord;
  }

  /** 删除前保存行快照，正文延迟释放；7 天内可由用户在插件详情页恢复 */
  static remove(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      entity: PluginDataEntity;
      id: number;
      expectedRevision: string;
    }
  ): void {
    this.assertDatabase(db, request);
    this.assertEntity(request.entity);
    this.assertRevision(db, request.entity, request.id, request.expectedRevision);
    if (request.entity === "whiteboard" || request.entity === "project")
      return this.removeObject(db, { ...request, entity: request.entity });
    if (request.entity === "document") return this.removeDocument(db, request);
    const table = ENTITY_TABLES[request.entity];
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(request.id) as Record<
      string,
      unknown
    >;
    const contentId = Number(row.content_id) || null;
    const contentCreatedAt = contentId
      ? ((
          db.prepare("SELECT create_time FROM contents WHERE id = ?").get(contentId) as
            { create_time: number } | undefined
        )?.create_time ?? null)
      : null;
    const title =
      request.entity === "card"
        ? contentId
          ? contentTitle(db, contentId, CARD_TITLE_LENGTH)
          : ""
        : String(row.title ?? "");
    writeAsPlugin(request.pluginId, () => {
      if (request.entity === "card") CardTable.deleteCard(db, request.id, { deferContent: true });
      else ArticleTable.deleteArticleById(db, request.id, { deferContent: true });
    });
    insertPluginOperation(db, {
      pluginId: request.pluginId,
      entity: request.entity,
      entityId: String(request.id),
      title,
      payload: { row, contentCreatedAt },
    });
  }

  /** 白板的画板页进入待回收登记；项目只能删除空项目，避免连带删掉整棵目录 */
  private static removeObject(
    db: Database.Database,
    request: PluginDataScope & { pluginId: string; entity: "whiteboard" | "project"; id: number }
  ): void {
    const table = ENTITY_TABLES[request.entity];
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(request.id) as Record<
      string,
      unknown
    >;
    if (request.entity === "project" && parseList(row.children as string).length)
      throw new Error("项目里还有文档，不能删除");
    writeAsPlugin(request.pluginId, () => {
      if (request.entity === "whiteboard") WhiteboardsTable.deleteWhiteboard(db, request.id);
      else ProjectTable.deleteProject(db, request.id);
    });
    insertPluginOperation(db, {
      pluginId: request.pluginId,
      entity: request.entity,
      entityId: String(request.id),
      title: String(row.title ?? ""),
      payload: { row },
    });
  }

  /**
   * 从所有挂载处删除一篇项目文档：记下它在各父文档与项目根目录中的位置以便恢复，正文延迟释放。
   * 有子文档时拒绝；视频笔记会连带删除笔记数据，无法恢复，不由插件删除。
   */
  private static removeDocument(
    db: Database.Database,
    request: PluginDataScope & { pluginId: string; id: number }
  ): void {
    const item = ProjectTable.getProjectItem(db, request.id);
    if (!item) throw new Error("项目文档不存在");
    if (item.children.length) throw new Error("有子文档时不能删除");
    if (item.projectItemType === EProjectItemType.VideoNote)
      throw new Error("视频笔记不能由插件删除");
    const row = db.prepare("SELECT * FROM project_item WHERE id = ?").get(request.id) as Record<
      string,
      unknown
    >;
    const placements: DocumentPlacement[] = [];
    writeAsPlugin(request.pluginId, () => {
      for (const projectId of item.projects) {
        const project = ProjectTable.getProjectOrNull(db, projectId);
        const index = project?.children.indexOf(request.id) ?? -1;
        if (!project || index < 0) continue;
        placements.push({ projectId, parentId: null, index });
        project.children.splice(index, 1);
        ProjectTable.updateProject(db, project);
      }
      for (const parentId of item.parents) {
        const parent = ProjectTable.getProjectItem(db, parentId);
        const index = parent?.children.indexOf(request.id) ?? -1;
        if (!parent || index < 0) continue;
        placements.push({ projectId: null, parentId, index });
        parent.children.splice(index, 1);
        ProjectTable.updateProjectItem(db, parent);
      }
      ProjectTable.deleteProjectItem(db, request.id, { deferContent: true });
    });
    const contentId = Number(row.content_id) || null;
    insertPluginOperation(db, {
      pluginId: request.pluginId,
      entity: "document",
      entityId: String(request.id),
      title: item.title,
      payload: { row, contentCreatedAt: this.contentCreatedAt(db, contentId), placements },
    });
  }

  private static contentCreatedAt(db: Database.Database, contentId: number | null) {
    if (!contentId) return null;
    return (
      (
        db.prepare("SELECT create_time FROM contents WHERE id = ?").get(contentId) as
          { create_time: number } | undefined
      )?.create_time ?? null
    );
  }

  static async editContent(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      contentId: number;
      createdAt: number;
      edit: PluginContentEdit;
      expectedRevision: string;
    },
    ctx: CommandContext = fallbackCommandContext
  ): Promise<{ revision: string }> {
    this.assertDatabase(db, request);
    const exists = db
      .prepare("SELECT 1 FROM contents WHERE id = ? AND create_time = ?")
      .get(request.contentId, request.createdAt);
    const current = exists ? ContentTable.getContentById(db, request.contentId) : null;
    if (!current) throw new Error("正文不存在");
    const revision = current.revision ?? `u:${current.updateTime}`;
    if (revision !== request.expectedRevision)
      throw new Error(`${CONFLICT_PREFIX}正文已被修改，请重新读取后再试`);
    const content = await this.applyEdit(db, current.content, request.edit);
    this.assertDatabase(db, request);
    if (!db.open) throw new Error("数据库连接已失效");
    if (
      !db
        .prepare("SELECT 1 FROM contents WHERE id = ? AND create_time = ?")
        .get(request.contentId, request.createdAt) ||
      this.contentRevision(db, request.contentId) !== revision
    )
      throw new Error(`${CONFLICT_PREFIX}转换期间正文已变化，请重新读取后再试`);
    db.transaction(() =>
      writeAsPlugin(request.pluginId, () =>
        ContentTable.updateContent(
          db,
          request.contentId,
          { content, expectedRevision: current.revision },
          ctx
        )
      )
    )();
    markContentOrigin(basename(db.name), request.contentId, request.pluginId);
    return { revision: this.contentRevision(db, request.contentId) };
  }

  private static async applyEdit(
    db: Database.Database,
    current: Descendant[],
    edit: PluginContentEdit
  ): Promise<Descendant[]> {
    switch (edit.op) {
      // 追加只解析新内容，原有节点原样保留
      case "append":
        return [...current, ...(await resolvePluginContent(db, edit.content, []))];
      case "prepend":
        return [...(await resolvePluginContent(db, edit.content, [])), ...current];
      case "replaceAll":
        return resolvePluginContent(db, edit.content, DEFAULT_CARD_CONTENT);
      case "replaceText": {
        const markdown = await getMarkdownText(current);
        const first = markdown.indexOf(edit.find);
        if (first < 0) throw new Error("没有找到要替换的文字");
        if (markdown.indexOf(edit.find, first + 1) >= 0)
          throw new Error("要替换的文字出现了多次，请提供更长的上下文");
        const replaced =
          markdown.slice(0, first) + edit.markdown + markdown.slice(first + edit.find.length);
        return resolvePluginContent(db, { markdown: replaced }, DEFAULT_CARD_CONTENT);
      }
      default:
        throw new Error("未知的正文修改");
    }
  }

  /** 待办与日程的删除由助理操作执行，渲染端在成功后登记撤销凭据 */
  static recordOperation(
    db: Database.Database,
    request: PluginDataScope & {
      pluginId: string;
      entity: "todo" | "event";
      entityId: string;
      title: string;
      operationId: string;
    }
  ) {
    this.assertDatabase(db, request);
    if (request.entity !== "todo" && request.entity !== "event") throw new Error("类型无效");
    insertPluginOperation(db, { ...request, payload: { operationId: request.operationId } });
  }

  static operations(
    db: Database.Database,
    request: PluginDataScope & { pluginId: string }
  ): PluginOperationRecord[] {
    this.assertDatabase(db, request);
    const since = Date.now() - PLUGIN_OPERATION_RETENTION_MS;
    const rows = db
      .prepare(
        `SELECT id, action, entity, entity_id, title, payload, create_time, restored_time
         FROM plugin_operations WHERE plugin_id = ? AND create_time >= ?
         ORDER BY create_time DESC, id DESC LIMIT 100`
      )
      .all(request.pluginId, since) as Array<{
      id: number;
      action: "delete";
      entity: PluginOperationRecord["entity"];
      entity_id: string;
      title: string;
      payload: string;
      create_time: number;
      restored_time: number | null;
    }>;
    return rows.map(row => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      title: row.title,
      createdAt: row.create_time,
      restoredAt: row.restored_time,
      ...(row.entity === "todo" || row.entity === "event"
        ? { operationId: (JSON.parse(row.payload) as { operationId: string }).operationId }
        : {}),
      ...(row.entity === "plugin-entity"
        ? { kind: String((JSON.parse(row.payload) as { row: { kind?: unknown } }).row.kind ?? "") }
        : {}),
    }));
  }

  private static claimOperation(db: Database.Database, id: number) {
    const row = db
      .prepare(
        "SELECT entity, payload, create_time, restored_time FROM plugin_operations WHERE id = ?"
      )
      .get(id) as
      | { entity: string; payload: string; create_time: number; restored_time: number | null }
      | undefined;
    if (!row) throw new Error("操作记录不存在");
    if (row.restored_time) throw new Error("已经恢复过了");
    if (row.create_time < Date.now() - PLUGIN_OPERATION_RETENTION_MS)
      throw new Error("已超过 7 天，无法恢复");
    return row;
  }

  static markRestored(db: Database.Database, request: PluginDataScope & { id: number }) {
    this.assertDatabase(db, request);
    this.claimOperation(db, request.id);
    db.prepare("UPDATE plugin_operations SET restored_time = ? WHERE id = ?").run(
      Date.now(),
      request.id
    );
  }

  /** 恢复插件删除的卡片、文章或插件内容：原 ID 未被占用时沿用，正文重新引用；返回恢复后的 ID */
  static restore(
    db: Database.Database,
    request: PluginDataScope & { id: number },
    ctx: CommandContext = fallbackCommandContext
  ): { entity: PluginDataEntity | "plugin-entity"; id: number } {
    this.assertDatabase(db, request);
    const operation = this.claimOperation(db, request.id);
    if (operation.entity === "plugin-entity") {
      const id = PluginEntityTable.restoreDeleted(db, JSON.parse(operation.payload));
      db.prepare("UPDATE plugin_operations SET restored_time = ? WHERE id = ?").run(
        Date.now(),
        request.id
      );
      return { entity: "plugin-entity", id };
    }
    if (!ENTITIES.has(operation.entity as PluginDataEntity))
      throw new Error("该操作需要通过待办撤销恢复");
    const entity = operation.entity as PluginDataEntity;
    const payload = JSON.parse(operation.payload) as {
      row: Record<string, unknown>;
      contentCreatedAt?: number | null;
      placements?: DocumentPlacement[];
    };
    const id =
      entity === "whiteboard"
        ? this.restoreWhiteboard(db, payload.row)
        : entity === "project"
          ? this.reinsertRow(db, "project", payload.row)
          : entity === "document"
            ? this.restoreDocument(
                db,
                payload.row,
                payload.contentCreatedAt ?? null,
                payload.placements ?? []
              )
            : this.restoreContentEntity(db, entity, payload.row, payload.contentCreatedAt ?? null);
    db.prepare("UPDATE plugin_operations SET restored_time = ? WHERE id = ?").run(
      Date.now(),
      request.id
    );
    // 让全文、引用、文档待办等派生索引重新收录这份正文
    const contentId = Number(payload.row.content_id) || null;
    if (contentId) emitContentWritten(db, contentId, "update");
    if (entity === "card" || entity === "article")
      ctx.broadcastAll(entity === "card" ? "card:updated" : "article:updated", {
        databaseName: basename(db.name),
        [entity === "card" ? "cardId" : "articleId"]: id,
      });
    return { entity, id };
  }

  /** 正文须仍在（未过宽限期被回收、编号未被复用），恢复时重新持有 */
  private static retainContent(
    db: Database.Database,
    contentId: number | null,
    contentCreatedAt: number | null
  ) {
    if (!contentId) return;
    if (this.contentCreatedAt(db, contentId) !== contentCreatedAt)
      throw new Error("正文已被清理，无法恢复");
    ContentTable.retain(db, contentId);
  }

  /** 按快照插回一行：只取表中仍有的列；原 ID 已被占用时由数据库分配新 ID */
  private static reinsertRow(db: Database.Database, table: string, row: Record<string, unknown>) {
    const columns = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        column => column.name
      )
    );
    const values = Object.fromEntries(
      Object.entries(row).filter(([key]) => columns.has(key))
    ) as Record<string, unknown>;
    if (db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(values.id)) delete values.id;
    const keys = Object.keys(values);
    return Number(
      db
        .prepare(
          `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`
        )
        .run(...keys.map(key => values[key] as never)).lastInsertRowid
    );
  }

  private static restoreContentEntity(
    db: Database.Database,
    entity: PluginDataEntity,
    row: Record<string, unknown>,
    contentCreatedAt: number | null
  ) {
    this.retainContent(db, Number(row.content_id) || null, contentCreatedAt);
    const id = this.reinsertRow(db, ENTITY_TABLES[entity], row);
    Operation.insertOperation(db, entity, "insert", id, Date.now());
    return id;
  }

  /** 画板页须仍在宽限期内；恢复后重新持有每一页 */
  private static restoreWhiteboard(db: Database.Database, row: Record<string, unknown>) {
    const pages = parseList(row.white_board_content_ids as string).filter((id): id is number =>
      Number.isSafeInteger(id)
    );
    const exists = db.prepare("SELECT 1 FROM white_board_contents WHERE id = ?");
    if (pages.some(page => !exists.get(page))) throw new Error("画板页已被清理，无法恢复");
    const id = this.reinsertRow(db, "white_boards", row);
    for (const page of pages) WhiteBoardContentTable.incrementRefCount(db, page);
    Operation.insertOperation(db, "whiteboard", "insert", id, Date.now());
    return id;
  }

  /** 挂回仍存在的原位置（原序号超出时放到末尾）；原位置全都不在时拒绝 */
  private static restoreDocument(
    db: Database.Database,
    row: Record<string, unknown>,
    contentCreatedAt: number | null,
    placements: DocumentPlacement[]
  ) {
    const live = placements.filter(place =>
      place.parentId === null
        ? ProjectTable.getProjectOrNull(db, place.projectId!) !== null
        : ProjectTable.getProjectItem(db, place.parentId) !== null
    );
    if (!live.length) throw new Error("原来的位置都已不存在，无法恢复");
    this.retainContent(db, Number(row.content_id) || null, contentCreatedAt);
    const page = Number(row.white_board_content_id) || 0;
    if (row.project_item_type === EProjectItemType.WhiteBoard && page) {
      if (!db.prepare("SELECT 1 FROM white_board_contents WHERE id = ?").get(page))
        throw new Error("画板页已被清理，无法恢复");
      WhiteBoardContentTable.incrementRefCount(db, page);
    }
    const parents = live.flatMap(place => (place.parentId === null ? [] : [place.parentId]));
    const projects = new Set<number>();
    for (const place of live) {
      if (place.parentId === null) projects.add(place.projectId!);
      else
        ProjectTable.getProjectItem(db, place.parentId)!.projects.forEach(id => projects.add(id));
    }
    const id = this.reinsertRow(db, "project_item", {
      ...row,
      children: "[]",
      parents: JSON.stringify(parents),
      projects: JSON.stringify([...projects]),
    });
    for (const place of live) {
      const siblings =
        place.parentId === null
          ? ProjectTable.getProject(db, place.projectId!)
          : ProjectTable.getProjectItem(db, place.parentId)!;
      siblings.children.splice(Math.min(place.index, siblings.children.length), 0, id);
      if (place.parentId === null) ProjectTable.updateProject(db, siblings as never);
      else ProjectTable.updateProjectItem(db, siblings as never);
    }
    Operation.insertOperation(db, "project-item", "insert", id, Date.now());
    return id;
  }

  private static records(
    db: Database.Database,
    entity: PluginDataEntity,
    rows: Row[]
  ): PluginDataRecord[] {
    const titles =
      entity === "card"
        ? contentTitles(
            db,
            rows.flatMap(row => (row.content_id ? [row.content_id] : [])),
            CARD_TITLE_LENGTH
          )
        : undefined;
    return rows.map(row => ({
      entity,
      id: row.id,
      revision: String(row.revision),
      title: titles ? (row.content_id ? (titles.get(row.content_id) ?? "") : "") : row.title,
      tags: parseList(row.tags).filter((tag): tag is string => typeof tag === "string"),
      pinned: Boolean(row.pinned),
      contentId: row.content_created === null ? null : row.content_id,
      contentCreatedAt: row.content_created,
      wordCount: row.word_count,
      createdAt: row.created,
      updatedAt: row.updated,
      ...(entity === "document"
        ? {
            kind: row.kind || "document",
            projectIds: parseList(row.projects).filter((id): id is number =>
              Number.isSafeInteger(id)
            ),
          }
        : {}),
      ...(entity === "whiteboard"
        ? { description: row.description ?? "", pageCount: row.item_count ?? 0 }
        : {}),
      ...(entity === "project"
        ? { archived: Boolean(row.archived), documentCount: row.item_count ?? 0 }
        : {}),
    }));
  }
}
