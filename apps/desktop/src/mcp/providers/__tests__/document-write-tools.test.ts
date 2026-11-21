import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { fallbackCommandContext } from "@tau/rpc";
import "@/commands/contracts/install";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { EProjectItemType, type ProjectLinkSourceType } from "@/types/project";
import { must } from "../../../../src-electron/main/test-support";
import { ToolRegistry } from "@/tools/toolRegistry";
import { rememberDatabaseConnection } from "@/services/command-context";
import { MCP_PROVIDERS } from "../index";
import CardTable from "../../../../src-electron/main/modules/tables/card";
import ArticleTable from "../../../../src-electron/main/modules/tables/article";
import ProjectTable from "../../../../src-electron/main/modules/tables/project";
import { executeDatabaseCommand } from "../../../../src-electron/main/modules/database-command";

vi.mock("electron");
vi.mock("../../../../src-electron/main/modules/video-note-index-queue");

const { ipc } = vi.hoisted(() => {
  const ipc = vi.fn();
  Object.defineProperty(window, "electron", {
    configurable: true,
    value: { invoke: ipc, on: vi.fn(), off: vi.fn() },
  });
  return { ipc };
});

beforeAll(() => useDynamicExtensionsStore.getState().initExtensions(), 60000);

const databaseName = "tools.db";
let directory: string;
let db: Database.Database;
let registry: ToolRegistry;
let calls: number;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tau-document-tools-"));
  db = new Database(join(directory, databaseName));
  db.pragma("journal_mode = WAL");
  db.exec(schema);
  rememberDatabaseConnection({ databaseName, connectionId: "fixture" });
  const handlers = {
    ...CardTable.getListenEvents(),
    ...ArticleTable.getListenEvents(),
    ...ProjectTable.getListenEvents(),
  };
  ipc.mockImplementation(async (event: keyof typeof handlers, request: unknown, scope: unknown) => {
    expect(scope).toEqual({ toolDatabaseName: databaseName, toolDatabaseConnection: "fixture" });
    return executeDatabaseCommand(db, () =>
      Reflect.apply(handlers[event], undefined, [db, request, fallbackCommandContext])
    );
  });
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  registry = new ToolRegistry();
  for (const provider of MCP_PROVIDERS.filter(provider =>
    ["article-tools", "card-tools", "project-document-tools"].includes(provider.id)
  ))
    registry.registerTools(provider.id, provider.tools(), provider.defaultEnabled);
  calls = 0;
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function run(name: string, args: object) {
  const result = await registry.executeToolCall(
    { type: "function", id: String(++calls), function: { name, arguments: JSON.stringify(args) } },
    { databaseName }
  );
  if (!result || result.isParameterError) throw new Error(result?.content ?? "缺少工具结果");
  return JSON.parse(result.content);
}

const project = (title: string) =>
  ProjectTable.createProject(db, { title, desc: [], children: [], pinned: false, archived: false })
    .id;
const create = (projectId: number, parentId = 0) =>
  run("create_project_document", { projectId, parentId, title: "文档", markdown: "真实正文" });
const move = (
  documentId: number,
  projectId: number,
  parentId: number,
  targetProjectId: number,
  targetParentId: number,
  index?: number
) =>
  run("move_project_document", {
    documentId,
    projectId,
    parentId,
    targetProjectId,
    targetParentId,
    index,
  });
const remove = (documentId: number, projectId: number, parentId: number) =>
  run("delete_project_document", { documentId, projectId, parentId });

const link = (
  sourceType: ProjectLinkSourceType,
  sourceId: number,
  projectId: number,
  parentId = 0
) => run("link_to_project", { sourceType, sourceId, projectId, parentId });

function storedState() {
  return ["project", "project_item", "content_documents", "contents", "operation"].map(table =>
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  );
}

