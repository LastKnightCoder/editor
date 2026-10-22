/**
 * 脉络的谱系与「被使用」分区：来源、衍生、共用正文的 Notebook 笔记，以及白板、待办、Notebook 资源。
 *
 * - 谱系只记推导不出的事实（entity_lineage）；闪卡引用、Notebook 投影与资源都在查询时推导（KL-008）。
 * - 来自白板的关系（放入、关联、白板文字里的引用）统一归「被使用 · 白板」（KL-023）。
 */

import type Database from "better-sqlite3";
import { slatePlainText } from "@/entity/inline-refs";
import { lineageNodeKey, type LineageNode } from "@/entity/lineage";
import { entityRefKey, isSameEntityRef, type EntityRef, type EntityRefKind } from "@/entity/ref";
import type { EntityKind } from "@/types/entity";
import type {
  ContextEntity,
  ContextLineageItem,
  ContextOpenTarget,
  ContextUsage,
} from "@/types/entity-context";
import ComposeBoardTable from "../tables/compose-board";
import EntityLineageTable, { type LineageEdge } from "../tables/entity-lineage";
import EntitySearchTable from "../tables/entity-search";
import MaterialTable from "../tables/material";

/** 各分区最多返回的条数（与 context-query 一致） */
const LIMIT = 50;
const TITLE_CHARS = 80;

const marks = (values: unknown[]) => values.map(() => "?").join(",");

