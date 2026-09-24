import {
  KNOWLEDGE_MIGRATION_KEY,
  mappedKnowledgeId,
  migrateKnowledgeCitations,
  migrateKnowledgeReferences,
  type KnowledgeMapping,
} from "./knowledge-references";
import { DATA_MODEL_VERSION, assertCompatibleDataModel } from "./model-version";

type Row = Record<string, any>;

/** 结构接口让迁移不依赖 Electron 或某个 SQLite 原生模块。 */
export interface MigrationDatabase {
  prepare(sql: string): {
    all(...params: any[]): Row[];
    get(...params: any[]): Row | undefined;
    run(...params: any[]): unknown;
  };
  exec(sql: string): unknown;
}

export interface KnowledgeMigrationReport {
  mapping: KnowledgeMapping;
  projectCount: number;
  itemCount: number;
  repairedRelations: number;
  /** 旧版删除子节点未清父引用留下的悬空 children 条目数，迁移时剔除。 */
  repairedDanglingRefs: number;
  /** 从任何知识库根不可达的节点（旧树 UI 同样不可见），迁移时收拢进「未挂载文档」项目，不丢弃数据。 */
  recoveredOrphans: number[];
  /** 收拢孤儿的项目 ID；无孤儿时为 null。 */
  rescueProjectId: number | null;
}

const mappingCache = new WeakMap<MigrationDatabase, KnowledgeMapping>();

const fail = (message: string): never => {
  throw new Error(`KNOWLEDGE_MIGRATION_FAILED: ${message}`);
};
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const hasTable = (db: MigrationDatabase, table: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
const columns = (db: MigrationDatabase, table: string) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${quote(table)})`)
      .all()
      .map(row => row.name)
  );

const COLUMN_ADDITIONS: Record<string, Record<string, string>> = {
  project: {
    archived: "INTEGER DEFAULT 0",
    pinned: "INTEGER DEFAULT 0",
    project_type: "TEXT DEFAULT 'document-tree'",
    data_table_id: "INTEGER DEFAULT 0",
  },
  project_item: {
    project_item_type: "TEXT DEFAULT 'document'",
    content_id: "INTEGER",
    white_board_content_id: "INTEGER",
    podcast_id: "INTEGER DEFAULT NULL",
    tags: "TEXT NOT NULL DEFAULT '[]'",
  },
};

function ensureProjectColumns(db: MigrationDatabase) {
  for (const [table, fields] of Object.entries(COLUMN_ADDITIONS)) {
    if (!hasTable(db, table)) continue;
    const existing = columns(db, table);
    for (const [column, definition] of Object.entries(fields)) {
      if (!existing.has(column))
        db.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${definition}`);
    }
  }
}

/** 旧版项目的纯文本描述包装为段落结构，与迁移产出的 desc 协议一致。 */
function wrapPlainTextProjectDesc(db: MigrationDatabase) {
  if (!hasTable(db, "project")) return;
  for (const project of db.prepare("SELECT id,desc FROM project").all()) {
    const raw = project.desc ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed)) {
      const desc = raw ? [{ type: "paragraph", children: [{ type: "formatted", text: raw }] }] : [];
      db.prepare("UPDATE project SET desc=? WHERE id=?").run(JSON.stringify(desc), project.id);
    }
  }
}

