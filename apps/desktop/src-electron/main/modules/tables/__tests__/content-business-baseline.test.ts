// @vitest-environment node
import Database from "better-sqlite3";
import { Doc } from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import schema from "@tau/db-schema/schema/main.sql?raw";
import {
  prepareContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { EProjectItemType, type CreateProjectItem, type ProjectItem } from "@/types/project";
import { executeDatabaseCommand } from "../../database-command";
import { onContentWritten } from "../../content-events";
import {
  canonicalContentTitle,
  projectContentTitle,
  registerContentSession,
  unregisterContentSession,
} from "../../collaboration/content-sessions";
import type { RuntimeSession } from "../../collaboration/types";
import CardTable from "../card";
import ArticleTable from "../article";
import ProjectTable from "../project";
import PluginDataTable from "../plugin-data";
import ContentTable from "../content";

vi.mock("electron");
vi.mock("../../video-note-index-queue");

interface FixtureParagraph {
  type: "paragraph";
  collabId: string;
  tauContract: string;
  children: { type: "formatted"; text: string; bold?: boolean }[];
}

function requireFixture<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`业务夹具缺少${label}`);
  return value;
}

describe("正文业务基准 F4：独立创建、共用、复制与释放", () => {
  let db: Database.Database;
  let contracts: ContentContractDictionary;
  let content: FixtureParagraph[];
  let creationEvents: number[];
  let stopContentEvents: () => void;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.exec(schema);
    creationEvents = [];
    stopContentEvents = onContentWritten(event => {
      if (event.action === "create") creationEvents.push(event.contentId);
    });
    const prepared = await prepareContentContract("host.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    contracts = { [prepared.id]: prepared.contract };
    content = [
      {
        type: "paragraph",
        collabId: "fixture-paragraph",
        tauContract: prepared.id,
        children: [{ type: "formatted", text: "共同正文中🙂", bold: true }],
      },
    ];
  });

  afterEach(() => {
    stopContentEvents();
    vi.restoreAllMocks();
    db.close();
  });

  const createProject = (title: string) =>
    executeDatabaseCommand(db, ProjectTable.createProject.bind(ProjectTable), db, {
      title,
      desc: [],
      children: [],
      archived: false,
      pinned: false,
    });

  const documentInput = (input: Partial<CreateProjectItem> = {}): CreateProjectItem => ({
    title: "原始标题",
    content: content as Descendant[],
    contracts,
    count: 0,
    children: [],
    refType: "",
    refId: 0,
    whiteboardContentId: 0,
    projectItemType: EProjectItemType.Document,
    tags: ["项目标签"],
    ...input,
  });

  const addDocument = (projectId: number, input: Partial<CreateProjectItem> = {}) => {
    const [, document] = executeDatabaseCommand(
      db,
      ProjectTable.addRootProjectItem.bind(ProjectTable),
      db,
      projectId,
      documentInput(input)
    );
    if (!document) throw new Error("业务夹具未创建项目文档");
    return document;
  };

  const createCard = () =>
    executeDatabaseCommand(db, CardTable.getListenEvents()["create-card"], db, {
      content: content as Descendant[],
      contracts,
      count: 0,
      tags: ["卡片标签"],
      isTop: false,
    });

  const rejectCardInsertOperation = () => {
    db.exec(`CREATE TEMP TRIGGER reject_card_insert_operation BEFORE INSERT ON operation
      WHEN NEW.operation_content_type = 'card' AND NEW.operation_action = 'insert'
      BEGIN SELECT RAISE(ABORT, '基准注入：卡片新增流水失败'); END`);
  };

  const stored = (id: number) => {
    const row = db
      .prepare(
        `SELECT c.content,c.ref_count,d.document_id,d.contracts,d.revision
         FROM content_snapshots c JOIN content_documents d ON d.content_id=c.id WHERE c.id=?`
      )
      .get(id) as {
      content: string;
      ref_count: number;
      document_id: string;
      contracts: string;
      revision: string;
    };
    return { ...row, nodes: JSON.parse(row.content) as FixtureParagraph[] };
  };

  const replaceText = (id: number, text: string, revision = stored(id).revision) => {
    const value = stored(id);
    value.nodes[0].children[0].text = text;
    executeDatabaseCommand(db, ContentTable.updateContent.bind(ContentTable), db, id, {
      content: value.nodes as Descendant[],
      contracts,
      expectedRevision: revision,
    });
  };

  const projectOwnershipSnapshot = () => ({
    projects: db.prepare("SELECT * FROM project ORDER BY id").all(),
    items: db.prepare("SELECT * FROM project_item ORDER BY id").all(),
    contents: db.prepare("SELECT * FROM content_snapshots ORDER BY id").all(),
    documents: db.prepare("SELECT * FROM content_documents ORDER BY content_id").all(),
    identities: db.prepare("SELECT * FROM entity_identities ORDER BY entity_kind, entity_id").all(),
    operations: db.prepare("SELECT * FROM operation ORDER BY id").all(),
  });

  it("三种业务入口独立创建正文，正文和节点身份不复用输入身份", () => {
    const project = createProject("项目甲");
    const document = addDocument(project.id);
    const card = createCard();
    const article = executeDatabaseCommand(db, ArticleTable.createArticle.bind(ArticleTable), db, {
      title: "文章标题",
      author: "",
      tags: ["文章标签"],
      links: [],
      content: content as Descendant[],
      contracts,
      count: 0,
      bannerBg: "",
      isTop: false,
      isDelete: false,
    });
    const ids = [document.contentId, card.contentId, article.contentId];
    expect(new Set(ids).size).toBe(3);
    const snapshots = ids.map(stored);
    expect(new Set(snapshots.map(value => value.document_id)).size).toBe(3);
    expect(new Set(snapshots.map(value => value.nodes[0].collabId)).size).toBe(3);
    for (const value of snapshots) {
      expect(value.nodes[0].collabId).not.toBe("fixture-paragraph");
      expect(value.nodes[0].children).toEqual([
        { type: "formatted", text: "共同正文中🙂", bold: true },
      ]);
      expect(JSON.parse(value.contracts)).toEqual(contracts);
      expect(value.ref_count).toBe(1);
    }
    expect(content[0].collabId).toBe("fixture-paragraph");
  });

  it("项目文档派生卡片和文章共用正文，重复转换不重复持有，元数据独立", () => {
    const project = createProject("项目甲");
    const document = addDocument(project.id);
    const card = requireFixture(
      executeDatabaseCommand(
        db,
        CardTable.createCardFromProjectItem.bind(CardTable),
        db,
        document.id
      ),
      "派生卡片"
    );
    const article = requireFixture(
      executeDatabaseCommand(
        db,
        ArticleTable.createArticleFromProjectItem.bind(ArticleTable),
        db,
        document.id
      ),
      "派生文章"
    );
    expect([card.contentId, article.contentId]).toEqual([document.contentId, document.contentId]);
    expect(stored(document.contentId).ref_count).toBe(3);
    expect(CardTable.buildCardFromContent(db, document.contentId).id).toBe(card.id);
    expect(ArticleTable.buildArticleFromContent(db, document.contentId, "不覆盖标题").id).toBe(
      article.id
    );
    expect(stored(document.contentId).ref_count).toBe(3);

    CardTable.updateCard(db, { ...card, tags: ["卡片独有"], isTop: true });
    ArticleTable.updateArticle(db, { ...article, tags: ["文章独有"] });
    replaceText(document.contentId, "共同正文已编辑🙂");
    const rows = db
      .prepare(
        `SELECT 'card' AS kind,c.content,cards.tags FROM cards JOIN content_snapshots c ON c.id=cards.content_id
         UNION ALL SELECT 'article',c.content,articles.tags FROM articles JOIN content_snapshots c ON c.id=articles.content_id
         UNION ALL SELECT 'project',c.content,project_item.tags FROM project_item JOIN content_snapshots c ON c.id=project_item.content_id`
      )
      .all() as { kind: string; content: string; tags: string }[];
    expect(rows.map(row => [row.kind, JSON.parse(row.tags)])).toEqual([
      ["card", ["卡片独有"]],
      ["article", ["文章独有"]],
      ["project", ["项目标签"]],
    ]);
    for (const row of rows)
      expect(JSON.parse(row.content)[0].children).toEqual([
        { type: "formatted", text: "共同正文已编辑🙂", bold: true },
      ]);
  });

  it("按已有正文快照新建项目文档是独立复制，后续写入互不影响且拒绝旧修订", () => {
    const source = createCard();
    const original = stored(source.contentId);
    const project = createProject("副本项目");
    const copy = addDocument(project.id, { content: original.nodes as Descendant[] });
    const copied = stored(copy.contentId);
    expect(copy.contentId).not.toBe(source.contentId);
    expect(copied.document_id).not.toBe(original.document_id);
    expect(copied.nodes[0].collabId).not.toBe(original.nodes[0].collabId);

    replaceText(copy.contentId, "只改副本");
    replaceText(source.contentId, "只改原卡片");
    expect(stored(copy.contentId).nodes[0].children[0].text).toBe("只改副本");
    expect(stored(source.contentId).nodes[0].children[0].text).toBe("只改原卡片");
    expect(() => replaceText(copy.contentId, "过期覆盖", copied.revision)).toThrow("修订冲突");
    expect(stored(copy.contentId).nodes[0].children[0].text).toBe("只改副本");
    expect([stored(source.contentId).ref_count, stored(copy.contentId).ref_count]).toEqual([1, 1]);
  });

  it("同一项目条目挂载两处不增加正文持有，解除最后挂载才释放项目条目", () => {
    const first = createProject("项目甲");
    const second = createProject("项目乙");
    const document = addDocument(first.id);
    const card = requireFixture(CardTable.createCardFromProjectItem(db, document.id), "派生卡片");
    executeDatabaseCommand(
      db,
      ProjectTable.addRefRootProjectItem.bind(ProjectTable),
      db,
      second.id,
      document.id
    );
    const membership = () =>
      db.prepare("SELECT projects FROM project_item WHERE id=?").get(document.id) as
        | { projects: string }
        | undefined;
    expect(JSON.parse(requireFixture(membership(), "项目归属").projects)).toEqual([
      first.id,
      second.id,
    ]);
    expect(stored(document.contentId).ref_count).toBe(2);

    executeDatabaseCommand(
      db,
      ProjectTable.removeRootProjectItem.bind(ProjectTable),
      db,
      first.id,
      document.id
    );
    expect(JSON.parse(requireFixture(membership(), "剩余项目归属").projects)).toEqual([second.id]);
    expect(stored(document.contentId).ref_count).toBe(2);
    executeDatabaseCommand(
      db,
      ProjectTable.removeRootProjectItem.bind(ProjectTable),
      db,
      second.id,
      document.id
    );
    expect(membership()).toBeUndefined();
    expect(stored(document.contentId).ref_count).toBe(1);
    expect(db.prepare("SELECT content_id FROM cards WHERE id=?").get(card.id)).toEqual({
      content_id: document.contentId,
    });
    expect(stored(document.contentId).nodes[0].children[0].text).toBe("共同正文中🙂");
  });

  it("目录写入失败保留活跃正文标题，重试只变更挂载", () => {
    const project = createProject("目录与正文标题");
    const parent = addDocument(project.id, { title: "目录中的旧标题" });
    const child = addDocument(project.id, { title: "另一个条目" });
    const body = requireFixture(ContentTable.getContentById(db, parent.contentId), "父条目正文");
    const doc = new Doc();
    const title = doc.getText("title");
    title.insert(0, "会话中的新标题");
    const session = {
      info: {
        id: "active-directory-title",
        mode: "local",
        source: { contentCreatedAt: body.createTime },
      },
      doc,
    } as unknown as RuntimeSession;
    registerContentSession(db, parent.contentId, session);
    const readParent = () =>
      db.prepare("SELECT title,children FROM project_item WHERE id=?").get(parent.id);
    try {
      expect(canonicalContentTitle(db, parent.contentId)).toBe("会话中的新标题");
      db.exec(`CREATE TEMP TRIGGER reject_directory_operation BEFORE INSERT ON operation
        WHEN NEW.operation_content_type = 'project-item' AND NEW.operation_action = 'update'
        BEGIN SELECT RAISE(ABORT, '目录流水写入失败'); END`);
      expect(() => ProjectTable.addRefChildProjectItem(db, parent.id, child.id)).toThrow(
        "目录流水写入失败"
      );
      expect(readParent()).toEqual({ title: "目录中的旧标题", children: "[]" });
      expect(title.toString()).toBe("会话中的新标题");
      db.exec("DROP TRIGGER reject_directory_operation");
      ProjectTable.addRefChildProjectItem(db, parent.id, child.id);
      expect(readParent()).toEqual({
        title: "目录中的旧标题",
        children: JSON.stringify([child.id]),
      });
      expect(title.toString()).toBe("会话中的新标题");
      expect(stored(child.contentId).ref_count).toBe(1);
    } finally {
      unregisterContentSession(session);
      doc.destroy();
    }
  });

  it.each(["项目条目", "插件文章"] as const)("%s改名在主库提交后才写活跃正文标题", async kind => {
    const isProject = kind === "项目条目";
    const project = createProject("标题提交");
    const item = addDocument(project.id);
    const article = ArticleTable.buildArticleFromContent(db, item.contentId, "原始标题");
    const row = isProject ? item : article;
    const table = isProject ? "project_item" : "articles";
    const body = requireFixture(ContentTable.getContentById(db, item.contentId), "正文");
    const doc = new Doc();
    const title = doc.getText("title");
    title.insert(0, "原始标题");
    const session = {
      info: {
        id: "committed-content-title",
        mode: "local",
        source: { contentCreatedAt: body.createTime },
      },
      doc,
    } as unknown as RuntimeSession;
    registerContentSession(db, item.contentId, session);
    const readTitle = () => db.prepare(`SELECT title FROM ${table} WHERE id=?`).pluck().get(row.id);
    const changes: { writing: boolean; stored: unknown }[] = [];
    doc.on("update", () => changes.push({ writing: db.inTransaction, stored: readTitle() }));
    const ctx = { broadcastOthers: vi.fn(), broadcastAll: vi.fn() };
    const params = {
      databaseName: db.name,
      pluginId: "title-test",
      entity: "article",
      id: article.id,
    } as const;
    const rename = () =>
      isProject
        ? executeDatabaseCommand(
            db,
            ProjectTable.getListenEvents()["update-project-item"],
            db,
            { ...item, title: "新标题" },
            ctx
          )
        : executeDatabaseCommand(
            db,
            PluginDataTable.getListenEvents()["plugin-data:update"],
            db,
            {
              ...params,
              expectedRevision: requireFixture(PluginDataTable.get(db, params), "文章").revision,
              patch: { title: "新标题" },
            },
            ctx
          );
    try {
      db.exec(`CREATE TEMP TRIGGER reject_title_operation BEFORE INSERT ON operation
        WHEN NEW.operation_content_type = '${isProject ? "project-item" : "article"}'
          AND NEW.operation_action = 'update'
        BEGIN SELECT RAISE(ABORT, '标题流水写入失败'); END`);
      await expect(rename()).rejects.toThrow("标题流水写入失败");
      expect(readTitle()).toBe("原始标题");
      expect(title.toString()).toBe("原始标题");
      expect(changes).toEqual([]);

      db.exec("DROP TRIGGER reject_title_operation");
      expect(await rename()).toMatchObject({ title: "新标题" });
      expect(title.toString()).toBe("新标题");
      expect(changes).toEqual([{ writing: false, stored: "新标题" }]);
    } finally {
      unregisterContentSession(session);
      doc.destroy();
    }
  });

  it("解除最后实际挂载时不被仅摘目录留下的旧父引用阻挡", () => {
    const project = createProject("保留模式");
    const parent = addDocument(project.id);
    const child = addDocument(project.id);
    ProjectTable.addRefChildProjectItem(db, parent.id, child.id);
    ProjectTable.removeChildProjectItem(db, project.id, parent.id, child.id, true);
    expect(ProjectTable.getProjectItem(db, parent.id)?.children).toEqual([]);
    expect(ProjectTable.getProjectItem(db, child.id)?.parents).toEqual([parent.id]);
    expect(stored(child.contentId).ref_count).toBe(1);

    ProjectTable.removeRootProjectItem(db, project.id, child.id);
    expect(ProjectTable.getProjectItem(db, child.id)).toBeNull();
    expect(ContentTable.getContentById(db, child.contentId)).toBeNull();
    expect(ProjectTable.getProject(db, project.id).children).toEqual([parent.id]);
  });

  it.each(["根目录", "子目录"] as const)(
    "直接新增项目%s条目时，目录写入失败会回滚项目条目与正文持有",
    directory => {
      const card = createCard();
      const project = createProject("目标项目");
      const parent = addDocument(project.id);
      const item = documentInput({ refType: "card", refId: card.id });
      const isRoot = directory === "根目录";
      const table = isRoot ? "project" : "project_item";
      const location = isRoot ? project.id : parent.id;
      const entries = db.prepare(`SELECT children FROM ${table} WHERE id=?`).pluck();
      const children = JSON.parse(entries.get(location) as string) as number[];
      const before = projectOwnershipSnapshot();
      const add = () =>
        isRoot
          ? ProjectTable.addRootProjectItem(db, project.id, item)
          : ProjectTable.addChildProjectItem(db, parent.id, item);
      db.exec(`CREATE TEMP TRIGGER reject_project_directory BEFORE UPDATE OF children ON ${table}
        WHEN NEW.children <> OLD.children
        BEGIN SELECT RAISE(ABORT, '基准注入：项目目录写入失败'); END`);

      expect(add).toThrow("基准注入：项目目录写入失败");
      expect(projectOwnershipSnapshot()).toEqual(before);

      db.exec("DROP TRIGGER reject_project_directory");
      const [, added] = requireFixture(add(), "新增项目目录");
      const document = requireFixture(added, "新增项目条目");
      expect(JSON.parse(entries.get(location) as string)).toEqual([...children, document.id]);
      expect(db.prepare("SELECT content_id FROM project_item WHERE id=?").get(document.id)).toEqual(
        {
          content_id: card.contentId,
        }
      );
      expect(stored(card.contentId).ref_count).toBe(2);
    }
  );

  it("直接解除项目最后挂载时，子树释放中途失败会完整回滚", () => {
    const first = createProject("最初挂载");
    const last = createProject("最后挂载");
    const root = addDocument(first.id);
    const [, added] = requireFixture(
      executeDatabaseCommand(
        db,
        ProjectTable.addChildProjectItem.bind(ProjectTable),
        db,
        root.id,
        documentInput({ title: "先释放的子文档" })
      ),
      "新增子目录"
    );
    const child = requireFixture(added, "子文档");
    const card = requireFixture(CardTable.createCardFromProjectItem(db, root.id), "派生卡片");
    executeDatabaseCommand(
      db,
      ProjectTable.addRefRootProjectItem.bind(ProjectTable),
      db,
      last.id,
      root.id
    );
    executeDatabaseCommand(
      db,
      ProjectTable.removeRootProjectItem.bind(ProjectTable),
      db,
      first.id,
      root.id
    );
    const memberships = db.prepare("SELECT projects FROM project_item ORDER BY id").pluck();
    expect(memberships.all()).toEqual([JSON.stringify([last.id]), JSON.stringify([last.id])]);
    expect([stored(root.contentId).ref_count, stored(child.contentId).ref_count]).toEqual([2, 1]);
    const before = projectOwnershipSnapshot();
    // 子文档先回收。仅在保留卡片持有的根正文减为一个持有时截断释放。
    db.exec(`CREATE TEMP TRIGGER reject_project_subtree_release AFTER UPDATE OF ref_count ON contents
      WHEN OLD.ref_count = 2 AND NEW.ref_count = 1
      BEGIN SELECT RAISE(ABORT, '基准注入：项目子树正文释放失败'); END`);

    const detach = () => ProjectTable.removeRootProjectItem(db, last.id, root.id);
    expect(detach).toThrow("基准注入：项目子树正文释放失败");
    expect(projectOwnershipSnapshot()).toEqual(before);

    db.exec("DROP TRIGGER reject_project_subtree_release");
    detach();
    expect(db.prepare("SELECT children FROM project ORDER BY id").pluck().all()).toEqual([
      "[]",
      "[]",
    ]);
    expect(db.prepare("SELECT id FROM project_item ORDER BY id").all()).toEqual([]);
    expect(db.prepare("SELECT id, ref_count FROM contents ORDER BY id").all()).toEqual([
      { id: card.contentId, ref_count: 1 },
    ]);
    expect(
      db.prepare("SELECT content_id FROM content_documents ORDER BY content_id").all()
    ).toEqual([{ content_id: card.contentId }]);
  });

  it("解除两个项目共用父条目的唯一子挂载会释放子条目及正文", () => {
    const first = createProject("项目甲");
    const second = createProject("项目乙");
    const parent = addDocument(first.id);
    const [, added] = requireFixture(
      executeDatabaseCommand(
        db,
        ProjectTable.addChildProjectItem.bind(ProjectTable),
        db,
        parent.id,
        documentInput({ title: "唯一子文档" })
      ),
      "新增子目录"
    );
    const child = requireFixture(added, "子文档");
    executeDatabaseCommand(
      db,
      ProjectTable.addRefRootProjectItem.bind(ProjectTable),
      db,
      second.id,
      parent.id
    );
    const item = db.prepare("SELECT children, parents, projects FROM project_item WHERE id=?");
    expect(item.get(child.id)).toEqual({
      children: "[]",
      parents: JSON.stringify([parent.id]),
      projects: JSON.stringify([first.id, second.id]),
    });
    expect(stored(child.contentId).ref_count).toBe(1);

    ProjectTable.removeChildProjectItem(db, first.id, parent.id, child.id);

    expect(db.prepare("SELECT children FROM project ORDER BY id").pluck().all()).toEqual([
      JSON.stringify([parent.id]),
      JSON.stringify([parent.id]),
    ]);
    expect(item.get(parent.id)).toEqual({
      children: "[]",
      parents: "[]",
      projects: JSON.stringify([first.id, second.id]),
    });
    expect(item.get(child.id)).toBeUndefined();
    expect(db.prepare("SELECT id, ref_count FROM contents ORDER BY id").all()).toEqual([
      { id: parent.contentId, ref_count: 1 },
    ]);
    expect(
      db.prepare("SELECT content_id FROM content_documents ORDER BY content_id").all()
    ).toEqual([{ content_id: parent.contentId }]);
  });

  it("删除某个共用入口保留剩余正文，最后一个入口的延迟释放保留可恢复正文", () => {
    const project = createProject("项目甲");
    const document = addDocument(project.id);
    const card = requireFixture(CardTable.createCardFromProjectItem(db, document.id), "派生卡片");
    const article = requireFixture(
      ArticleTable.createArticleFromProjectItem(db, document.id),
      "派生文章"
    );
    executeDatabaseCommand(db, CardTable.deleteCard.bind(CardTable), db, card.id);
    expect(stored(document.contentId).ref_count).toBe(2);
    executeDatabaseCommand(
      db,
      ProjectTable.removeRootProjectItem.bind(ProjectTable),
      db,
      project.id,
      document.id
    );
    expect(stored(document.contentId).ref_count).toBe(1);
    executeDatabaseCommand(db, ArticleTable.deleteArticleById.bind(ArticleTable), db, article.id, {
      deferContent: true,
    });
    expect(stored(document.contentId).ref_count).toBe(0);
    expect(stored(document.contentId).nodes[0].children[0].text).toBe("共同正文中🙂");
    expect(db.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([
      { content_id: document.contentId },
    ]);
    expect(
      db
        .prepare(
          "SELECT id FROM cards UNION ALL SELECT id FROM articles UNION ALL SELECT id FROM project_item"
        )
        .all()
    ).toEqual([]);
  });

  it("现状观察：无会话时标题只改当前条目，正文标题投影才统一同正文标题", () => {
    const project = createProject("项目甲");
    const document = addDocument(project.id);
    const article = requireFixture(
      ArticleTable.createArticleFromProjectItem(db, document.id),
      "派生文章"
    );
    ProjectTable.updateProjectItem(db, { ...document, title: "条目独立改名" });
    expect(db.prepare("SELECT title FROM articles WHERE id=?").get(article.id)).toEqual({
      title: "原始标题",
    });
    expect(db.prepare("SELECT title FROM project_item WHERE id=?").get(document.id)).toEqual({
      title: "条目独立改名",
    });
    const revision = stored(document.contentId).revision;
    projectContentTitle(db, document.contentId, "正文会话标题");
    expect(
      db.prepare("SELECT title FROM articles UNION ALL SELECT title FROM project_item").all()
    ).toEqual([{ title: "正文会话标题" }, { title: "正文会话标题" }]);
    expect(stored(document.contentId).revision).toBe(revision);
    expect(stored(document.contentId).ref_count).toBe(2);
  });

  it("真实命令事务在卡片行写入失败时回滚已创建的正文、身份与操作记录", () => {
    db.exec(`CREATE TRIGGER reject_card BEFORE INSERT ON cards BEGIN
      SELECT RAISE(ABORT, '基准注入：卡片写入失败');
    END`);
    expect(createCard).toThrow("基准注入：卡片写入失败");
    for (const table of [
      "cards",
      "contents",
      "content_documents",
      "content_entity_relations",
      "operation",
      "entity_identities",
      "library_identity",
    ])
      expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
  });

  const newContentInput = () => ({ content: content as Descendant[], contracts, count: 0 });

  const expectNoCreatedContent = () => {
    for (const table of [
      "cards",
      "articles",
      "contents",
      "content_documents",
      "content_entity_relations",
      "content_pending_releases",
      "operation",
      "entity_identities",
      "library_identity",
    ])
      expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
  };

  it.each([
    ["卡片", "card", "cards"],
    ["文章", "article", "articles"],
  ] as const)("直接新建普通%s失败时回滚业务行、正文、契约和流水", (label, entity, table) => {
    const create = () =>
      entity === "card"
        ? CardTable.createCard(db, { ...newContentInput(), tags: ["新建卡片"], isTop: false })
        : ArticleTable.createArticle(db, {
            ...newContentInput(),
            title: "新建文章",
            author: "",
            tags: [],
            links: [],
            bannerBg: "",
            isTop: false,
            isDelete: false,
          });
    db.exec(`CREATE TEMP TRIGGER reject_owner_creation BEFORE INSERT ON operation
      WHEN NEW.operation_content_type = '${entity}' AND NEW.operation_action = 'insert'
      BEGIN SELECT RAISE(ABORT, '基准注入：新建${label}流水失败'); END`);

    expect(create).toThrow(`基准注入：新建${label}流水失败`);
    expectNoCreatedContent();
    expect(creationEvents).toEqual([]);

    db.exec("DROP TRIGGER reject_owner_creation");
    const owner = create();
    expect(creationEvents).toEqual([owner.contentId]);
    expect(db.prepare(`SELECT id, content_id FROM ${table}`).all()).toEqual([
      { id: owner.id, content_id: owner.contentId },
    ]);
    expect(db.prepare("SELECT id, ref_count FROM contents").all()).toEqual([
      { id: owner.contentId, ref_count: 1 },
    ]);
    const body = stored(owner.contentId);
    expect(JSON.parse(body.contracts)).toEqual(contracts);
    expect(body.nodes[0].children).toEqual(content[0].children);
    expect(
      db
        .prepare(
          "SELECT operation_content_type, operation_action, operation_id FROM operation ORDER BY id"
        )
        .all()
    ).toEqual([
      {
        operation_content_type: "content",
        operation_action: "insert",
        operation_id: owner.contentId,
      },
      { operation_content_type: entity, operation_action: "insert", operation_id: owner.id },
    ]);
  });

  it("直接建立待挂接正文失败时回滚正文、契约、待回收登记和流水", () => {
    const create = () => ContentTable.createPendingContent(db, newContentInput());
    db.exec(`CREATE TEMP TRIGGER reject_pending_content BEFORE INSERT ON content_pending_releases
      BEGIN SELECT RAISE(ABORT, '基准注入：待回收登记失败'); END`);

    expect(create).toThrow("基准注入：待回收登记失败");
    expectNoCreatedContent();
    expect(creationEvents).toEqual([]);

    db.exec("DROP TRIGGER reject_pending_content");
    const contentId = create();
    expect(creationEvents).toEqual([contentId]);
    expect(db.prepare("SELECT id, ref_count FROM contents").all()).toEqual([
      { id: contentId, ref_count: 0 },
    ]);
    expect(db.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([
      { content_id: contentId },
    ]);
    expect(JSON.parse(stored(contentId).contracts)).toEqual(contracts);
    expect(
      db
        .prepare("SELECT operation_content_type, operation_action, operation_id FROM operation")
        .all()
    ).toEqual([
      { operation_content_type: "content", operation_action: "insert", operation_id: contentId },
    ]);
  });

  it("直接共用正文建立文章时，流水写入失败会回滚文章和正文持有", () => {
    const card = createCard();
    const body = stored(card.contentId);
    const operations = db.prepare("SELECT * FROM operation ORDER BY id");
    const originalOperations = operations.all();
    const articles = db.prepare("SELECT id, content_id FROM articles");
    const build = () => ArticleTable.buildArticleFromContent(db, card.contentId, "共用正文");
    db.exec(`CREATE TEMP TRIGGER reject_article_insert_operation BEFORE INSERT ON operation
      WHEN NEW.operation_content_type = 'article' AND NEW.operation_action = 'insert'
      BEGIN SELECT RAISE(ABORT, '基准注入：文章新增流水失败'); END`);

    expect(build).toThrow("基准注入：文章新增流水失败");
    expect({
      body: stored(card.contentId),
      articles: articles.all(),
      operations: operations.all(),
    }).toEqual({ body, articles: [], operations: originalOperations });

    db.exec("DROP TRIGGER reject_article_insert_operation");
    const article = build();
    expect(articles.all()).toEqual([{ id: article.id, content_id: card.contentId }]);
    expect(stored(card.contentId)).toEqual({ ...body, ref_count: 2 });
  });

  it("直接删除文章时，释放正文失败会回滚文章、项目引用和流水", () => {
    const card = createCard();
    const article = ArticleTable.buildArticleFromContent(db, card.contentId, "共同持有");
    const project = createProject("保留引用的项目");
    const item = addDocument(project.id, { refType: "article", refId: article.id });
    const body = stored(card.contentId);
    expect(body.ref_count).toBe(3);
    const articleRow = db.prepare("SELECT id, title, content_id FROM articles WHERE id=?");
    const projectRef = db.prepare(
      "SELECT ref_type, ref_id, content_id FROM project_item WHERE id=?"
    );
    const operations = db.prepare("SELECT * FROM operation ORDER BY id");
    const snapshot = () => ({
      article: articleRow.get(article.id),
      projectRef: projectRef.get(item.id),
      body: stored(card.contentId),
      operations: operations.all(),
    });
    const before = snapshot();
    db.exec(`CREATE TEMP TRIGGER reject_article_release AFTER UPDATE OF ref_count ON contents
      BEGIN SELECT RAISE(ABORT, '基准注入：文章正文释放失败'); END`);

    const remove = () => ArticleTable.deleteArticleById(db, article.id);
    expect(remove).toThrow("基准注入：文章正文释放失败");
    expect(snapshot()).toEqual(before);

    db.exec("DROP TRIGGER reject_article_release");
    expect(remove()).toBe(1);
    expect(articleRow.get(article.id)).toBeUndefined();
    expect(projectRef.get(item.id)).toEqual({
      ref_type: "",
      ref_id: article.id,
      content_id: card.contentId,
    });
    expect(stored(card.contentId)).toEqual({ ...body, ref_count: 2 });
  });

  it.each([
    ["从项目条目派生", (item: ProjectItem) => CardTable.createCardFromProjectItem(db, item.id)],
    ["按正文共用", (item: ProjectItem) => CardTable.buildCardFromContent(db, item.contentId)],
  ])("直接%s建卡时，流水写入失败会回滚卡片和正文持有", (_label, build) => {
    const project = createProject("源项目");
    const document = addDocument(project.id);
    const body = stored(document.contentId);
    const operations = db.prepare("SELECT * FROM operation ORDER BY id");
    const originalOperations = operations.all();
    const cards = db.prepare("SELECT id, content_id FROM cards");
    rejectCardInsertOperation();

    expect(() => build(document)).toThrow("基准注入：卡片新增流水失败");
    expect({
      body: stored(document.contentId),
      cards: cards.all(),
      operations: operations.all(),
    }).toEqual({ body, cards: [], operations: originalOperations });

    db.exec("DROP TRIGGER reject_card_insert_operation");
    const card = requireFixture(build(document), "共用正文卡片");
    expect(cards.all()).toEqual([{ id: card.id, content_id: document.contentId }]);
    expect(stored(document.contentId)).toEqual({ ...body, ref_count: 2 });
  });

  it("直接删除卡片时，释放正文失败会回滚卡片、项目引用和流水", () => {
    const card = createCard();
    const project = createProject("保留引用的项目");
    const item = addDocument(project.id, { refType: "card", refId: card.id });
    const body = stored(card.contentId);
    expect(body.ref_count).toBe(2);
    const cardRow = db.prepare("SELECT id, tags, content_id FROM cards WHERE id=?");
    const projectRef = db.prepare(
      "SELECT ref_type, ref_id, content_id FROM project_item WHERE id=?"
    );
    const operations = db.prepare("SELECT * FROM operation ORDER BY id");
    const snapshot = () => ({
      card: cardRow.get(card.id),
      projectRef: projectRef.get(item.id),
      body: stored(card.contentId),
      operations: operations.all(),
    });
    const before = snapshot();
    db.exec(`CREATE TEMP TRIGGER reject_card_release AFTER UPDATE OF ref_count ON contents
      BEGIN SELECT RAISE(ABORT, '基准注入：卡片正文释放失败'); END`);

    const remove = () => CardTable.deleteCard(db, card.id);
    expect(remove).toThrow("基准注入：卡片正文释放失败");
    expect(snapshot()).toEqual(before);

    db.exec("DROP TRIGGER reject_card_release");
    expect(remove()).toBe(1);
    expect(cardRow.get(card.id)).toBeUndefined();
    expect(projectRef.get(item.id)).toEqual({
      ref_type: "",
      ref_id: card.id,
      content_id: card.contentId,
    });
    expect(stored(card.contentId)).toEqual({ ...body, ref_count: 1 });
  });

  it("直接删除共享卡片仍受协作保护，插件延迟释放保留待回收正文", () => {
    const card = createCard();
    const body = stored(card.contentId);
    db.prepare(`INSERT INTO collaboration_bindings
      (content_id, content_created_at, server_url, document_id)
      SELECT id, create_time, 'https://example.invalid', ? FROM contents WHERE id=?`).run(
      body.document_id,
      card.contentId
    );
    const cards = db.prepare("SELECT id, content_id FROM cards");
    const pending = db.prepare("SELECT content_id FROM content_pending_releases");

    expect(() => CardTable.deleteCard(db, card.id)).toThrow("COLLABORATION_WRITE_REQUIRED");
    expect(cards.all()).toEqual([{ id: card.id, content_id: card.contentId }]);
    expect(stored(card.contentId)).toEqual(body);
    expect(pending.all()).toEqual([]);

    expect(CardTable.deleteCard(db, card.id, { deferContent: true })).toBe(1);
    expect(cards.all()).toEqual([]);
    expect(stored(card.contentId)).toEqual({ ...body, ref_count: 0 });
    expect(pending.all()).toEqual([{ content_id: card.contentId }]);
  });

  it("基准判定器能识别正文缺字和正文持有计数损坏", () => {
    const card = createCard();
    const assertFixture = () => {
      const value = stored(card.contentId);
      expect(value.nodes[0].children[0].text).toBe("共同正文中🙂");
      expect(value.ref_count).toBe(1);
    };
    assertFixture();
    db.prepare(
      "UPDATE contents SET content=json_set(content,'$[0].children[0].text','共同正文中') WHERE id=?"
    ).run(card.contentId);
    expect(assertFixture).toThrow();
    db.prepare(
      "UPDATE contents SET content=json_set(content,'$[0].children[0].text','共同正文中🙂'),ref_count=2 WHERE id=?"
    ).run(card.contentId);
    expect(assertFixture).toThrow();
  });
});
