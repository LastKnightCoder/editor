import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { asynchronousDatabaseCommand } from "../database-command";
import { getNextModuleEntityId } from "./module-entity-id";
import {
  Project,
  ProjectItem,
  ProjectOpenState,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem,
  EProjectItemType,
} from "@/types/project";
import Operation from "./operation";
import { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";
import { getMarkdownText, mapContentSnapshots } from "../../services/content-conversion";
import { basename } from "node:path";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import { ContentIdentityTable } from "./content-identity";
import type { ContentEntityTarget } from "@tau/db-schema/content-identities";
import { prepareCanonicalContentTitle } from "../collaboration/content-sessions";
import CardTable from "./card";
import ArticleTable from "./article";
import VideoNoteTable from "./video-note";
import WhiteBoardContentTable from "./white-board-content";
import {
  collectProjectItemSubtreeIds,
  ProjectItemOwnership,
} from "../content-ownership/project-item-content";

import log from "electron-log";

type TreeMovePosition = "top" | "bottom" | "inside";

interface MoveProjectTreeItemParams {
  dragItem: {
    itemId: number;
    parentId: number;
    isRoot: boolean;
    parentChildren: number[];
  };
  dropTargetId: number;
  dropTargetParentId: number;
  dropTargetIsRoot: boolean;
  dragPosition: TreeMovePosition;
  childInsertIndex?: number;
  insertParentId?: number;
  insertParentIsRoot?: boolean;
  insertIndex?: number;
}

const uniqueNumbers = (values: number[]) => Array.from(new Set(values));

const getAdjustedInsertIndex = ({
  children,
  dragId,
  insertIndex,
}: {
  children: number[];
  dragId: number;
  insertIndex: number;
}) => {
  const previousIndex = children.findIndex(id => id === dragId);
  const adjustedIndex =
    previousIndex >= 0 && previousIndex < insertIndex ? insertIndex - 1 : insertIndex;
  return Math.max(0, Math.min(adjustedIndex, children.length));
};

const getProjectTargetParentId = ({
  dragPosition,
  dropTargetId,
  dropTargetParentId,
  dropTargetIsRoot,
  insertParentId,
  insertParentIsRoot,
}: {
  dragPosition: TreeMovePosition;
  dropTargetId: number;
  dropTargetParentId: number;
  dropTargetIsRoot: boolean;
  insertParentId?: number;
  insertParentIsRoot?: boolean;
}) => {
  if (typeof insertParentId === "number") {
    return insertParentIsRoot ? null : insertParentId;
  }
  if (dragPosition === "inside") return dropTargetId;
  return dropTargetIsRoot ? null : dropTargetParentId;
};

export default class ProjectTable {
  static getListenEvents() {
    return {
      "create-project": this.createProject.bind(this),
      "update-project": this.updateProject.bind(this),
      "delete-project": this.deleteProject.bind(this),
      "get-project": this.getProject.bind(this),
      "get-all-projects": this.getAllProjects.bind(this),
      "update-project-item": asynchronousDatabaseCommand(
        async (db: Database.Database, item: UpdateProjectItem, ctx: CommandContext) =>
          this.updateProjectItem(db, item, ctx)
      ),
      "delete-project-item": (db: Database.Database, id: number) => this.deleteProjectItem(db, id),
      "get-project-item": this.getProjectItem.bind(this),
      "project-item:reference": this.reference.bind(this),
      "project-item:children": this.getChildren.bind(this),
      "get-project-items-by-ids": this.getProjectItemsByIds.bind(this),
      "get-project-item-by-ref": this.getProjectItemByRef.bind(this),
      "get-project-item-count-in-project": this.getProjectItemCountInProject.bind(this),
      "get-project-item-counts": this.getProjectItemCounts.bind(this),
      "project:record-open": this.recordOpen.bind(this),
      "project:open-states": this.getOpenStates.bind(this),
      "get-all-project-items-not-in-project": this.getAllProjectItemsNotInProject.bind(this),
      "is-project-item-not-in-any-project": this.isProjectItemNotInAnyProject.bind(this),
      "get-project-items-not-in-any-project": this.getProjectItemsNotInAnyProject.bind(this),
      "delete-project-items-not-in-any-project": this.deleteProjectItemsNotInAnyProject.bind(this),
      "get-all-project-items": this.getAllProjectItems.bind(this),
      "get-project-items-by-content-id": this.getProjectItemsByContentId.bind(this),
      "add-root-project-item": this.addRootProjectItem.bind(this),
      "add-child-project-item": this.addChildProjectItem.bind(this),
      "add-ref-root-project-item": this.addRefRootProjectItem.bind(this),
      "add-ref-child-project-item": this.addRefChildProjectItem.bind(this),
      "remove-root-project-item": (
        db: Database.Database,
        projectId: number,
        itemId: number,
        notDelete?: unknown
      ) => this.removeRootProjectItem(db, projectId, itemId, notDelete === true),
      "remove-child-project-item": (
        db: Database.Database,
        projectId: number,
        parentId: number,
        itemId: number,
        notDelete?: unknown
      ) => this.removeChildProjectItem(db, projectId, parentId, itemId, notDelete === true),
      "move-project-tree-item": this.moveProjectTreeItem.bind(this),
      "get-project-items-by-dates": this.getProjectItemsByDates.bind(this),
      "get-project-items-by-date-range": this.getProjectItemsByDateRange.bind(this),
      "get-project-items-content-by-ids": asynchronousDatabaseCommand(
        this.getProjectItemsContentByIds.bind(this)
      ),
    };
  }

  static parseProject(project: any): Project {
    return {
      id: project.id,
      createTime: project.create_time,
      updateTime: project.update_time,
      title: project.title,
      desc: JSON.parse(project.desc || "[]"),
      children: JSON.parse(project.children || "[]"),
      archived: Boolean(project.archived),
      pinned: Boolean(project.pinned),
    };
  }

  static parseProjectItem(item: any): ProjectItem {
    let content: Descendant[] = [];
    let count = 0;
    const contentId = item.content_id;

    if (item.content) {
      try {
        content = JSON.parse(item.content);
        count = item.count || 0;
      } catch (error) {
        console.error("Error parsing content:", error);
      }
    }

    // 使用项目条目和内容表中最大的更新时间
    const updateTime = item.content_update_time
      ? Math.max(item.update_time, item.content_update_time)
      : item.update_time;

    return {
      id: item.id,
      createTime: item.create_time,
      updateTime: updateTime,
      title: item.title,
      content: content,
      children: JSON.parse(item.children || "[]"),
      parents: JSON.parse(item.parents || "[]"),
      projects: JSON.parse(item.projects || "[]"),
      refType: item.ref_type || "",
      refId: item.ref_id || 0,
      whiteBoardContentId: item.white_board_content_id || 0,
      projectItemType: (item.project_item_type || "document") as EProjectItemType,
      count: count,
      contentId: contentId,
      tags: JSON.parse(item.tags || "[]"),
    };
  }

  static createProject(db: Database.Database, project: CreateProject): Project {
    const tx = db.transaction((createProjectPayload: CreateProject) => {
      const now = Date.now();
      const projectId = getNextModuleEntityId(db);
      const stmt = db.prepare(`
        INSERT INTO project
        (id, create_time, update_time, title, desc, children, archived, pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        projectId,
        now,
        now,
        createProjectPayload.title,
        JSON.stringify(createProjectPayload.desc || []),
        JSON.stringify(createProjectPayload.children || []),
        Number(createProjectPayload.archived || false),
        Number(createProjectPayload.pinned || false)
      );

      Operation.insertOperation(db, "project", "insert", projectId, now);
      return projectId;
    });

    const projectId = tx(project);
    return this.getProject(db, projectId);
  }

  static updateProject(db: Database.Database, project: UpdateProject): Project {
    const stmt = db.prepare(`
      UPDATE project SET
        update_time = ?,
        title = ?,
        desc = ?,
        children = ?,
        archived = ?,
        pinned = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      project.title,
      JSON.stringify(project.desc || []),
      JSON.stringify(project.children || []),
      Number(project.archived || false),
      Number(project.pinned || false),
      project.id
    );

    Operation.insertOperation(db, "project", "update", project.id, now);

    return this.getProject(db, project.id);
  }

  static deleteProject(db: Database.Database, id: number): number {
    return db.transaction(() => {
      if (!db.prepare("SELECT 1 FROM project WHERE id = ?").get(id)) return 0;
      const members = this.getProjectItemsByProjectId(db, id);
      const affected = new Map(members.map(item => [item.id, item]));
      const deleted = new Set<number>();
      for (const item of members) {
        if (item.projects.some(projectId => projectId !== id)) continue;
        if (!this.deleteProjectItem(db, item.id)) continue;
        deleted.add(item.id);
        for (const neighborId of [...item.parents, ...item.children]) {
          if (affected.has(neighborId)) continue;
          const neighbor = this.getProjectItem(db, neighborId);
          if (neighbor) affected.set(neighbor.id, neighbor);
        }
      }
      for (const item of affected.values()) {
        if (deleted.has(item.id)) continue;
        const projects = item.projects.filter(projectId => projectId !== id);
        const parents = item.parents.filter(parentId => !deleted.has(parentId));
        const children = item.children.filter(childId => !deleted.has(childId));
        if (
          projects.length === item.projects.length &&
          parents.length === item.parents.length &&
          children.length === item.children.length
        ) {
          continue;
        }
        this.updateProjectItemDirectory(db, { ...item, projects, parents, children });
      }

      Operation.insertOperation(db, "project", "delete", id, Date.now());
      return db.prepare("DELETE FROM project WHERE id = ?").run(id).changes;
    })();
  }

  static getProject(db: Database.Database, id: number): Project {
    const project = this.getProjectOrNull(db, id);
    if (!project) throw new Error(`项目 ${id} 不存在`);
    return project;
  }

  static getProjectOrNull(db: Database.Database, id: number): Project | null {
    const stmt = db.prepare("SELECT * FROM project WHERE id = ?");
    const project = stmt.get(id);
    return project ? this.parseProject(project) : null;
  }

  static getAllProjects(db: Database.Database): Project[] {
    const stmt = db.prepare("SELECT * FROM project ORDER BY create_time DESC");
    const projects = stmt.all();
    return projects.map(p => this.parseProject(p));
  }

  static updateProjectItem(
    db: Database.Database,
    item: UpdateProjectItem,
    ctx: CommandContext = fallbackCommandContext
  ): ProjectItem | null {
    const { saved, publishTitle } = db.transaction(() =>
      this.writeProjectItemMetadata(db, item, ctx, item.title)
    )();
    publishTitle?.();
    return saved;
  }

  static writeProjectItemMetadata(
    db: Database.Database,
    item: UpdateProjectItem,
    ctx: CommandContext,
    requestedTitle: string | undefined
  ): { saved: ProjectItem | null; publishTitle?: () => void } {
    const title = prepareCanonicalContentTitle(db, item.contentId, requestedTitle);

    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        title = ?,
        children = ?,
        parents = ?,
        projects = ?,
        ref_type = ?,
        ref_id = ?,
        project_item_type = ?,
        tags = COALESCE(?, tags)
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      title.title ?? item.title,
      JSON.stringify(item.children ?? []),
      JSON.stringify(item.parents ?? []),
      JSON.stringify(item.projects ?? []),
      item.refType,
      item.refId,
      item.projectItemType || item.projectItemType,
      item.tags === undefined ? null : JSON.stringify(item.tags),
      item.id
    );

    Operation.insertOperation(db, "project-item", "update", item.id, now);
    this.broadcastProjectItemUpdated(db, item, ctx);
    return { saved: this.getProjectItem(db, item.id), publishTitle: title.publish };
  }

  static updateProjectItemDirectory(db: Database.Database, item: ProjectItem): ProjectItem | null {
    const now = Date.now();
    db.prepare(
      "UPDATE project_item SET update_time = ?, children = ?, parents = ?, projects = ? WHERE id = ?"
    ).run(
      now,
      JSON.stringify(item.children),
      JSON.stringify(item.parents),
      JSON.stringify(item.projects),
      item.id
    );
    Operation.insertOperation(db, "project-item", "update", item.id, now);
    this.broadcastProjectItemUpdated(db, item, fallbackCommandContext);
    return this.getProjectItem(db, item.id);
  }

  private static broadcastProjectItemUpdated(
    db: Database.Database,
    item: UpdateProjectItem,
    ctx: CommandContext
  ): void {
    ctx.broadcastOthers("project-item:updated", {
      databaseName: basename(db.name),
      projectItemId: item.id,
    });

    if (item.refType === "card" && item.refId) {
      ctx.broadcastOthers("card:updated", { databaseName: basename(db.name), cardId: item.refId });
    }

    if (item.refType === "article" && item.refId) {
      ctx.broadcastOthers("article:updated", {
        databaseName: basename(db.name),
        articleId: item.refId,
      });
    }
  }

  /** deferContent：正文只延迟释放（插件删除，宽限期内可恢复） */
  static deleteProjectItem(
    db: Database.Database,
    id: number,
    options: { deferContent?: boolean } = {}
  ): boolean {
    return this.itemOwnership(db).deleteItem(id, options.deferContent ? "deferred" : "immediate");
  }

  private static removeProjectItemRow(db: Database.Database, id: number): boolean {
    const deleted = db.prepare("DELETE FROM project_item WHERE id = ?").run(id).changes > 0;
    if (deleted) ContentIdentityTable.retire(db, "project-item", id);
    return deleted;
  }

  private static cleanupDeletedItem(db: Database.Database, item: ProjectItem): void {
    if (item.projectItemType === EProjectItemType.VideoNote) {
      VideoNoteTable.deleteVideoNote(db, item.refId);
    }
    if (item.projectItemType === EProjectItemType.WhiteBoard && item.whiteBoardContentId) {
      WhiteBoardContentTable.deleteWhiteboard(db, item.whiteBoardContentId);
    }
    FTSTable.removeIndexByIdAndType(db, item.id, "project-item");
    VecDocumentTable.removeIndexByIdAndType(db, item.id, "project-item");
    Operation.insertOperation(db, "project-item", "delete", item.id, Date.now());
  }

  static reference(db: Database.Database, id: number) {
    return ContentIdentityTable.reference(db, "project-item", id);
  }

  static getChildren(db: Database.Database, target: ContentEntityTarget) {
    return db.transaction(() => {
      const parent = this.getProjectItem(db, target);
      if (!parent) return [];
      return parent.children.flatMap(id => {
        const item = this.getProjectItem(db, id);
        return item ? [{ item, reference: this.reference(db, id) }] : [];
      });
    })();
  }

  static getProjectItem(db: Database.Database, target: ContentEntityTarget): ProjectItem | null {
    const id = ContentIdentityTable.requireTarget(db, "project-item", target);
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
      WHERE pi.id = ?
    `);
    const item = stmt.get(id);
    if (!item) {
      return null;
    }
    return this.parseProjectItem(item);
  }

  static getProjectItemsByProjectId(db: Database.Database, projectId: number): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
      WHERE 1=1 AND EXISTS (
        SELECT 1 FROM json_each(pi.projects)
        WHERE value = ?
      )
    `);
    const items = stmt.all(projectId);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemsByIds(db: Database.Database, ids: number[]): ProjectItem[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT pi.*, c.content, c.count, c.update_time as content_update_time
       FROM project_item pi
       LEFT JOIN content_snapshots c ON pi.content_id = c.id
       WHERE pi.id IN (${placeholders})`
    );
    const items = stmt.all(ids);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemByRef(db: Database.Database, refType: string, refId: number): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
      WHERE pi.ref_type = ? AND pi.ref_id = ?
    `);
    const items = stmt.all(refType, refId);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemCountInProject(db: Database.Database, projectId: number): number {
    const stmt = db.prepare(`
      SELECT COUNT(*) FROM project_item
      WHERE EXISTS (
        SELECT 1 FROM json_each(projects)
        WHERE value = ?
      )
    `);
    const result = stmt.get(projectId) as { "COUNT(*)": number };
    return result["COUNT(*)"];
  }

  /** 全部项目的条目计数（含文档树深层节点——projects 数组逐层登记）：一条聚合供列表页消费 */
  static getProjectItemCounts(db: Database.Database): Record<number, number> {
    const stmt = db.prepare(`
      SELECT je.value AS projectId, COUNT(*) AS count
      FROM project_item pi, json_each(pi.projects) je
      GROUP BY je.value
    `);
    const rows = stmt.all() as { projectId: number; count: number }[];
    return Object.fromEntries(rows.map(row => [row.projectId, row.count]));
  }

  // 打开记录不是内容修改：不动 update_time（列表「最近更新」口径），也不记 operation。
  // itemId 缺省（从列表进入、未定位文档）时保留上次停留的文档
  static recordOpen(db: Database.Database, projectId: number, itemId?: number | null): void {
    db.prepare(
      "UPDATE project SET last_open_time = ?, last_open_item_id = COALESCE(?, last_open_item_id) WHERE id = ?"
    ).run(Date.now(), itemId ?? null, projectId);
  }

  /** 打开过的项目：projectId → 打开时间 + 上次停留的文档（文档已删除或移出项目时为 null） */
  static getOpenStates(db: Database.Database): Record<number, ProjectOpenState> {
    const rows = db
      .prepare(
        `SELECT p.id AS projectId, p.last_open_time AS openedAt, pi.id AS itemId, pi.title AS itemTitle
         FROM project p
         LEFT JOIN project_item pi ON pi.id = p.last_open_item_id
           AND EXISTS (SELECT 1 FROM json_each(pi.projects) je WHERE je.value = p.id)
         WHERE p.last_open_time IS NOT NULL`
      )
      .all() as Array<{
      projectId: number;
      openedAt: number;
      itemId: number | null;
      itemTitle: string | null;
    }>;
    return Object.fromEntries(rows.map(({ projectId, ...state }) => [projectId, state]));
  }

  static getAllProjectItemsNotInProject(db: Database.Database, projectId: number): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
      WHERE json_array_length(pi.projects) = 0
      OR NOT EXISTS (
        SELECT 1 FROM json_each(pi.projects)
        WHERE value = ?
      )
    `);
    const items = stmt.all(projectId);
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemsNotInAnyProject(db: Database.Database): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
      WHERE pi.projects = '[]'
    `);
    const items = stmt.all();
    log.info(`获取不在任何项目中的条目: count=${items.length}`);
    return items.map(item => this.parseProjectItem(item));
  }

  static isProjectItemNotInAnyProject(db: Database.Database, id: number): boolean {
    const stmt = db.prepare("SELECT projects FROM project_item WHERE id = ?");
    const result = stmt.get(id) as { projects: string };
    return result.projects === "[]";
  }

  static deleteProjectItemsNotInAnyProject(db: Database.Database): number {
    const toDeleteItems = this.getProjectItemsNotInAnyProject(db);
    for (const deleteItem of toDeleteItems) {
      this.deleteProjectItem(db, deleteItem.id);
    }
    log.info(`删除不在任何项目中的条目: ${toDeleteItems.map(item => item.id)}`);
    return toDeleteItems.length;
  }

  static async deleteProjectItemByRef(
    db: Database.Database,
    refType: string,
    refId: number
  ): Promise<void> {
    // 获取refType为refType，refId为refId的project_item信息
    const itemInfo = this.getProjectItemByRef(db, refType, refId);
    if (itemInfo && itemInfo.length > 0) {
      for (const item of itemInfo) {
        this.deleteProjectItem(db, item.id);
      }
    }
  }

  static resetProjectItemRef(db: Database.Database, refType: string, refId: number) {
    const stmt = db.prepare(`
      UPDATE project_item
      SET ref_type = '', ref_id = 0 
      WHERE ref_type = ? AND ref_id = ?
    `);
    stmt.run(refType, refId);
  }

  static getAllProjectItems(db: Database.Database): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
    `);
    const items = stmt.all();
    return items.map(item => this.parseProjectItem(item));
  }

  static getProjectItemsByContentId(db: Database.Database, contentId: number): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN content_snapshots c ON pi.content_id = c.id
      WHERE pi.content_id = ?
      ORDER BY pi.update_time DESC, pi.id DESC
    `);
    const items = stmt.all(contentId);
    return items.map(item => this.parseProjectItem(item));
  }

  static addRootProjectItem(
    db: Database.Database,
    projectId: number,
    projectItem: CreateProjectItem
  ): [Project, ProjectItem | null] {
    return this.itemOwnership(db).addRoot(projectId, projectItem);
  }

  static addChildProjectItem(
    db: Database.Database,
    parentProjectItemId: number,
    projectItem: CreateProjectItem
  ): [ProjectItem | null, ProjectItem | null] | null {
    return this.itemOwnership(db).addChild(parentProjectItemId, projectItem);
  }

  static addRefRootProjectItem(
    db: Database.Database,
    projectId: number,
    projectItemId: number
  ): [Project, ProjectItem | null] | null {
    return this.itemOwnership(db).mountRoot(projectId, projectItemId);
  }

  static addRefChildProjectItem(
    db: Database.Database,
    parentProjectItemId: number,
    projectItemId: number
  ): [ProjectItem | null, ProjectItem | null] | null {
    return this.itemOwnership(db).mountChild(parentProjectItemId, projectItemId);
  }

  static removeRootProjectItem(
    db: Database.Database,
    projectId: number,
    projectItemId: number,
    notDelete?: boolean
  ): [Project, ProjectItem | null] | null {
    return this.itemOwnership(db).removeRoot(projectId, projectItemId, notDelete);
  }

  static removeChildProjectItem(
    db: Database.Database,
    projectId: number,
    parentProjectItemId: number,
    projectItemId: number,
    notDelete?: boolean
  ): [ProjectItem | null, ProjectItem | null] | null {
    return this.itemOwnership(db).removeChild(
      projectId,
      parentProjectItemId,
      projectItemId,
      notDelete
    );
  }

  private static itemOwnership(db: Database.Database): ProjectItemOwnership {
    return new ProjectItemOwnership({
      transaction: apply => db.transaction(apply)(),
      readProject: id => this.getProject(db, id),
      readItem: id => this.getProjectItem(db, id),
      writeProject: project => this.updateProject(db, project),
      writeDirectoryItem: item => this.updateProjectItemDirectory(db, item),
      insertItem: (item, contentId, placement) =>
        this.insertProjectItem(db, item, contentId, placement),
      removeItemRow: id => this.removeProjectItemRow(db, id),
      cleanupDeletedItem: item => this.cleanupDeletedItem(db, item),
      recordMount: id => Operation.insertOperation(db, "project-item", "insert", id, Date.now()),
      updateSubtreeMembership: (id, source, target) =>
        this.updateProjectSubtreeMembership(db, id, source, target, []),
      findReferencedContent: (type, id) => {
        if (type === "content") return ContentTable.getContentById(db, id)?.id;
        if (type === "card") return CardTable.getCardById(db, id)?.contentId;
        return ArticleTable.getArticleById(db, id)?.contentId;
      },
      createContent: item =>
        ContentTable.createContent(db, {
          content: item.content,
          contracts: item.contracts,
          count: item.count ?? getContentLength(item.content),
        }),
      addReference: id => ContentTable.incrementRefCount(db, id),
      releaseReference: (id, mode) => {
        if (mode === "deferred") ContentTable.releaseDeferred(db, id);
        else ContentTable.deleteContent(db, id);
      },
    });
  }

  private static insertProjectItem(
    db: Database.Database,
    projectItem: CreateProjectItem,
    contentId: number,
    placement: { parents: number[]; projects: number[] }
  ): number {
    if (
      projectItem.refType === "white-board" &&
      projectItem.whiteBoardContentId &&
      projectItem.projectItemType === EProjectItemType.WhiteBoard
    ) {
      WhiteBoardContentTable.incrementRefCount(db, projectItem.whiteBoardContentId);
    }
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO project_item
      (create_time, update_time, title, content_id, children, parents, projects, ref_type, ref_id, white_board_content_id, project_item_type, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      now,
      now,
      projectItem.title,
      contentId,
      JSON.stringify(projectItem.children || []),
      JSON.stringify(placement.parents),
      JSON.stringify(placement.projects),
      projectItem.refType,
      projectItem.refId || 0,
      projectItem.whiteBoardContentId || 0,
      projectItem.projectItemType || EProjectItemType.Document,
      JSON.stringify(projectItem.tags ?? [])
    );
    const id = Number(result.lastInsertRowid);
    Operation.insertOperation(db, "project-item", "insert", id, now);
    return id;
  }

  private static isProjectItemDescendant(
    db: Database.Database,
    ancestorId: number,
    maybeDescendantId: number
  ) {
    return collectProjectItemSubtreeIds(ancestorId, id => this.getProjectItem(db, id))
      .slice(1)
      .includes(maybeDescendantId);
  }

  private static getProjectMoveParentChildren(
    db: Database.Database,
    projectId: number,
    parentId: number | null
  ) {
    if (parentId === null) {
      return this.getProject(db, projectId).children;
    }
    return this.getProjectItem(db, parentId)?.children;
  }

  private static canMoveProjectTreeItem(
    db: Database.Database,
    projectId: number,
    params: MoveProjectTreeItemParams
  ) {
    const { dragItem, dropTargetId, dragPosition } = params;
    const { itemId: dragId, parentId: dragParentId, isRoot: dragIsRoot } = dragItem;

    if (dragId === dropTargetId) return false;

    const dragProjectItem = this.getProjectItem(db, dragId);
    if (!dragProjectItem) return false;

    const sourceChildren = this.getProjectMoveParentChildren(
      db,
      projectId,
      dragIsRoot ? null : dragParentId
    );
    if (!sourceChildren?.includes(dragId)) return false;

    const targetParentId = getProjectTargetParentId(params);
    if (targetParentId === dragId) return false;
    if (
      typeof targetParentId === "number" &&
      this.isProjectItemDescendant(db, dragId, targetParentId)
    ) {
      return false;
    }
    if (
      targetParentId === null &&
      dragPosition !== "inside" &&
      this.isProjectItemDescendant(db, dragId, dropTargetId)
    ) {
      return false;
    }

    const targetChildren = this.getProjectMoveParentChildren(db, projectId, targetParentId);
    if (!targetChildren) return false;

    if (targetParentId !== (dragIsRoot ? null : dragParentId) && targetChildren.includes(dragId)) {
      return false;
    }

    if (
      dragPosition !== "inside" &&
      typeof params.insertParentId !== "number" &&
      !targetChildren.includes(dropTargetId)
    ) {
      return false;
    }

    return true;
  }

  private static getMovedProjectMembership({
    currentProjects,
    sourceProjects,
    targetProjects,
    retainedSourceProjects,
  }: {
    currentProjects: number[];
    sourceProjects: number[];
    targetProjects: number[];
    retainedSourceProjects: number[];
  }) {
    const retainedSourceProjectSet = new Set(retainedSourceProjects);
    const removableSourceProjectSet = new Set(
      sourceProjects.filter(id => !retainedSourceProjectSet.has(id))
    );
    return uniqueNumbers([
      ...currentProjects.filter(id => !removableSourceProjectSet.has(id)),
      ...targetProjects,
    ]);
  }

  private static updateProjectSubtreeMembership(
    db: Database.Database,
    rootProjectItemId: number,
    sourceProjects: number[],
    targetProjects: number[],
    retainedSourceProjects: number[]
  ) {
    const subtreeIds = collectProjectItemSubtreeIds(rootProjectItemId, id =>
      this.getProjectItem(db, id)
    );
    const subtreeIdSet = new Set(subtreeIds);
    const retainedSourceByItem = new Map<number, Set<number>>(
      subtreeIds.map(id => [id, new Set<number>()])
    );
    retainedSourceProjects.forEach(projectId => {
      retainedSourceByItem.get(rootProjectItemId)?.add(projectId);
    });

    subtreeIds.forEach(projectItemId => {
      const projectItem = this.getProjectItem(db, projectItemId);
      if (!projectItem) return;
      projectItem.parents
        .filter(parentId => !subtreeIdSet.has(parentId))
        .forEach(parentId => {
          const parent = this.getProjectItem(db, parentId);
          if (!parent?.children.includes(projectItemId)) return;
          parent.projects.forEach(projectId => {
            retainedSourceByItem.get(projectItemId)?.add(projectId);
          });
        });
      sourceProjects.forEach(sourceProjectId => {
        const sourceProject = this.getProjectOrNull(db, sourceProjectId);
        if (sourceProject?.children.includes(projectItemId)) {
          retainedSourceByItem.get(projectItemId)?.add(sourceProjectId);
        }
      });
    });

    let changed = true;
    while (changed) {
      changed = false;
      subtreeIds.forEach(projectItemId => {
        const projectItem = this.getProjectItem(db, projectItemId);
        const parentRetainedProjects = retainedSourceByItem.get(projectItemId);
        if (!projectItem || !parentRetainedProjects) return;
        projectItem.children
          .filter(childId => subtreeIdSet.has(childId))
          .forEach(childId => {
            const childRetainedProjects = retainedSourceByItem.get(childId);
            if (!childRetainedProjects) return;
            parentRetainedProjects.forEach(projectId => {
              if (childRetainedProjects.has(projectId)) return;
              childRetainedProjects.add(projectId);
              changed = true;
            });
          });
      });
    }

    subtreeIds.forEach(projectItemId => {
      const projectItem = this.getProjectItem(db, projectItemId);
      if (!projectItem) return;
      const nextProjects = this.getMovedProjectMembership({
        currentProjects: projectItem.projects,
        sourceProjects,
        targetProjects,
        retainedSourceProjects: Array.from(retainedSourceByItem.get(projectItemId) || []),
      });
      if (JSON.stringify(nextProjects) === JSON.stringify(projectItem.projects)) {
        return;
      }
      this.updateProjectItemDirectory(db, {
        ...projectItem,
        projects: nextProjects,
      });
    });
  }

  static moveProjectTreeItem(
    db: Database.Database,
    projectId: number,
    params: MoveProjectTreeItemParams
  ) {
    const {
      dragItem,
      dropTargetId,
      dropTargetParentId,
      dropTargetIsRoot,
      dragPosition,
      childInsertIndex,
      insertParentId,
      insertParentIsRoot,
      insertIndex,
    } = params;
    const { itemId: dragId, parentId: dragParentId, isRoot: dragIsRoot } = dragItem;
    const dragProjectItem = this.getProjectItem(db, dragId);
    if (!dragProjectItem) return null;
    if (!this.canMoveProjectTreeItem(db, projectId, params)) return null;

    const tx = db.transaction(() => {
      const sourceProjectIds = dragIsRoot
        ? [projectId]
        : this.getProjectItem(db, dragParentId)?.projects || [];
      const targetProjectIds =
        typeof insertParentId === "number"
          ? insertParentIsRoot
            ? [projectId]
            : this.getProjectItem(db, insertParentId)?.projects || []
          : dragPosition === "inside"
            ? this.getProjectItem(db, dropTargetId)?.projects || []
            : dropTargetIsRoot
              ? [projectId]
              : this.getProjectItem(db, dropTargetParentId)?.projects || [];
      if (targetProjectIds.length === 0) return null;

      const retainedSourceProjectIds = new Set<number>();
      dragProjectItem.parents
        .filter(parentId => parentId !== dragParentId)
        .forEach(parentId => {
          this.getProjectItem(db, parentId)?.projects.forEach(parentProjectId =>
            retainedSourceProjectIds.add(parentProjectId)
          );
        });

      if (dragIsRoot) {
        const project = this.getProject(db, projectId);
        if (!project.children.includes(dragId)) return null;
        project.children = project.children.filter(id => id !== dragId);
        this.updateProject(db, project);
      } else {
        const sourceParent = this.getProjectItem(db, dragParentId);
        if (!sourceParent?.children.includes(dragId)) return null;
        sourceParent.children = sourceParent.children.filter(id => id !== dragId);
        this.updateProjectItemDirectory(db, sourceParent);
      }

      const nextDragProjectItem = this.getProjectItem(db, dragId);
      if (!nextDragProjectItem) return null;
      nextDragProjectItem.parents = nextDragProjectItem.parents.filter(
        parentId => parentId !== dragParentId
      );

      if (typeof insertParentId === "number" && typeof insertIndex === "number") {
        if (insertParentIsRoot) {
          const project = this.getProject(db, projectId);
          const sourceChildren = dragIsRoot ? dragItem.parentChildren : project.children;
          project.children = project.children.filter(id => id !== dragId);
          project.children.splice(
            getAdjustedInsertIndex({
              children: sourceChildren,
              dragId,
              insertIndex,
            }),
            0,
            dragId
          );
          this.updateProject(db, project);
        } else {
          const targetParent = this.getProjectItem(db, insertParentId);
          if (!targetParent) {
            throw new Error("Project tree move target parent no longer exists");
          }
          const sourceChildren =
            dragParentId === insertParentId ? dragItem.parentChildren : targetParent.children;
          targetParent.children = targetParent.children.filter(id => id !== dragId);
          targetParent.children.splice(
            getAdjustedInsertIndex({
              children: sourceChildren,
              dragId,
              insertIndex,
            }),
            0,
            dragId
          );
          this.updateProjectItemDirectory(db, targetParent);
          if (!nextDragProjectItem.parents.includes(insertParentId)) {
            nextDragProjectItem.parents.push(insertParentId);
          }
        }
      } else if (dragPosition === "inside") {
        const targetItem = this.getProjectItem(db, dropTargetId);
        if (!targetItem) {
          throw new Error("Project tree move target no longer exists");
        }
        const sourceChildren =
          dragParentId === dropTargetId ? dragItem.parentChildren : targetItem.children;
        targetItem.children = targetItem.children.filter(id => id !== dragId);
        if (typeof childInsertIndex === "number") {
          targetItem.children.splice(
            getAdjustedInsertIndex({
              children: sourceChildren,
              dragId,
              insertIndex: childInsertIndex,
            }),
            0,
            dragId
          );
        } else {
          targetItem.children.push(dragId);
        }
        this.updateProjectItemDirectory(db, targetItem);
        if (!nextDragProjectItem.parents.includes(dropTargetId)) {
          nextDragProjectItem.parents.push(dropTargetId);
        }
      } else if (dropTargetIsRoot) {
        const project = this.getProject(db, projectId);
        project.children = project.children.filter(id => id !== dragId);
        const targetIndex = project.children.findIndex(id => id === dropTargetId);
        if (targetIndex === -1) {
          throw new Error("Project tree move target no longer exists");
        }
        project.children.splice(dragPosition === "top" ? targetIndex : targetIndex + 1, 0, dragId);
        this.updateProject(db, project);
      } else {
        const targetParent = this.getProjectItem(db, dropTargetParentId);
        if (!targetParent?.children.includes(dropTargetId)) {
          throw new Error("Project tree move target parent no longer contains target");
        }
        targetParent.children = targetParent.children.filter(id => id !== dragId);
        const targetIndex = targetParent.children.findIndex(id => id === dropTargetId);
        if (targetIndex === -1) {
          throw new Error("Project tree move target no longer exists");
        }
        targetParent.children.splice(
          dragPosition === "top" ? targetIndex : targetIndex + 1,
          0,
          dragId
        );
        this.updateProjectItemDirectory(db, targetParent);
        if (!nextDragProjectItem.parents.includes(dropTargetParentId)) {
          nextDragProjectItem.parents.push(dropTargetParentId);
        }
      }

      this.updateProjectItemDirectory(db, nextDragProjectItem);
      this.updateProjectSubtreeMembership(
        db,
        dragId,
        sourceProjectIds,
        targetProjectIds,
        Array.from(retainedSourceProjectIds)
      );

      return {
        movedItemId: dragId,
        refreshItemIds: uniqueNumbers([
          dragId,
          dragParentId,
          dropTargetId,
          dropTargetParentId,
          insertParentId ?? 0,
        ]).filter(id => id > 0),
      };
    });

    return tx();
  }

  // 批量日期查询项目条目
  static getProjectItemsByDates(
    db: Database.Database,
    dates: string[]
  ): Record<string, ProjectItem[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT pi.*, ct.content, ct.count
      FROM project_item pi
      LEFT JOIN content_snapshots ct ON pi.content_id = ct.id
      WHERE date(pi.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY pi.update_time DESC
    `);

    const items = stmt.all(...dates).map(item => this.parseProjectItem(item));
    const result: Record<string, ProjectItem[]> = {};

    items.forEach(item => {
      const date = new Date(item.updateTime).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(item);
    });

    return result;
  }

  // 日期范围查询项目条目
  static getProjectItemsByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string
  ): Record<string, ProjectItem[]> {
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate + " 23:59:59").getTime();

    const stmt = db.prepare(`
      SELECT pi.*, ct.content, ct.count
      FROM project_item pi
      LEFT JOIN content_snapshots ct ON pi.content_id = ct.id
      WHERE pi.update_time >= ? AND pi.update_time <= ?
      ORDER BY pi.update_time DESC
    `);

    const items = stmt.all(startTimestamp, endTimestamp).map(item => this.parseProjectItem(item));
    const result: Record<string, ProjectItem[]> = {};

    items.forEach(item => {
      const date = new Date(item.updateTime).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(item);
    });

    return result;
  }

  // 获取项目条目内容（转换为 Markdown）
  static async getProjectItemsContentByIds(
    db: Database.Database,
    ids: number[],
    maxLength?: number
  ): Promise<
    Array<{
      id: number;
      markdown: string;
      truncated: boolean;
      originalLength: number;
      metadata: Record<string, any>;
    }>
  > {
    if (ids.length === 0) return [];

    const items = this.getProjectItemsByIds(db, ids);

    return mapContentSnapshots(items, async item => {
      const snapshot = ContentTable.getContentById(db, item.contentId);
      const markdown = snapshot ? await getMarkdownText(snapshot.content, snapshot.contracts) : "";
      const originalLength = markdown.length;

      let finalMarkdown = markdown;
      let truncated = false;

      if (maxLength && markdown.length > maxLength) {
        let truncatedMd = markdown.substring(0, maxLength);
        const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
        let bestBreak = -1;

        for (const bp of breakPoints) {
          const idx = truncatedMd.lastIndexOf(bp);
          if (idx > maxLength * 0.8) {
            bestBreak = idx + bp.length;
            break;
          }
        }

        if (bestBreak > 0) {
          truncatedMd = truncatedMd.substring(0, bestBreak);
        }

        finalMarkdown = truncatedMd + "\n\n[内容已截断...]";
        truncated = true;
      }

      return {
        id: item.id,
        markdown: finalMarkdown,
        truncated,
        originalLength,
        metadata: {
          title: item.title,
          projects: item.projects,
          createTime: item.createTime,
          updateTime: item.updateTime,
          wordCount: item.count || 0,
        },
      };
    });
  }
}