it("经工具新建的 Markdown 正文可读，删除实体只释放自己的正文持有", async () => {
  const projectId = project("持有者");
  for (const kind of ["card", "article"]) {
    const key = kind + "Id";
    const entity = await run("create_" + kind, {
      markdown: "**正文保留**",
      tags: [" 标签 "],
      ...(kind === "article" ? { title: "标题" } : {}),
    });
    const [, ref] = ProjectTable.addRootProjectItem(db, projectId, {
      title: "共用",
      content: [],
      count: 0,
      children: [],
      refType: kind,
      refId: entity[key],
      projectItemType: EProjectItemType.Document,
      whiteboardContentId: 0,
    });
    expect(ref?.contentId).toBe(entity.contentId);
    const before = storedState();
    expect(
      await run("link_to_project", { sourceType: kind, sourceId: entity[key], projectId })
    ).toMatchObject({
      changed: false,
      documentId: must(ref).id,
      contentId: entity.contentId,
    });
    expect(storedState()).toEqual(before);
    await run("delete_" + kind, { [key]: entity[key] });
    expect(
      db.prepare("SELECT content,ref_count FROM content_snapshots WHERE id=?").get(entity.contentId)
    ).toMatchObject({ content: expect.stringContaining("正文保留"), ref_count: 1 });
    await remove(must(ref).id, projectId, 0);
    expect(
      db.prepare("SELECT id FROM content_snapshots WHERE id=?").get(entity.contentId)
    ).toBeUndefined();
  }
}, 60000);

it("跨项目移动时保留其他挂载，失败后原目录、正文和操作流水可继续使用", async () => {
  const a = project("甲"),
    b = project("乙"),
    c = project("丙");
  const parent = (await create(a)).documentId;
  ProjectTable.addRefRootProjectItem(db, b, parent);
  const child = await create(a, parent);
  const leaf = await create(b, child.documentId);
  ProjectTable.addRefRootProjectItem(db, b, leaf.documentId);
  const target = (await create(c)).documentId;
  const before = storedState();
  db.exec(`CREATE TEMP TRIGGER fail_target BEFORE UPDATE OF children ON project_item WHEN NEW.id=${target}
    BEGIN SELECT RAISE(ABORT, '目标写入中断'); END`);
  await expect(move(child.documentId, a, parent, c, target)).rejects.toThrow("目标写入中断");
  expect(storedState()).toEqual(before);
  db.exec("DROP TRIGGER fail_target");
  await move(child.documentId, a, parent, c, target);
  expect(ProjectTable.getProjectItem(db, child.documentId)).toMatchObject({
    contentId: child.contentId,
    parents: [target],
    projects: [c],
  });
  expect(ProjectTable.getProjectItem(db, leaf.documentId)?.projects.sort()).toEqual([b, c].sort());
  const after = storedState();
  await expect(move(child.documentId, b, parent, c, 0)).rejects.toThrow();
  await expect(move(target, c, 0, b, leaf.documentId)).rejects.toThrow();
  await expect(remove(child.documentId, b, target)).rejects.toThrow();
  expect(storedState()).toEqual(after);
  await remove(child.documentId, c, target);
  expect(ProjectTable.getProjectItem(db, leaf.documentId)).toMatchObject({
    contentId: leaf.contentId,
    parents: [],
    projects: [b],
  });
  expect((await remove(leaf.documentId, b, 0)).stillMounted).toBe(false);
});