const clip = (text: string) =>
  text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS)}…` : text;

const PICKER_KIND: Record<EntityRefKind, EntityKind> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  "diary-moment": "diary-moment",
  "plugin-entity": "plugin-entity",
};

/** 正文实体的标题与次级信息，脉络各分区共用 */
export function toContextEntity(db: Database.Database, ref: EntityRef): ContextEntity | null {
  const candidate = EntitySearchTable.resolve(db, PICKER_KIND[ref.kind], ref.id, 0);
  if (!candidate) return null;
  return { ref, title: candidate.title, meta: candidate.meta };
}

interface ResolvedNode {
  title: string;
  meta: string;
  /** 无法直接打开时为 null（仍展示，不算已删除） */
  open: ContextOpenTarget | null;
}

const CHAT_SCOPE: Record<string, { label: string; openable: boolean }> = {
  "main-chat": { label: "对话", openable: true },
  "pdf-chat": { label: "PDF 对话", openable: false },
  "video-note-chat": { label: "视频笔记对话", openable: false },
  "vibe-learning-chat": { label: "Notebook 对话", openable: false },
};

const KIND_LABEL: Record<LineageNode["kind"], string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-moment": "日记",
  "plugin-entity": "插件内容",
  excerpt: "摘录",
  "pdf-annotation": "PDF 标注",
  "chat-session": "对话",
  "vl-note": "Notebook 笔记",
  "web-clip": "解析文档",
  flashcard: "闪卡",
  "vl-project": "Notebook",
};

/**
 * 端点的展示信息；端点已删除或不在脉络里展示（剪藏解析文档只在网页条目内部出现）时返回 null。
 * toEntity 复用 context-query 的实体解析（标题与次级信息口径一致）。
 */
function resolveNode(
  db: Database.Database,
  node: LineageNode,
  toEntity: (ref: EntityRef) => ContextEntity | null
): ResolvedNode | null {
  switch (node.kind) {
    case "chat-session": {
      const row = db.prepare(`SELECT title, scope FROM chat_session WHERE id = ?`).get(node.id) as
        { title: string; scope: string } | undefined;
      if (!row) return null;
      const scope = CHAT_SCOPE[row.scope];
      return {
        title: row.title || "未命名对话",
        meta: scope?.label ?? "对话",
        // 只有主对话能经对话页打开；PDF / Notebook / 视频笔记里的对话随宿主打开，这里只展示
        open: scope?.openable ? { page: "chat", id: node.id } : null,
      };
    }
    case "vl-note": {
      const row = db
        .prepare(
          `SELECT n.title, n.project_id, p.title AS project_title FROM vl_note n
           JOIN vibe_learning_project p ON p.id = n.project_id WHERE n.id = ?`
        )
        .get(node.id) as { title: string; project_id: number; project_title: string } | undefined;
      return row
        ? {
            title: row.title || "未命名笔记",
            meta: `Notebook · ${row.project_title}`,
            open: { page: "vibe-learning-detail", id: row.project_id },
          }
        : null;
    }
    case "flashcard": {
      const row = db
        .prepare(
          `SELECT f.prompt, f.deck_id, d.name AS deck_name FROM flashcards f
           JOIN flashcard_decks d ON d.id = f.deck_id WHERE f.id = ?`
        )
        .get(node.id) as { prompt: string; deck_id: number; deck_name: string } | undefined;
      if (!row) return null;
      return {
        title: clip(flashcardPrompt(row.prompt)) || "闪卡",
        meta: `闪卡 · ${row.deck_name}`,
        open: { page: "review", deckId: row.deck_id },
      };
    }
    case "vl-project": {
      const row = db
        .prepare(`SELECT title FROM vibe_learning_project WHERE id = ?`)
        .get(node.id) as { title: string } | undefined;
      return row
        ? {
            title: row.title || "未命名 Notebook",
            meta: "Notebook",
            open: { page: "vibe-learning-detail", id: node.id },
          }
        : null;
    }
    case "web-clip":
      return null;
    case "excerpt":
    case "pdf-annotation": {
      const info = MaterialTable.resolveOne(db, node);
      if (!info) return null;
      return {
        title: info.title,
        // 摘录源端删除后保留引文（KL-032），不可打开
        meta: info.deleted ? `${info.meta} · 原划线已删除` : info.meta,
        open: info.open ? { page: "material", target: info.open } : null,
      };
    }
    default: {
      const entity = toEntity(node);
      return entity
        ? {
            title: entity.title,
            meta: entity.meta || KIND_LABEL[node.kind],
            open: { page: "entity", ref: node },
          }
        : null;
    }
  }
}

function flashcardPrompt(raw: string): string {
  try {
    return slatePlainText(JSON.parse(raw));
  } catch {
    return raw;
  }
}

/** 我从哪来；来源已删除的保留一行并标记 missing（KL-026） */
export function sourcesOf(
  db: Database.Database,
  identities: EntityRef[],
  toEntity: (ref: EntityRef) => ContextEntity | null
): ContextLineageItem[] {
  const seen = new Set<string>();
  const items: ContextLineageItem[] = [];
  for (const edge of EntityLineageTable.sourcesOf(db, identities)) {
    const key = lineageNodeKey(edge.node);
    if (seen.has(key) || identities.some(ref => lineageNodeKey(ref) === key)) continue;
    seen.add(key);
    const resolved = resolveNode(db, edge.node, toEntity);
    if (!resolved && edge.node.kind === "web-clip") continue;
    items.push(toItem(edge, resolved));
    if (items.length >= LIMIT) break;
  }
  return items;
}

/** Notebook 由什么立项（谱系 upgraded_to，取最近一条）；没有或来源已删除时为 null */
export function notebookSourceOf(
  db: Database.Database,
  projectId: number
): ContextLineageItem | null {
  const edge = EntityLineageTable.sourcesOf(db, [{ kind: "vl-project", id: projectId }]).find(
    item => item.relation === "upgraded_to"
  );
  const resolved = edge ? resolveNode(db, edge.node, ref => toContextEntity(db, ref)) : null;
  return edge && resolved ? toItem(edge, resolved) : null;
}

const toItem = (edge: LineageEdge, resolved: ResolvedNode | null): ContextLineageItem => ({
  node: edge.node,
  relation: edge.relation,
  title: resolved?.title ?? "",
  meta: resolved?.meta ?? KIND_LABEL[edge.node.kind],
  missing: !resolved,
  open: resolved?.open ?? null,
});

/** 我产生了什么：谱系出边 + 引用我正文的闪卡；已删除的不返回 */
export function derivedOf(
  db: Database.Database,
  identities: EntityRef[],
  contentIds: number[],
  toEntity: (ref: EntityRef) => ContextEntity | null
): ContextLineageItem[] {
  const edges = EntityLineageTable.derivedOf(db, identities);
  // 闪卡的参考资料指向我的正文：查询时推导，不入谱系（KL-008）
  if (contentIds.length) {
    const rows = db
      .prepare(
        `SELECT r.card_id, MAX(f.create_time) AS create_time FROM flashcard_references r
         JOIN flashcards f ON f.id = r.card_id
         WHERE r.content_id IN (${marks(contentIds)})
         GROUP BY r.card_id ORDER BY create_time DESC`
      )
      .all(...contentIds) as Array<{ card_id: number; create_time: number }>;
    for (const row of rows) {
      edges.push({
        node: { kind: "flashcard", id: row.card_id },
        relation: "derived",
        anchor: null,
        createTime: row.create_time,
      });
    }
  }
  edges.sort((a, b) => b.createTime - a.createTime);
  const seen = new Set(identities.map(ref => lineageNodeKey(ref)));
  const items: ContextLineageItem[] = [];
  for (const edge of edges) {
    const key = lineageNodeKey(edge.node);
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = resolveNode(db, edge.node, toEntity);
    if (!resolved) continue;
    items.push(toItem(edge, resolved));
    if (items.length >= LIMIT) break;
  }
  return items;
}

/** 与我共用正文的 Notebook 笔记（Notebook 笔记「转为卡片 / 文章」是投影，KL-027） */
export function notebookProjectionsOf(
  db: Database.Database,
  contentIds: number[],
  toEntity: (ref: EntityRef) => ContextEntity | null
): ContextLineageItem[] {
  if (contentIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT id, create_time FROM vl_note WHERE content_id IN (${marks(contentIds)})
       ORDER BY create_time DESC LIMIT ${LIMIT}`
    )
    .all(...contentIds) as Array<{ id: number; create_time: number }>;
  return rows.flatMap(row => {
    const node: LineageNode = { kind: "vl-note", id: row.id };
    const resolved = resolveNode(db, node, toEntity);
    return resolved
      ? [toItem({ node, relation: "derived", anchor: null, createTime: row.create_time }, resolved)]
      : [];
  });
}

