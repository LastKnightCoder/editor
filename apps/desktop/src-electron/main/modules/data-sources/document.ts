import type Database from "better-sqlite3";
import { requireSourceDef } from "@/features/databases/data-sources";
import { EProjectItemType } from "@/types/project";
import ProjectTable from "../tables/project";
import type { DataSourceDefinition, SourceRow } from "./types";
import { dateValue, parseTags, selectExisting, tagPatch } from "./types";

const EMPTY_DOCUMENT = [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
const MAX_NODES = 5000;

interface ItemRow {
  id: number;
  title: string;
  created: number;
  updated: number;
  tags: string | null;
  children: string | null;
  content_id: number | null;
  words: number;
  kind: string | null;
  ref_type: string | null;
}

const parseIds = (value: string | null): number[] => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Number.isSafeInteger) : [];
  } catch {
    return [];
  }
};

const ITEM_SQL = `SELECT p.id, p.title, p.create_time AS created,
    MAX(p.update_time, IFNULL(ct.update_time, 0)) AS updated,
    p.tags, p.children, p.content_id, IFNULL(ct.count, 0) AS words,
    p.project_item_type AS kind, p.ref_type
  FROM project_item p LEFT JOIN content_snapshots ct ON ct.id = p.content_id
  WHERE p.id = ?`;

const isDocument = (row: ItemRow) =>
  (row.kind || EProjectItemType.Document) === EProjectItemType.Document && !row.ref_type;

/** 按目录树先序展开：deep 时含子文档；只收真正的文档（白板、表格、引用条目等不算） */
function walk(db: Database.Database, scope: Parameters<DataSourceDefinition["list"]>[1]) {
  const project = scope.projectId ? ProjectTable.getProjectOrNull(db, scope.projectId) : null;
  if (!project) return [];
  const read = db.prepare(ITEM_SQL);
  const result: { row: ItemRow; parent: string }[] = [];
  const seen = new Set<number>();
  const visit = (ids: number[], parent: string) => {
    for (const id of ids) {
      if (seen.has(id) || seen.size >= MAX_NODES) continue;
      seen.add(id);
      const row = read.get(id) as ItemRow | undefined;
      if (!row) continue;
      if (isDocument(row)) result.push({ row, parent });
      if (scope.deep) visit(parseIds(row.children), row.title);
    }
  };
  visit(project.children, "");
  return result;
}

export const documentSource: DataSourceDefinition = {
  def: requireSourceDef("document"),
  scopeOptions(db) {
    return {
      projects: (
        db.prepare("SELECT id, title FROM project ORDER BY update_time DESC").all() as {
          id: number;
          title: string;
        }[]
      ).map(row => ({ id: row.id, title: row.title })),
    };
  },
  ids: (db, scope) => walk(db, scope).map(entry => entry.row.id),
  list(db, scope): SourceRow[] {
    return walk(db, scope).map(({ row, parent }) => ({
      id: row.id,
      contentId: row.content_id ?? undefined,
      values: {
        title: row.title,
        parent,
        tags: parseTags(row.tags),
        created: dateValue(row.created),
        updated: dateValue(row.updated),
        words: row.words,
      },
    }));
  },
  existing: (db, ids) => selectExisting(db, "project_item", ids),
  write(db, id, patch, ctx) {
    const item = ProjectTable.getProjectItem(db, id);
    if (!item) throw new Error("文档已不存在");
    const requested = "title" in patch ? String(patch.title ?? "").trim() : undefined;
    if (requested === "") throw new Error("文档标题不能为空");
    return ProjectTable.writeProjectItemMetadata(
      db,
      {
        ...item,
        title: requested ?? item.title,
        tags: "tags" in patch ? tagPatch(patch.tags) : item.tags,
      },
      ctx,
      requested
    ).publishTitle;
  },
  create(db, scope) {
    if (!scope.projectId || !ProjectTable.getProjectOrNull(db, scope.projectId))
      throw new Error("关联的项目已不存在");
    const [, item] = ProjectTable.addRootProjectItem(db, scope.projectId, {
      title: "未命名文档",
      content: EMPTY_DOCUMENT,
      children: [],
      refType: "",
      refId: 0,
      projectItemType: EProjectItemType.Document,
      count: 0,
      whiteboardContentId: 0,
      tags: [],
    } as Parameters<typeof ProjectTable.addRootProjectItem>[2]);
    if (!item) throw new Error("新建文档失败");
    return item.id;
  },
  /** 从所有挂载处摘下再删除；有子文档时拒绝，避免连带删掉整棵子树 */
  remove(db, id) {
    const item = ProjectTable.getProjectItem(db, id);
    if (!item) return;
    if (item.children.length) throw new Error(`「${item.title}」下还有子文档，不能删除`);
    for (const projectId of item.projects) {
      const project = ProjectTable.getProjectOrNull(db, projectId);
      const index = project?.children.indexOf(id) ?? -1;
      if (!project || index < 0) continue;
      project.children.splice(index, 1);
      ProjectTable.updateProject(db, project);
    }
    for (const parentId of item.parents) {
      const parent = ProjectTable.getProjectItem(db, parentId);
      const index = parent?.children.indexOf(id) ?? -1;
      if (!parent || index < 0) continue;
      parent.children.splice(index, 1);
      ProjectTable.updateProjectItemDirectory(db, parent);
    }
    ProjectTable.deleteProjectItem(db, id);
  },
};