it("从两个项目访问同一父目录可重排，独立根挂载在移除父子边后保留", async () => {
  const a = project("甲");
  const b = project("乙");
  const shared = (await create(a)).documentId;
  ProjectTable.addRefRootProjectItem(db, b, shared);
  const child = await create(a, shared);
  const sibling = await create(b, shared);
  ProjectTable.addRefRootProjectItem(db, b, child.documentId);

  expect(await move(child.documentId, a, shared, b, shared, 1)).toMatchObject({
    projectId: b,
    parentId: shared,
    index: 1,
  });
  expect(ProjectTable.getProjectItem(db, shared)?.children).toEqual([
    sibling.documentId,
    child.documentId,
  ]);
  const before = storedState();
  await expect(move(child.documentId, a, shared, b, 0)).rejects.toThrow("已挂载");
  await expect(move(shared, a, 0, b, 0)).rejects.toThrow("已挂载");
  await expect(move(child.documentId, a, shared, a, 0, 99)).rejects.toThrow("序号");
  expect(storedState()).toEqual(before);
  expect(await remove(child.documentId, a, shared)).toMatchObject({ stillMounted: true });
  expect(ProjectTable.getProjectItem(db, shared)?.children).toEqual([sibling.documentId]);
  expect(ProjectTable.getProjectItem(db, child.documentId)).toMatchObject({
    projects: [b],
    parents: [],
    contentId: child.contentId,
  });
});

it("同一正文的卡片和文章分别关联，同目录重试保留各自的位置", async () => {
  const target = project("共享正文");
  const card = await run("create_card", { markdown: "共同正文" });
  const article = ArticleTable.buildArticleFromContent(db, card.contentId, "访谈结论");
  const cardLink = await link("card", card.cardId, target);
  const articleLink = await link("article", article.id, target);
  expect(cardLink.documentId).not.toBe(articleLink.documentId);
  expect(articleLink.contentId).toBe(cardLink.contentId);
  const before = storedState();
  expect(await link("article", article.id, target)).toMatchObject({
    changed: false,
    documentId: articleLink.documentId,
    index: 1,
  });
  expect(await link("card", card.cardId, target)).toMatchObject({
    changed: false,
    documentId: cardLink.documentId,
    index: 0,
  });
  expect(storedState()).toEqual(before);
  await remove(cardLink.documentId, target, 0);
  expect(ProjectTable.getProject(db, target).children).toEqual([articleLink.documentId]);
  expect(db.prepare("SELECT ref_count FROM contents WHERE id=?").pluck().get(card.contentId)).toBe(
    3
  );
});

it("关联前校验目标目录和来源，拒绝形成环并保留原挂载", async () => {
  const a = project("来源"),
    b = project("目标");
  const root = await create(a);
  const child = await create(a, root.documentId);
  await link("document", child.documentId, b);
  const before = storedState();
  await expect(link("document", root.documentId, b, child.documentId)).rejects.toThrow("子文档");
  await expect(link("document", child.documentId, a, child.documentId)).rejects.toThrow("自身");
  await expect(link("document", child.documentId, b, root.documentId)).rejects.toThrow("父文档");
  for (const kind of ["card", "article", "document"] as const)
    await expect(link(kind, 999999, b)).rejects.toThrow("不存在");
  expect(storedState()).toEqual(before);
});

interface ItemRow {
  id: number;
  children: string;
  parents: string;
  projects: string;
  content_id: number;
}
function auditDirectory() {
  const rows = db
    .prepare("SELECT id, children, parents, projects, content_id FROM project_item")
    .all() as ItemRow[];
  const items = new Map(rows.map(row => [row.id, row]));
  const parents = new Map(rows.map(row => [row.id, new Set<number>()]));
  const memberships = new Map(rows.map(row => [row.id, new Set<number>()]));
  const contentIds = new Set<number>();
  for (const row of rows) {
    contentIds.add(row.content_id);
    const children: number[] = JSON.parse(row.children);
    expect(new Set(children).size).toBe(children.length);
    for (const child of children) must(parents.get(child), "子目录引用的文档不存在").add(row.id);
  }
  const projects = db.prepare("SELECT id, children FROM project").all() as {
    id: number;
    children: string;
  }[];
  for (const p of projects) {
    const roots: number[] = JSON.parse(p.children);
    expect(new Set(roots).size).toBe(roots.length);
    const visiting = new Set<number>();
    const visit = (id: number) => {
      if (visiting.has(id)) throw new Error("目录成环");
      const reached = must(memberships.get(id));
      if (reached.has(p.id)) return;
      reached.add(p.id);
      visiting.add(id);
      for (const child of JSON.parse(must(items.get(id)).children)) visit(child);
      visiting.delete(id);
    };
    roots.forEach(visit);
  }
  for (const row of rows) {
    expect(JSON.parse(row.parents).sort()).toEqual([...must(parents.get(row.id))].sort());
    expect(JSON.parse(row.projects).sort()).toEqual([...must(memberships.get(row.id))].sort());
    expect(must(memberships.get(row.id)).size).toBeGreaterThan(0);
  }
  const contents = db.prepare("SELECT id,ref_count FROM content_snapshots").all() as {
    id: number;
    ref_count: number;
  }[];
  expect(new Set(contents.map(row => row.id))).toEqual(contentIds);
  expect(contents.every(row => row.ref_count === 1)).toBe(true);
}