function registerDataModelVersion(db: MigrationDatabase) {
  db.exec("CREATE TABLE IF NOT EXISTS migration_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  db.prepare(
    "INSERT INTO migration_meta(key,value) VALUES('data-model-version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(String(DATA_MODEL_VERSION));
}

function array(raw: unknown, label: string): any[] {
  let value: unknown;
  try {
    value = raw == null || raw === "" ? [] : JSON.parse(String(raw));
  } catch {
    return fail(`${label} 不是合法 JSON`);
  }
  if (!Array.isArray(value)) return fail(`${label} 必须是数组`);
  return value;
}

function ids(raw: unknown, label: string): number[] {
  const result = array(raw, label);
  if (result.some(id => !Number.isSafeInteger(id) || id <= 0)) fail(`${label} 包含无效 ID`);
  if (new Set(result).size !== result.length) fail(`${label} 包含重复节点`);
  return result;
}

export function readKnowledgeMapping(db: MigrationDatabase): KnowledgeMapping | null {
  const cached = mappingCache.get(db);
  if (cached) return cached;
  if (!hasTable(db, "migration_meta")) return null;
  const row = db
    .prepare("SELECT value FROM migration_meta WHERE key=?")
    .get(KNOWLEDGE_MIGRATION_KEY);
  if (!row) return null;
  let report: KnowledgeMigrationReport;
  try {
    report = JSON.parse(row.value);
  } catch {
    return fail("迁移映射损坏，已停止打开数据库");
  }
  const mapping = report.mapping;
  if (
    !mapping ||
    ![mapping.projects, mapping.items].every(
      entries =>
        entries &&
        !Array.isArray(entries) &&
        typeof entries === "object" &&
        Object.entries(entries).every(
          ([id, target]) =>
            Number.isSafeInteger(Number(id)) &&
            Number(id) > 0 &&
            Number.isSafeInteger(target) &&
            target > 0
        )
    )
  ) {
    return fail("迁移映射损坏，已停止打开数据库");
  }
  // 映射在同一连接内不可变，切库或同步重连会换连接。
  mappingCache.set(db, mapping);
  return mapping;
}

export function inspectKnowledgeMigration(db: MigrationDatabase): KnowledgeMigrationReport {
  const roots = hasTable(db, "documents")
    ? db.prepare("SELECT * FROM documents ORDER BY id").all()
    : [];
  const items = hasTable(db, "document_items")
    ? db.prepare("SELECT * FROM document_items ORDER BY id").all()
    : [];
  const maxId = (table: string) =>
    hasTable(db, table)
      ? Number(db.prepare(`SELECT COALESCE(MAX(id),0) AS value FROM ${quote(table)}`).get()?.value)
      : 0;
  const sequence = hasTable(db, "migration_meta")
    ? Number(
        db.prepare("SELECT value FROM migration_meta WHERE key='project:id-seq'").get()?.value ?? 0
      )
    : 0;
  if (!Number.isSafeInteger(sequence) || sequence < 0) fail("项目 ID 序列无效");
  const mapping: KnowledgeMapping = { projects: {}, items: {} };
  for (const row of [...roots, ...items]) {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) fail(`历史实体 ID 无效：${row.id}`);
  }
  const itemIds = new Set(items.map(row => row.id));
  const children = new Map<number, number[]>();
  // 悬空 child 引用是旧版"删子节点不清父引用"的残留：剔除并计数，不再视为致命损坏
  let repairedDanglingRefs = 0;
  const keepExisting = (list: number[]) => {
    const kept = list.filter(id => itemIds.has(id));
    repairedDanglingRefs += list.length - kept.length;
    return kept;
  };
  for (const row of items) {
    children.set(row.id, keepExisting(ids(row.children, `document_items:${row.id}.children`)));
  }
  const rootChildren = new Map<number, number[]>();
  for (const root of roots) {
    array(root.content, `documents:${root.id}.content`);
    rootChildren.set(root.id, keepExisting(ids(root.children, `documents:${root.id}.children`)));
  }
  // 从知识库根沿 children 做可达闭包；迭代 BFS，避免深层文档树耗尽调用栈
  const reachable = new Set<number>();
  const queue: number[] = [];
  for (const list of rootChildren.values()) {
    for (const child of list) {
      if (!reachable.has(child)) {
        reachable.add(child);
        queue.push(child);
      }
    }
  }
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index])!) {
      if (!reachable.has(child)) {
        reachable.add(child);
        queue.push(child);
      }
    }
  }
  // 从任何知识库根不可达的孤儿节点是历史结构变化的遗留（旧树 UI 同样不可见）：
  // 不丢弃数据，统一收拢进一个「未挂载文档」项目，避免正文失去全部入口
  const reachableItems = items.filter(row => reachable.has(row.id));
  const orphanItems = items.filter(row => !reachable.has(row.id));
  const projectStart = Math.max(maxId("project"), sequence);
  const itemStart = maxId("project_item");
  roots.forEach((row, index) => {
    mapping.projects[row.id] = projectStart + index + 1;
  });
  reachableItems.forEach((row, index) => {
    mapping.items[row.id] = itemStart + index + 1;
  });
  const rescueProjectId = orphanItems.length ? projectStart + roots.length + 1 : null;
  orphanItems.forEach((row, index) => {
    mapping.items[row.id] = itemStart + reachableItems.length + index + 1;
  });
  for (const value of [...Object.values(mapping.projects), ...Object.values(mapping.items)]) {
    if (!Number.isSafeInteger(value)) fail("迁移后的 ID 超出安全整数范围");
  }
  // 行级校验覆盖全部要迁移的节点（孤儿同样进入新世界，数据必须完整）
  const parents = new Map<number, Set<number>>();
  const projects = new Map<number, Set<number>>();
  for (const row of items) {
    parents.set(row.id, new Set<number>());
    projects.set(row.id, new Set<number>());
    const tags = array(row.tags, `document_items:${row.id}.tags`);
    if (tags.some(tag => typeof tag !== "string")) fail(`节点 ${row.id} 标签不是字符串`);
    if (
      !Number.isSafeInteger(row.content_id) ||
      !db.prepare("SELECT id FROM contents WHERE id=?").get(row.content_id)
    ) {
      fail(`节点 ${row.id} 正文 ${row.content_id} 不存在`);
    }
    const references: [string, number][] = [];
    if (row.ref_type) references.push([row.ref_type, row.ref_id]);
    if (row.is_card && row.card_id) references.push(["card", row.card_id]);
    if (row.is_article && row.article_id) references.push(["article", row.article_id]);
    if (new Set(references.map(ref => JSON.stringify(ref))).size > 1)
      fail(`节点 ${row.id} 关联冲突`);
    const ref = references[0];
    if (ref) {
      const table = { card: "cards", article: "articles", content: "contents" }[ref[0]];
      if (!table) fail(`节点 ${row.id} 关联类型 ${ref[0]} 不支持`);
      const target = db.prepare(`SELECT * FROM ${quote(table!)} WHERE id=?`).get(ref[1]);
      if (!target || (ref[0] === "content" ? target.id : target.content_id) !== row.content_id) {
        fail(`节点 ${row.id} 关联与正文不一致`);
      }
    }
  }
  for (const root of roots) {
    for (const child of rootChildren.get(root.id)!) {
      projects.get(child)!.add(root.id);
    }
  }
  for (const [parent, list] of children) {
    if (!reachable.has(parent)) continue;
    for (const child of list) parents.get(child)!.add(parent);
  }
  // 拓扑检查不使用递归，且只覆盖可达子图；孤儿子树不经拓扑传播，其内部成环不阻塞收拢
  const remaining = new Map(
    [...parents].filter(([id]) => reachable.has(id)).map(([id, list]) => [id, list.size])
  );
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  const order: number[] = [];
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index];
    order.push(id);
    for (const child of children.get(id)!) {
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (count === 0) ready.push(child);
    }
  }
  if (order.length !== reachableItems.length)
    fail(
      `文档树存在循环：${[...remaining]
        .filter(([, n]) => n > 0)
        .map(([id]) => id)
        .join(",")}`
    );
  for (const id of order) {
    for (const child of children.get(id)!) {
      for (const project of projects.get(id)!) projects.get(child)!.add(project);
    }
  }
  let repairedRelations = 0;
  for (const row of reachableItems) {
    for (const [field, expected] of [
      ["parents", parents.get(row.id)!],
      ["documents", projects.get(row.id)!],
    ] as const) {
      const original = ids(row[field], `document_items:${row.id}.${field}`);
      if (original.length !== expected.size || original.some(id => !expected.has(id)))
        repairedRelations++;
    }
  }
  return {
    mapping,
    projectCount: roots.length,
    itemCount: items.length,
    repairedRelations,
    repairedDanglingRefs,
    recoveredOrphans: orphanItems.map(row => row.id),
    rescueProjectId,
  };
}