interface WhiteboardPage {
  id: number;
  name: string;
}

/**
 * 用到我的白板。命中条件：页里的元素直接指向我（任一身份或正文），或页里的文本块、
 * 思维导图节点的正文引用了我（extraContentIds：引用我、但解析不到身份的来源正文）。
 * 页的归属：独立白板 / 项目里的白板条目 / 文档里嵌入的白板块；都找不到（孤儿页）不显示。
 */
function whiteboardUsagesOf(
  mainDb: Database.Database,
  indexDb: Database.Database,
  identities: EntityRef[],
  contentIds: number[],
  extraContentIds: number[],
  toEntity: (ref: EntityRef) => ContextEntity | null
): ContextUsage[] {
  const contents = [...new Set([...contentIds, ...extraContentIds])];
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (contents.length) {
    clauses.push(`(dst_kind = 'content' AND dst_id IN (${marks(contents)}))`);
    params.push(...contents);
  }
  for (const ref of identities) {
    clauses.push(`(dst_kind = ? AND dst_id = ?)`);
    params.push(ref.kind, ref.id);
  }
  if (clauses.length === 0) return [];
  const pageIds = (
    indexDb
      .prepare(`SELECT DISTINCT page_id FROM whiteboard_refs WHERE ${clauses.join(" OR ")}`)
      .all(...params) as Array<{ page_id: number }>
  ).map(row => row.page_id);
  if (pageIds.length === 0) return [];

  const pages = new Map(
    (
      mainDb
        .prepare(
          `SELECT id, name FROM white_board_contents WHERE id IN (${marks(pageIds)}) AND ref_count > 0`
        )
        .all(...pageIds) as WhiteboardPage[]
    ).map(page => [page.id, page])
  );
  if (pages.size === 0) return [];
  const live = [...pages.keys()];
  const usages = new Map<string, ContextUsage>();
  const owned = new Set<number>();

  // 独立白板：只解析 id 数组这一短列，代价与画布大小无关
  const boards = mainDb
    .prepare(
      `SELECT wb.id, wb.title, CAST(j.value AS INTEGER) AS page_id,
         json_array_length(wb.white_board_content_ids) AS page_count
       FROM white_boards wb, json_each(wb.white_board_content_ids) j
       WHERE CAST(j.value AS INTEGER) IN (${marks(live)})`
    )
    .all(...live) as Array<{ id: number; title: string; page_id: number; page_count: number }>;
  for (const board of boards) {
    owned.add(board.page_id);
    const key = `whiteboard:${board.id}`;
    if (usages.has(key)) continue;
    const pageName = pages.get(board.page_id)?.name ?? "";
    usages.set(key, {
      kind: "whiteboard",
      key,
      title: board.title || "未命名白板",
      meta: board.page_count > 1 && pageName ? `白板 · ${pageName}` : "白板",
      open: { page: "whiteboard-detail", id: board.id, pageId: board.page_id },
    });
  }

  // 项目里的白板条目与文档里嵌入的白板块：归属是一个正文实体
  const hosts: Array<{ ref: EntityRef; meta: string; compose?: boolean }> = [];
  const pending = live.filter(id => !owned.has(id));
  if (pending.length) {
    const items = mainDb
      .prepare(
        `SELECT id, white_board_content_id AS page_id FROM project_item
         WHERE white_board_content_id IN (${marks(pending)})`
      )
      .all(...pending) as Array<{ id: number; page_id: number }>;
    for (const item of items) {
      owned.add(item.page_id);
      hosts.push({ ref: { kind: "project-item", id: item.id }, meta: "项目里的白板" });
    }
  }
  // 创作模式的素材板：归属正在写的那份正文，优先落到文章身份
  const composed = ComposeBoardTable.contentIdsOfPages(
    mainDb,
    live.filter(id => !owned.has(id))
  );
  if (composed.size) {
    const located = EntitySearchTable.locateAll(mainDb, [...new Set(composed.values())]);
    for (const [pageId, contentId] of composed) {
      const refs = located.get(contentId) ?? [];
      const ref = refs.find(item => item.kind === "article") ?? refs[0];
      owned.add(pageId);
      if (ref) hosts.push({ ref, meta: "创作白板", compose: true });
    }
  }
  const embedded = live.filter(id => !owned.has(id));
  if (embedded.length) {
    const embeds = indexDb
      .prepare(
        `SELECT host_content_id, page_id FROM whiteboard_embeds WHERE page_id IN (${marks(embedded)})`
      )
      .all(...embedded) as Array<{ host_content_id: number; page_id: number }>;
    const located = EntitySearchTable.locateAll(
      mainDb,
      embeds.map(embed => embed.host_content_id)
    );
    for (const embed of embeds) {
      const ref = located.get(embed.host_content_id)?.[0];
      if (ref) hosts.push({ ref, meta: "文档里的白板" });
    }
  }
  for (const host of hosts) {
    if (identities.some(ref => isSameEntityRef(ref, host.ref))) continue;
    const key = `entity:${entityRefKey(host.ref)}`;
    if (usages.has(key)) continue;
    const entity = toEntity(host.ref);
    if (!entity) continue;
    usages.set(key, {
      kind: "whiteboard",
      key,
      title: entity.title,
      meta: host.meta,
      open: { page: "entity", ref: host.ref, ...(host.compose ? { compose: true } : {}) },
    });
  }
  return [...usages.values()];
}