it.runIf(process.env.TAU_DOCUMENT_TOOL_STRESS === "1").each([17, 913, 7919])(
  "共享目录在混合操作后仍与从根可达的项目一致（种子 %i）",
  async seed => {
    let state = seed;
    const random = (limit: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return Math.floor((state / 2 ** 32) * limit);
    };
    const started = performance.now();
    const projects = Array.from({ length: 4 }, (_, index) => project(String(index)));
    const shared = (await create(projects[0])).documentId;
    ProjectTable.addRefRootProjectItem(db, projects[1], shared);
    const branch = (await create(projects[0], shared)).documentId;
    let tail = branch;
    for (let i = 0; i < 96; i++) tail = (await create(projects[0], tail)).documentId;
    ProjectTable.addRefRootProjectItem(db, projects[2], tail);
    await move(branch, projects[0], shared, projects[3], 0);
    auditDirectory();

    const places = [
      ...projects.map(projectId => ({ projectId, parentId: 0 })),
      { projectId: projects[0], parentId: shared },
    ];
    const children = (place: (typeof places)[number]) =>
      place.parentId
        ? must(ProjectTable.getProjectItem(db, place.parentId)).children
        : ProjectTable.getProject(db, place.projectId).children;
    const entries = [];
    for (let i = 0; i < 100; i++) {
      const item = await create(projects[0]);
      entries.push({ id: item.documentId, place: places[0] });
    }
    let contested = 0,
      rolledBack = 0;
    for (let i = 0; i < 420; i++) {
      const entry = entries[random(entries.length)];
      const source = entry.place;
      const target = places[random(places.length)];
      const original = children(source);
      const expected = children(target).filter(id => id !== entry.id);
      const index = random(expected.length + 1);
      if (i % 29 === 0 && target !== source) {
        const snapshot = storedState();
        db.exec(
          "CREATE TEMP TRIGGER fail_late BEFORE UPDATE OF parents ON project_item BEGIN SELECT RAISE(ABORT, '注入回滚'); END"
        );
        await expect(
          move(
            entry.id,
            source.projectId,
            source.parentId,
            target.projectId,
            target.parentId,
            index
          )
        ).rejects.toThrow("注入回滚");
        db.exec("DROP TRIGGER fail_late");
        expect(storedState()).toEqual(snapshot);
        rolledBack++;
      }
      const change = () =>
        move(entry.id, source.projectId, source.parentId, target.projectId, target.parentId, index);
      if (i % 17 === 0 && target !== source) {
        const results = await Promise.allSettled([change(), change()]);
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
        contested++;
      } else await change();
      expected.splice(index, 0, entry.id);
      expect(children(target)).toEqual(expected);
      if (target !== source)
        expect(children(source)).toEqual(original.filter(id => id !== entry.id));
      entry.place = target;
      if (i % 11 === 0) {
        await remove(entry.id, target.projectId, target.parentId);
        entry.id = (await create(target.projectId, target.parentId)).documentId;
      }
      if (i % 30 === 0) auditDirectory();
    }
    for (const kind of ["card", "article"])
      for (let i = 0; i < 40; i++) {
        const key = kind + "Id";
        const entity = await run("create_" + kind, { markdown: "批量正文" });
        await run("delete_" + kind, { [key]: entity[key] });
      }
    auditDirectory();
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    console.info(
      JSON.stringify({
        seed,
        calls,
        contested,
        rolledBack,
        elapsedMs: Math.round(performance.now() - started),
      })
    );
  },
  180000
);