function migrateJsonColumns(db: MigrationDatabase, mapping: KnowledgeMapping) {
  const carriers: [string, string, boolean?][] = [
    ["contents", "content"],
    ["project", "desc"],
    ["white_board_contents", "data"],
    ["questions", "question_content"],
    ["questions", "answers"],
    ["flashcards", "data", true],
    ["data_tables", "rows"],
    ["data_tables", "columns"],
    ["chat_run", "request_payload", true],
    ["chat_run", "tool_snapshot", true],
    ["vibe_learning_resources", "source_meta_info"],
    ...[
      "chat_message",
      "pdf_chats",
      "video_note_chats",
      "audio_note_chats",
      "vibe_learning_chats",
    ].map(table => [table, "messages", true] as [string, string, boolean]),
  ];
  const citations = (value: unknown): unknown => {
    if (typeof value === "string") return migrateKnowledgeCitations(value, mapping);
    if (Array.isArray(value)) return value.map(citations);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, citations(item)]));
    return value;
  };
  for (const [table, column, chat] of carriers) {
    if (!columns(db, table).has(column)) continue;
    const key = table === "chat_run" ? "run_id" : "id";
    const rows = db
      .prepare(
        `SELECT ${key} AS id, ${quote(column)} AS value FROM ${quote(table)} WHERE ${quote(column)} LIKE '%document-item%' OR ${quote(column)} LIKE '%document-card-list%'`
      )
      .all();
    const update = db.prepare(`UPDATE ${quote(table)} SET ${quote(column)}=? WHERE ${key}=?`);
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        fail(`${table}:${row.id}.${column} 不是合法 JSON`);
      }
      const next = migrateKnowledgeReferences(parsed, mapping);
      update.run(JSON.stringify(chat ? citations(next) : next), row.id);
    }
  }
  for (const column of ["assistant_snapshot", "reasoning_snapshot"]) {
    if (!columns(db, "chat_run").has(column)) continue;
    for (const row of db
      .prepare(
        `SELECT run_id,${column} AS value FROM chat_run WHERE ${column} LIKE '%document-item%'`
      )
      .all()) {
      db.prepare(`UPDATE chat_run SET ${column}=? WHERE run_id=?`).run(
        migrateKnowledgeCitations(row.value, mapping),
        row.run_id
      );
    }
  }
}