function todoUsagesOf(db: Database.Database, contentIds: number[]): ContextUsage[] {
  if (contentIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT DISTINCT t.id, t.title, t.is_completed, t.update_time FROM todo_note_link l
       JOIN todo_item t ON t.id = l.todo_id
       WHERE l.content_id IN (${marks(contentIds)}) AND t.is_archived = 0
       ORDER BY t.is_completed, t.update_time DESC LIMIT ${LIMIT}`
    )
    .all(...contentIds) as Array<{ id: number; title: string; is_completed: number }>;
  return rows.map(row => ({
    kind: "todo",
    key: `todo:${row.id}`,
    title: row.title || "未命名待办",
    completed: row.is_completed === 1,
    open: { page: "todos", selectedId: row.id },
  }));
}

/** 我的正文作为 Notebook 资源（source_type = note，original_path = note://<contentId>） */
function notebookUsagesOf(db: Database.Database, contentIds: number[]): ContextUsage[] {
  if (contentIds.length === 0) return [];
  const paths = contentIds.map(id => `note://${id}`);
  const rows = db
    .prepare(
      `SELECT DISTINCT p.id, p.title FROM vibe_learning_resources r
       JOIN vibe_learning_project p ON p.id = r.project_id
       WHERE r.source_type = 'note' AND r.original_path IN (${marks(paths)})
       ORDER BY p.update_time DESC LIMIT ${LIMIT}`
    )
    .all(...paths) as Array<{ id: number; title: string }>;
  return rows.map(row => ({
    kind: "notebook",
    key: `notebook:${row.id}`,
    title: row.title || "未命名 Notebook",
    open: { page: "vibe-learning-detail", id: row.id },
  }));
}

/** 谁在使用我：白板、待办、Notebook 资源 */
export function usagesOf(
  mainDb: Database.Database,
  indexDb: Database.Database,
  identities: EntityRef[],
  contentIds: number[],
  unresolvedReferrers: number[],
  toEntity: (ref: EntityRef) => ContextEntity | null
): ContextUsage[] {
  return [
    ...whiteboardUsagesOf(mainDb, indexDb, identities, contentIds, unresolvedReferrers, toEntity),
    ...todoUsagesOf(mainDb, contentIds),
    ...notebookUsagesOf(mainDb, contentIds),
  ].slice(0, LIMIT);
}