it.runIf(process.env.TAU_DOCUMENT_TOOL_STRESS === "1")(
  "深层子树移动到最后一个后代时中断，重新开库后可再次移动并释放",
  async () => {
    const a = project("源"),
      b = project("目的");
    const root = await create(a);
    let tail = root.documentId;
    const depth = 2400;
    for (let i = 1; i < depth; i++) tail = (await create(a, tail)).documentId;
    db.exec(`CREATE TEMP TRIGGER reject_tail BEFORE UPDATE OF projects ON project_item
    WHEN NEW.id=${tail} BEGIN SELECT RAISE(ABORT,'末端归属写入中断'); END`);
    const before = storedState();
    await expect(move(root.documentId, a, 0, b, 0)).rejects.toThrow("末端归属写入中断");
    await expect(link("document", root.documentId, b)).rejects.toThrow("末端归属写入中断");
    db.close();
    db = new Database(join(directory, databaseName));
    expect(storedState()).toEqual(before);
    const mounted = await link("document", root.documentId, b);
    expect(mounted).toMatchObject({
      changed: true,
      documentId: root.documentId,
      contentId: root.contentId,
    });
    expect(
      db
        .prepare("SELECT count(*) FROM project_item WHERE projects=?")
        .pluck()
        .get(JSON.stringify([a, b]))
    ).toBe(depth);
    expect(await remove(root.documentId, b, 0)).toMatchObject({ stillMounted: true });
    expect(
      db
        .prepare("SELECT count(*) FROM project_item WHERE projects=?")
        .pluck()
        .get(JSON.stringify([a]))
    ).toBe(depth);
    await move(root.documentId, a, 0, b, 0);
    expect(ProjectTable.getProject(db, a).children).toEqual([]);
    expect(ProjectTable.getProject(db, b).children).toEqual([root.documentId]);
    expect(
      db
        .prepare("SELECT count(*) FROM project_item WHERE projects=?")
        .pluck()
        .get(JSON.stringify([b]))
    ).toBe(depth);
    expect(ProjectTable.getProjectItem(db, root.documentId)?.contentId).toBe(root.contentId);
    const moved = storedState();
    db.exec(`CREATE TEMP TRIGGER reject_unmount BEFORE DELETE ON project_item
      WHEN OLD.id=${root.documentId} BEGIN SELECT RAISE(ABORT,'子树释放中断'); END`);
    await expect(remove(root.documentId, b, 0)).rejects.toThrow("子树释放中断");
    expect(storedState()).toEqual(moved);
    db.exec("DROP TRIGGER reject_unmount");
    await remove(root.documentId, b, 0);
    expect(db.prepare("SELECT count(*) FROM content_snapshots").pluck().get()).toBe(0);
    expect(db.prepare("SELECT count(*) FROM project_item").pluck().get()).toBe(0);
    console.info(JSON.stringify({ depth, calls }));
  },
  180000
);