function migrateMetadata(db: MigrationDatabase, mapping: KnowledgeMapping) {
  const relational: [string, string, string, string, string, keyof KnowledgeMapping][] = [
    [
      "operation",
      "operation_content_type",
      "operation_id",
      "document-item",
      "project-item",
      "items",
    ],
    ["operation", "operation_content_type", "operation_id", "document", "project", "projects"],
    [
      "collaboration_bindings",
      "source_type",
      "source_id",
      "document-item",
      "project-item",
      "items",
    ],
  ];
  for (const [table, type, id, before, after, kind] of relational) {
    if (!columns(db, table).has(type)) continue;
    for (const row of db
      .prepare(`SELECT DISTINCT ${quote(id)} AS id FROM ${quote(table)} WHERE ${quote(type)}=?`)
      .all(before)) {
      // 已删除实体的历史记录不能映射到后来复用的 ID。
      if (!mapping[kind][row.id]) {
        if (table === "operation") {
          db.prepare(
            `UPDATE operation SET ${quote(type)}=? WHERE ${quote(type)}=? AND ${quote(id)}=?`
          ).run(`retired-${before}`, before, row.id);
          continue;
        }
        // 旧版本删除知识库节点时不清理协作绑定；正文仍在则降级为 retired 来源，正文已删的行无法再恢复绑定，直接清除。
        const alive = db
          .prepare(
            "SELECT 1 FROM collaboration_bindings b JOIN contents c ON c.id=b.content_id AND c.create_time=b.content_created_at WHERE b.source_type=? AND b.source_id=?"
          )
          .get(before, row.id);
        if (alive) {
          db.prepare(
            "UPDATE collaboration_bindings SET source_type=? WHERE source_type=? AND source_id=?"
          ).run(`retired-${before}`, before, row.id);
        } else {
          db.prepare("DELETE FROM collaboration_bindings WHERE source_type=? AND source_id=?").run(
            before,
            row.id
          );
        }
        continue;
      }
      db.prepare(
        `UPDATE ${quote(table)} SET ${quote(type)}=?,${quote(id)}=? WHERE ${quote(type)}=? AND ${quote(id)}=?`
      ).run(after, mappedKnowledgeId(mapping[kind], row.id), before, row.id);
    }
  }
  if (hasTable(db, "todo_note_link")) {
    db.exec("UPDATE todo_note_link SET type='project-item' WHERE type='document-item'");
  }
  if (
    hasTable(db, "content_link") &&
    db.prepare("SELECT id FROM content_link WHERE source_type='document' LIMIT 1").get()
  ) {
    fail("content_link 含语义不明确的 document 来源，需先确认记录归属");
  }
  if (hasTable(db, "publish_selections")) {
    for (const row of db
      .prepare("SELECT * FROM publish_selections WHERE content_type='document'")
      .all()) {
      // 指向已删除知识库的发布选择无迁移意义，直接清除（区别于 publish_history 的置空保留：选择是状态行而非历史记录）
      if (!mapping.projects[row.content_id]) {
        db.prepare("DELETE FROM publish_selections WHERE id=?").run(row.id);
        continue;
      }
      let path = row.parent_path;
      if (path) {
        let scope: Row;
        try {
          scope = JSON.parse(path);
        } catch {
          fail(`发布选择 ${row.id} 范围无法解析`);
        }
        if (scope!.mode !== "partial" || !Array.isArray(scope!.nodes))
          fail(`发布选择 ${row.id} 范围无法识别`);
        path = JSON.stringify({
          ...scope!,
          nodes: scope!.nodes.map((id: number) => mappedKnowledgeId(mapping.items, id)),
        });
      }
      db.prepare(
        "UPDATE publish_selections SET content_type='project',content_id=?,parent_path=? WHERE id=?"
      ).run(mappedKnowledgeId(mapping.projects, row.content_id), path, row.id);
    }
  }
  // file_path 保持旧地址，发布器仍可据此清理远端旧文件。
  if (hasTable(db, "publish_history")) {
    for (const row of db
      .prepare("SELECT id,source_id FROM publish_history WHERE source_type='document'")
      .all()) {
      db.prepare("UPDATE publish_history SET source_type='project',source_id=? WHERE id=?").run(
        mapping.projects[row.source_id] ?? null,
        row.id
      );
    }
  }
  if (hasTable(db, "statistic")) {
    const rows = db
      .prepare(
        "SELECT * FROM statistic WHERE statistic_type IN ('project-item','document-item') ORDER BY date,id"
      )
      .all();
    const dates = new Map<string, Map<string, Row>>();
    for (const row of rows) {
      const types = dates.get(row.date) ?? new Map();
      if (types.has(row.statistic_type)) fail(`统计快照重复：${row.date}/${row.statistic_type}`);
      types.set(row.statistic_type, row);
      dates.set(row.date, types);
    }
    const current: Record<string, { count: number; wordsCount: number }> = {
      "project-item": { count: 0, wordsCount: 0 },
      "document-item": { count: 0, wordsCount: 0 },
    };
    db.exec("DELETE FROM statistic WHERE statistic_type IN ('project-item','document-item')");
    for (const [date, types] of dates) {
      for (const [type, row] of types) {
        let value: { count: number; wordsCount: number };
        try {
          value = JSON.parse(row.content);
        } catch {
          value = fail(`统计快照 ${date}/${type} 不是合法 JSON`);
        }
        if (![value.count, value.wordsCount].every(n => Number.isFinite(n) && n >= 0))
          fail(`统计快照无效：${date}`);
        current[type] = value;
      }
      const sum = {
        count: current["project-item"].count + current["document-item"].count,
        wordsCount: current["project-item"].wordsCount + current["document-item"].wordsCount,
      };
      db.prepare(
        "INSERT INTO statistic(id,date,statistic_type,content) VALUES(?,?,'project-item',?)"
      ).run([...types.values()][0].id, date, JSON.stringify(sum));
    }
  }
}