it.runIf(process.env.TAU_DOCUMENT_TOOL_STRESS === "1")(
  "不同来源反复关联到共享父目录与项目根，解除后原来源独立可用",
  async () => {
    const home = project("原库中的来源项目"),
      a = project("项目甲"),
      b = project("项目乙"),
      c = project("项目丙");
    const shared = (await create(a)).documentId;
    await link("document", shared, b);
    const kinds = ["card", "article", "document"] as const;
    const refs = db.prepare("SELECT ref_count FROM contents WHERE id=?").pluck();
    const rootEntries = () => ProjectTable.getProject(db, c).children;
    const childEntries = () => must(ProjectTable.getProjectItem(db, shared)).children;
    const sources = [];
    let injected = 0;
    for (let i = 0; i < 96; i++) {
      const kind = kinds[i % kinds.length];
      const source =
        kind === "document"
          ? await create(home)
          : await run("create_" + kind, { markdown: "共享原文 " + i });
      const id = Number(source[kind + "Id"]);
      const contentId = Number(source.contentId);
      if (i % 12 < 3) {
        const before = storedState();
        db.exec(`CREATE TEMP TRIGGER fail_link BEFORE UPDATE OF children ON project WHEN NEW.id=${c}
        BEGIN SELECT RAISE(ABORT, '目录写入中断'); END`);
        await expect(link(kind, id, c)).rejects.toThrow("目录写入中断");
        db.exec("DROP TRIGGER fail_link");
        expect(storedState()).toEqual(before);
        injected++;
      }
      const atRoot = await link(kind, id, c);
      expect(atRoot).toMatchObject({ changed: true, index: i, contentId });
      const batch = await Promise.all(
        Array.from({ length: 8 }, (_, j) => link(kind, id, j % 2 ? b : a, shared))
      );
      const created = batch.filter(result => result.changed);
      expect(created).toHaveLength(1);
      const atParent = created[0];
      for (const result of batch)
        expect(result).toMatchObject({ documentId: atParent.documentId, index: i, contentId });
      if (kind === "document") {
        expect(atRoot.documentId).toBe(id);
        expect(atParent.documentId).toBe(id);
      } else {
        expect(atRoot.documentId).not.toBe(atParent.documentId);
        expect(ProjectTable.getProjectItem(db, atParent.documentId)).toMatchObject({
          refType: kind,
          refId: id,
          contentId,
        });
      }
      expect(refs.get(contentId)).toBe(kind === "document" ? 1 : 3);
      sources.push({
        kind,
        id,
        contentId,
        root: Number(atRoot.documentId),
        child: Number(atParent.documentId),
      });
    }
    expect(rootEntries()).toEqual(sources.map(source => source.root));
    expect(childEntries()).toEqual(sources.map(source => source.child));
    for (const [i, source] of sources.entries()) {
      const { kind, id, contentId, root, child } = source;
      if (i % 12 < 3) {
        const before = storedState();
        const failure =
          kind === "document"
            ? `UPDATE OF projects ON project_item WHEN NEW.id=${id}`
            : `UPDATE OF ref_count ON contents WHEN NEW.id=${contentId}`;
        db.exec(
          `CREATE TEMP TRIGGER fail_unlink BEFORE ${failure} BEGIN SELECT RAISE(ABORT, '解除中断'); END`
        );
        await expect(remove(child, b, shared)).rejects.toThrow("解除中断");
        db.exec("DROP TRIGGER fail_unlink");
        expect(storedState()).toEqual(before);
        injected++;
      }
      await remove(child, b, shared);
      expect(rootEntries()).toContain(root);
      expect(childEntries()).not.toContain(child);
      expect(refs.get(contentId)).toBe(kind === "document" ? 1 : 2);
      await remove(root, c, 0);
      expect(refs.get(contentId)).toBe(1);
      if (kind === "document")
        expect(ProjectTable.getProjectItem(db, id)).toMatchObject({
          contentId,
          projects: [home],
          parents: [],
        });
      else {
        const original =
          kind === "card" ? CardTable.getCardById(db, id) : ArticleTable.getArticleById(db, id);
        expect(original).toMatchObject({ id, contentId });
      }
    }
    expect(rootEntries()).toEqual([]);
    expect(childEntries()).toEqual([]);
    expect(ProjectTable.getProject(db, home).children).toEqual(
      sources.filter(s => s.kind === "document").map(s => s.id)
    );
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    console.info(JSON.stringify({ calls, distinctSources: sources.length, injected }));
  },
  180000
);