/** 调用方须独占业务写入，并在 backup 中创建包含 WAL 的 SQLite 快照。 */
export function migrateKnowledgeToProjects(
  db: MigrationDatabase,
  backup: () => void
): KnowledgeMigrationReport | null {
  if (hasTable(db, "migration_meta")) {
    const version = db
      .prepare("SELECT value FROM migration_meta WHERE key='data-model-version'")
      .get()?.value;
    assertCompatibleDataModel({ dataModelVersion: version === undefined ? 0 : Number(version) });
  }
  if (readKnowledgeMapping(db)) {
    for (const table of ["documents", "document_items"]) {
      if (hasTable(db, table) && db.prepare(`SELECT id FROM ${quote(table)} LIMIT 1`).get())
        fail("已迁移数据库再次出现旧数据");
    }
    return null;
  }
  const report = inspectKnowledgeMigration(db);
  // 无知识库数据可迁移：全新库（开库建表后含空 project）、仅用过项目的库或旧版 CLI 的空壳文件。
  // 只补齐项目列、包装旧版纯文本描述并登记模型版本，不产生备份，也不登记迁移映射。
  if (!hasTable(db, "documents") && !hasTable(db, "document_items")) {
    ensureProjectColumns(db);
    wrapPlainTextProjectDesc(db);
    registerDataModelVersion(db);
    return null;
  }
  backup();
  db.exec("BEGIN IMMEDIATE");
  try {
    // 拿到写锁后重新预检，避免预检与事务之间的内容变化。
    const locked = inspectKnowledgeMigration(db);
    if (JSON.stringify(locked) !== JSON.stringify(report)) fail("预检后数据库已变化，请重试");
    ensureProjectColumns(db);
    db.exec("CREATE TABLE IF NOT EXISTS migration_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
    wrapPlainTextProjectDesc(db);
    const roots = hasTable(db, "documents")
      ? db.prepare("SELECT * FROM documents ORDER BY id").all()
      : [];
    const items = hasTable(db, "document_items")
      ? db.prepare("SELECT * FROM document_items ORDER BY id").all()
      : [];
    const mapping = report.mapping;
    const itemId = (id: number) => mappedKnowledgeId(mapping.items, id);
    // 悬空引用的剔除口径与预检一致（inspect 已计入报告），这里只做过滤；孤儿照常迁移
    const itemIds = new Set(items.map(row => row.id));
    const kept = (list: number[]) => list.filter(id => itemIds.has(id));
    const orphanIds = new Set(report.recoveredOrphans);
    const parents = new Map(items.map(row => [row.id, [] as number[]]));
    const projects = new Map(
      items.map(row => [
        row.id,
        orphanIds.has(row.id) && report.rescueProjectId
          ? new Set([report.rescueProjectId])
          : new Set<number>(),
      ])
    );
    const children = new Map(items.map(row => [row.id, kept(ids(row.children, `节点 ${row.id}`))]));
    for (const row of items)
      for (const child of children.get(row.id)!) parents.get(child)!.push(itemId(row.id));
    for (const root of roots) {
      const rootChildren = kept(ids(root.children, `知识库 ${root.id}`));
      const visited = new Set<number>();
      const queue = [...rootChildren];
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index];
        if (visited.has(id)) continue;
        visited.add(id);
        projects.get(id)!.add(mapping.projects[root.id]);
        queue.push(...(children.get(id) ?? []));
      }
      const desc = root.desc
        ? [{ type: "paragraph", children: [{ type: "formatted", text: root.desc }] }]
        : [];
      desc.push(...array(root.content, `知识库 ${root.id}.content`));
      db.prepare(
        "INSERT INTO project(id,create_time,update_time,title,desc,children,archived,pinned,project_type,data_table_id) VALUES(?,?,?,?,?,?,0,?,'document-tree',0)"
      ).run(
        mapping.projects[root.id],
        root.create_time,
        root.update_time,
        root.title,
        JSON.stringify(desc),
        JSON.stringify(rootChildren.map(itemId)),
        Number(!!root.is_top)
      );
    }
    if (report.rescueProjectId) {
      // 孤儿节点统一收拢，避免正文在新世界失去全部入口；时间戳取迁移时刻
      const now = Date.now();
      db.prepare(
        "INSERT INTO project(id,create_time,update_time,title,desc,children,archived,pinned,project_type,data_table_id) VALUES(?,?,?,?,'[]',?,0,0,'document-tree',0)"
      ).run(
        report.rescueProjectId,
        now,
        now,
        "未挂载文档",
        JSON.stringify(report.recoveredOrphans.map(itemId))
      );
    }
    for (const row of items) {
      const refType =
        row.ref_type ||
        (row.is_card && row.card_id ? "card" : row.is_article && row.article_id ? "article" : "");
      const refId = row.ref_type
        ? row.ref_id
        : refType === "card"
          ? row.card_id
          : refType === "article"
            ? row.article_id
            : 0;
      db.prepare(
        "INSERT INTO project_item(id,create_time,update_time,title,children,parents,projects,ref_type,ref_id,project_item_type,content_id,white_board_content_id,tags) VALUES(?,?,?,?,?,?,?,?,?,'document',?,0,?)"
      ).run(
        itemId(row.id),
        row.create_time,
        row.update_time,
        row.title,
        JSON.stringify(children.get(row.id)!.map(itemId)),
        JSON.stringify(parents.get(row.id)),
        JSON.stringify([...projects.get(row.id)!].sort((a, b) => a - b)),
        refType,
        refId,
        row.content_id,
        JSON.stringify(array(row.tags, `节点 ${row.id}.tags`))
      );
    }
    migrateJsonColumns(db, mapping);
    migrateMetadata(db, mapping);
    db.exec("DROP TABLE IF EXISTS document_items; DROP TABLE IF EXISTS documents");
    const sequence = Math.max(
      Number(db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM project").get()?.id ?? 0),
      Number(
        db.prepare("SELECT value FROM migration_meta WHERE key='project:id-seq'").get()?.value ?? 0
      )
    );
    db.prepare(
      "INSERT INTO migration_meta(key,value) VALUES('project:id-seq',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).run(String(sequence));
    db.prepare("INSERT INTO migration_meta(key,value) VALUES(?,?)").run(
      KNOWLEDGE_MIGRATION_KEY,
      JSON.stringify(report)
    );
    db.prepare(
      "INSERT INTO migration_meta(key,value) VALUES('data-model-version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).run(String(DATA_MODEL_VERSION));
    db.exec("COMMIT");
    return report;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
