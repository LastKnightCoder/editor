import Database from "better-sqlite3";
import {
  Project,
  ProjectItem,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem,
  EProjectItemType,
} from "@/types/project";
import Operation from "./operation";
import { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";
import { getMarkdown } from "@/utils/markdown.ts";
import { basename } from "node:path";
import { BrowserWindow } from "electron";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import CardTable from "./card";
import ArticleTable from "./article";
import VideoNoteTable from "./video-note";
import WhiteBoardContentTable from "./white-board-content";
import WhiteBoardTable from "./whiteboard";

import log from "electron-log";

export default class ProjectTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        desc TEXT,
        children TEXT,
        archived INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS project_item (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        title TEXT NOT NULL,
        content_id INTEGER DEFAULT 0,
        children TEXT,
        parents TEXT,
        projects TEXT,
        ref_type TEXT,
        ref_id INTEGER,
        white_board_content_id INTEGER DEFAULT 0,
        project_item_type TEXT DEFAULT 'document'
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    // 取消 content_id 的外键约束，修改为 content_id INTEGER DEFAULT 0
    // 先判断是否存在外键约束
    this.migrateProjectItemTable(db);

    const tableInfoStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_item'",
    );
    const tableInfo = tableInfoStmt.get() as { sql: string };
    if (!tableInfo.sql.includes("white_board_content_id")) {
      db.exec(`
        ALTER TABLE project_item ADD COLUMN white_board_content_id INTEGER
      `);
    }

    // 为所有项目条目添加 FTS 索引
    log.info("开始为所有项目条目添加 FTS 索引");
    const projectItems = this.getAllProjectItems(db);
    for (const item of projectItems) {
      // 跳过白板和视频笔记
      if (item.refType === "video-note") continue;

      if (
        item.projectItemType === EProjectItemType.WhiteBoard &&
        // @ts-ignore
        item.whiteBoardData &&
        // @ts-ignore
        JSON.stringify(item.whiteBoardData) !== "{}"
      ) {
        if (item.refId && item.refType === "white-board") {
          const whiteboard = WhiteBoardTable.getWhiteboard(db, item.refId);
          if (whiteboard && whiteboard.whiteBoardContentIds.length > 0) {
            item.whiteBoardContentId = whiteboard.whiteBoardContentIds[0];
            WhiteBoardContentTable.incrementRefCount(
              db,
              item.whiteBoardContentId,
            );
          } else {
            const whiteboardContent =
              WhiteBoardContentTable.createWhiteboardContent(db, {
                // @ts-ignore
                data: item.whiteBoardData,
                name: item.title,
              });
            item.whiteBoardContentId = whiteboardContent.id;
          }
        } else {
          const whiteboardContent =
            WhiteBoardContentTable.createWhiteboardContent(db, {
              // @ts-ignore
              data: item.whiteBoardData,
              name: item.title,
            });
          item.whiteBoardContentId = whiteboardContent.id;
        }

        const updateWhiteBoardContentIdStmt = db.prepare(`
          UPDATE project_item SET white_board_content_id = ? WHERE id = ?
        `);
        updateWhiteBoardContentIdStmt.run(item.whiteBoardContentId, item.id);
      }

      if (!item.content || !item.content.length) continue;

      // 检查是否已有索引或索引是否过期
      const indexInfo = FTSTable.checkIndexExists(db, item.id, "project-item");

      // 如果索引不存在或已过期，则添加/更新索引
      if (!indexInfo || indexInfo.updateTime < item.updateTime) {
        FTSTable.indexContent(db, {
          id: item.id,
          content: getMarkdown(item.content),
          type: "project-item",
          updateTime: item.updateTime,
        });
        log.info(`已为项目条目 ${item.id} 添加/更新 FTS 索引`);
      }
    }

    // 删除 white-board-data
    if (tableInfo.sql.includes("white_board_data")) {
      db.exec(`
        ALTER TABLE project_item DROP COLUMN white_board_data
      `);
    }
    // 删除不在任何项目中的条目
    this.deleteProjectItemsNotInAnyProject(db);
  }

  static migrateProjectItemTable(db: Database.Database) {
    // 检查表结构中是否存在外键约束
    const tableInfoStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_item'",
    );
    const tableInfo = tableInfoStmt.get() as { sql: string };

    // 如果表定义中包含外键约束关系，则进行迁移
    if (
      tableInfo &&
      tableInfo.sql &&
      tableInfo.sql.includes("FOREIGN KEY(content_id)")
    ) {
      log.info("开始迁移 project_item 表，移除 content_id 的外键约束");

      // 开始事务并关闭外键约束
      db.exec("BEGIN TRANSACTION;");
      db.exec("PRAGMA foreign_keys = OFF;");

      // 创建新表结构，不包含外键约束
      db.exec(`
        CREATE TABLE project_item_new (
          id INTEGER PRIMARY KEY,
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL,
          title TEXT NOT NULL,
          content_id INTEGER DEFAULT 0,
          children TEXT,
          parents TEXT,
          projects TEXT,
          ref_type TEXT,
          ref_id INTEGER,
          white_board_content_id INTEGER DEFAULT 0,
          project_item_type TEXT DEFAULT 'document'
        )
      `);

      // 迁移数据
      db.exec(`
        INSERT INTO project_item_new
        SELECT 
          id, 
          create_time,
          update_time,
          title,
          content_id,
          children,
          parents,
          projects,
          ref_type,
          ref_id,
          white_board_content_id,
          project_item_type
        FROM project_item
      `);

      // 替换表
      db.exec("DROP TABLE project_item;");
      db.exec("ALTER TABLE project_item_new RENAME TO project_item;");

      // 完成事务
      db.exec("PRAGMA foreign_keys = ON;");
      db.exec("COMMIT;");

      log.info("project_item 表迁移完成，已移除 content_id 的外键约束");
    } else {
      log.info("project_item 表不存在外键约束或已经迁移过，跳过迁移步骤");
    }
  }

  static getListenEvents() {
    return {
      "create-project": this.createProject.bind(this),
      "update-project": this.updateProject.bind(this),
      "delete-project": this.deleteProject.bind(this),
      "get-project": this.getProject.bind(this),
      "get-all-projects": this.getAllProjects.bind(this),
      "update-project-item": this.updateProjectItem.bind(this),
      "delete-project-item": this.deleteProjectItem.bind(this),
      "get-project-item": this.getProjectItem.bind(this),
      "get-project-items-by-ids": this.getProjectItemsByIds.bind(this),
      "get-project-item-by-ref": this.getProjectItemByRef.bind(this),
      "get-project-item-count-in-project":
        this.getProjectItemCountInProject.bind(this),
      "get-all-project-items-not-in-project":
        this.getAllProjectItemsNotInProject.bind(this),
      "is-project-item-not-in-any-project":
        this.isProjectItemNotInAnyProject.bind(this),
      "get-project-items-not-in-any-project":
        this.getProjectItemsNotInAnyProject.bind(this),
      "delete-project-items-not-in-any-project":
        this.deleteProjectItemsNotInAnyProject.bind(this),
      "get-all-project-items": this.getAllProjectItems.bind(this),
      "add-root-project-item": this.addRootProjectItem.bind(this),
      "add-child-project-item": this.addChildProjectItem.bind(this),
      "add-ref-root-project-item": this.addRefRootProjectItem.bind(this),
      "add-ref-child-project-item": this.addRefChildProjectItem.bind(this),
      "remove-root-project-item": this.removeRootProjectItem.bind(this),
      "remove-child-project-item": this.removeChildProjectItem.bind(this),
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
      projectItemType: (item.project_item_type ||
        "document") as EProjectItemType,
      count: count,
      contentId: contentId,
    };
  }

  static createProject(db: Database.Database, project: CreateProject): Project {
    const stmt = db.prepare(`
      INSERT INTO project
      (create_time, update_time, title, desc, children, archived, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      project.title,
      JSON.stringify(project.desc || []),
      JSON.stringify(project.children || []),
      Number(project.archived || false),
      Number(project.pinned || false),
    );

    Operation.insertOperation(
      db,
      "project",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getProject(db, Number(res.lastInsertRowid));
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
      project.id,
    );

    Operation.insertOperation(db, "project", "update", project.id, now);

    return this.getProject(db, project.id);
  }

  static deleteProject(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM project WHERE id = ?");
    // 所有 project_item 的 projects 字段中删除该项目的id
    const projectItems = this.getProjectItemsByProjectId(db, id);
    for (const item of projectItems) {
      item.projects = item.projects.filter((p: number) => p !== id);
      this.updateProjectItem(db, item);
    }
    //  尝试删除无 projects 的 project_item
    this.deleteProjectItemsNotInAnyProject(db);
    Operation.insertOperation(db, "project", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getProject(db: Database.Database, id: number): Project {
    const stmt = db.prepare("SELECT * FROM project WHERE id = ?");
    const project = stmt.get(id);
    return this.parseProject(project);
  }

  static getAllProjects(db: Database.Database): Project[] {
    const stmt = db.prepare("SELECT * FROM project ORDER BY create_time DESC");
    const projects = stmt.all();
    return projects.map((p) => this.parseProject(p));
  }

  static getContentIdByProjectItem(
    db: Database.Database,
    item: CreateProjectItem,
  ): number {
    let contentId = 0;
    if (item.refType === "card" && item.refId) {
      const card = CardTable.getCardById(db, item.refId);
      if (card) {
        contentId = card.contentId;
        ContentTable.incrementRefCount(db, contentId);
      }
    } else if (item.refType === "article" && item.refId) {
      const article = ArticleTable.getArticleById(db, item.refId);
      if (article) {
        contentId = article.contentId;
        ContentTable.incrementRefCount(db, contentId);
      }
    } else if (
      item.projectItemType === EProjectItemType.Document &&
      item.content
    ) {
      contentId = ContentTable.createContent(db, {
        content: item.content,
        count: item.count || getContentLength(item.content),
      });
    }

    return contentId;
  }

  static updateProjectItem(
    db: Database.Database,
    item: UpdateProjectItem,
    ...res: any[]
  ): ProjectItem | null {
    const win = res[res.length - 1];

    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        title = ?,
        children = ?,
        parents = ?,
        projects = ?,
        ref_type = ?,
        ref_id = ?,
        project_item_type = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      item.title || item.title,
      JSON.stringify(item.children || item.children),
      JSON.stringify(item.parents || item.parents),
      JSON.stringify(item.projects || item.projects),
      item.refType ?? item.refType,
      item.refId ?? item.refId,
      item.projectItemType || item.projectItemType,
      item.id,
    );

    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== win && !window.isDestroyed()) {
        window.webContents.send("project-item:updated", {
          databaseName: basename(db.name),
          projectItemId: item.id,
        });
      }
    });

    if (item.refType === "card" && item.refId) {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (window !== win && !window.isDestroyed()) {
          window.webContents.send("card:updated", {
            databaseName: basename(db.name),
            cardId: item.refId,
          });
        }
      });
    }

    if (item.refType === "article" && item.refId) {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (window !== win && !window.isDestroyed()) {
          window.webContents.send("article:updated", {
            databaseName: basename(db.name),
            articleId: item.refId,
          });
        }
      });
    }

    Operation.insertOperation(db, "project-item", "update", item.id, now);

    return this.getProjectItem(db, item.id);
  }

  static deleteProjectItem(db: Database.Database, id: number): boolean {
    // 获取project_item信息，以获取contentId
    const itemInfo = this.getProjectItem(db, id);
    if (!itemInfo) {
      return false;
    }

    const stmt = db.prepare("DELETE FROM project_item WHERE id = ?");
    const changes = stmt.run(id).changes;

    log.info(`删除项目条目数: ${changes}`);

    if (changes > 0) {
      if (itemInfo.contentId) {
        // 删除关联的content记录（减少引用计数）
        ContentTable.deleteContent(db, itemInfo.contentId);
      }
      if (itemInfo.projectItemType === EProjectItemType.VideoNote) {
        VideoNoteTable.deleteVideoNote(db, itemInfo.refId);
      }
      log.info(`删除白板内容: ${JSON.stringify(itemInfo, null, 2)}`);
      if (
        itemInfo.projectItemType === EProjectItemType.WhiteBoard &&
        itemInfo.whiteBoardContentId
      ) {
        WhiteBoardContentTable.deleteWhiteboard(
          db,
          itemInfo.whiteBoardContentId,
        );
      }

      FTSTable.removeIndexByIdAndType(db, id, "project-item");
      VecDocumentTable.removeIndexByIdAndType(db, id, "project-item");
      Operation.insertOperation(db, "project-item", "delete", id, Date.now());
    }

    return changes > 0;
  }

  static getProjectItem(db: Database.Database, id: number): ProjectItem | null {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      WHERE pi.id = ?
    `);
    const item = stmt.get(id);
    if (!item) {
      return null;
    }
    return this.parseProjectItem(item);
  }

  static getProjectItemsByProjectId(
    db: Database.Database,
    projectId: number,
  ): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      WHERE 1=1 AND EXISTS (
        SELECT 1 FROM json_each(pi.projects)
        WHERE value = ?
      )
    `);
    const items = stmt.all(projectId);
    return items.map((item) => this.parseProjectItem(item));
  }

  static getProjectItemsByIds(
    db: Database.Database,
    ids: number[],
  ): ProjectItem[] {
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT pi.*, c.content, c.count, c.update_time as content_update_time
       FROM project_item pi
       LEFT JOIN contents c ON pi.content_id = c.id
       WHERE pi.id IN (${placeholders})`,
    );
    const items = stmt.all(ids);
    return items.map((item) => this.parseProjectItem(item));
  }

  static getProjectItemByRef(
    db: Database.Database,
    refType: string,
    refId: number,
  ): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      WHERE pi.ref_type = ? AND pi.ref_id = ?
    `);
    const items = stmt.all(refType, refId);
    return items.map((item) => this.parseProjectItem(item));
  }

  static getProjectItemCountInProject(
    db: Database.Database,
    projectId: number,
  ): number {
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

  static getAllProjectItemsNotInProject(
    db: Database.Database,
    projectId: number,
  ): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      WHERE json_array_length(pi.projects) = 0
      OR NOT EXISTS (
        SELECT 1 FROM json_each(pi.projects)
        WHERE value = ?
      )
    `);
    const items = stmt.all(projectId);
    return items.map((item) => this.parseProjectItem(item));
  }

  static getProjectItemsNotInAnyProject(db: Database.Database): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      WHERE pi.projects = '[]'
    `);
    const items = stmt.all();
    log.info(`获取不在任何项目中的条目: ${JSON.stringify(items)}`);
    return items.map((item) => this.parseProjectItem(item));
  }

  static isProjectItemNotInAnyProject(
    db: Database.Database,
    id: number,
  ): boolean {
    const stmt = db.prepare("SELECT projects FROM project_item WHERE id = ?");
    const result = stmt.get(id) as { projects: string };
    return result.projects === "[]";
  }

  static deleteProjectItemsNotInAnyProject(db: Database.Database): number {
    const toDeleteItems = this.getProjectItemsNotInAnyProject(db);
    for (const deleteItem of toDeleteItems) {
      this.deleteProjectItem(db, deleteItem.id);
    }
    log.info(
      `删除不在任何项目中的条目: ${toDeleteItems.map((item) => item.id)}`,
    );
    return toDeleteItems.length;
  }

  static async deleteProjectItemByRef(
    db: Database.Database,
    refType: string,
    refId: number,
  ): Promise<void> {
    // 获取refType为refType，refId为refId的project_item信息
    const itemInfo = this.getProjectItemByRef(db, refType, refId);
    if (itemInfo && itemInfo.length > 0) {
      for (const item of itemInfo) {
        this.deleteProjectItem(db, item.id);
      }
    }
  }

  static resetProjectItemRef(
    db: Database.Database,
    refType: string,
    refId: number,
  ) {
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
      LEFT JOIN contents c ON pi.content_id = c.id
    `);
    const items = stmt.all();
    return items.map((item) => this.parseProjectItem(item));
  }

  static addRootProjectItem(
    db: Database.Database,
    projectId: number,
    projectItem: CreateProjectItem,
  ): [Project, ProjectItem | null] {
    const contentId = this.getContentIdByProjectItem(db, projectItem);

    if (
      projectItem.refType === "white-board" &&
      projectItem.whiteBoardContentId &&
      projectItem.projectItemType === EProjectItemType.WhiteBoard
    ) {
      WhiteBoardContentTable.incrementRefCount(
        db,
        projectItem.whiteBoardContentId,
      );
    }

    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO project_item
      (create_time, update_time, title, content_id, children, parents, projects, ref_type, ref_id, white_board_content_id, project_item_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      projectItem.title,
      contentId,
      JSON.stringify(projectItem.children || []),
      JSON.stringify([]),
      JSON.stringify([projectId]),
      projectItem.refType,
      projectItem.refId || 0,
      projectItem.whiteBoardContentId || 0,
      projectItem.projectItemType || EProjectItemType.Document,
    );

    const createdItemId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "project-item", "insert", createdItemId, now);

    const project = this.getProject(db, projectId);
    project.children.push(createdItemId);
    this.updateProject(db, project);

    return [project, this.getProjectItem(db, createdItemId)];
  }

  static addChildProjectItem(
    db: Database.Database,
    parentProjectItemId: number,
    projectItem: CreateProjectItem,
  ): [ProjectItem | null, ProjectItem | null] | null {
    const parentProjectItem = this.getProjectItem(db, parentProjectItemId);
    if (!parentProjectItem) {
      return null;
    }

    const contentId = this.getContentIdByProjectItem(db, projectItem);
    if (
      projectItem.refType === "white-board" &&
      projectItem.whiteBoardContentId &&
      projectItem.projectItemType === EProjectItemType.WhiteBoard
    ) {
      WhiteBoardContentTable.incrementRefCount(
        db,
        projectItem.whiteBoardContentId,
      );
    }

    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO project_item
      (create_time, update_time, title, content_id, children, parents, projects, ref_type, ref_id, white_board_content_id, project_item_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      projectItem.title,
      contentId,
      JSON.stringify(projectItem.children || []),
      JSON.stringify([parentProjectItemId]),
      JSON.stringify(parentProjectItem.projects || []),
      projectItem.refType,
      projectItem.refId || 0,
      projectItem.whiteBoardContentId || 0,
      projectItem.projectItemType || EProjectItemType.Document,
    );

    const createdItemId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "project-item", "insert", createdItemId, now);

    const currentChildren = new Set(parentProjectItem.children);
    currentChildren.add(createdItemId);
    parentProjectItem.children = Array.from(currentChildren);
    this.updateProjectItem(db, parentProjectItem);

    return [parentProjectItem, this.getProjectItem(db, createdItemId)];
  }

  static addRefRootProjectItem(
    db: Database.Database,
    projectId: number,
    projectItemId: number,
  ): [Project, ProjectItem | null] | null {
    const project = this.getProject(db, projectId);
    const projectItem = this.getProjectItem(db, projectItemId);

    if (!projectItem) {
      return null;
    }

    // 更新项目的子条目
    project.children.push(projectItemId);
    this.updateProject(db, project);

    // 更新项目条目所属项目列表
    const currentProjects = new Set(projectItem.projects);
    currentProjects.add(projectId);
    projectItem.projects = Array.from(currentProjects);
    this.updateProjectItem(db, projectItem);

    Operation.insertOperation(
      db,
      "project-item",
      "insert",
      projectItemId,
      Date.now(),
    );

    return [project, projectItem];
  }

  static addRefChildProjectItem(
    db: Database.Database,
    parentProjectItemId: number,
    projectItemId: number,
  ): [ProjectItem | null, ProjectItem | null] | null {
    const parentProjectItem = this.getProjectItem(db, parentProjectItemId);
    if (!parentProjectItem) {
      return null;
    }

    const projectItem = this.getProjectItem(db, projectItemId);
    if (!projectItem) {
      return null;
    }

    // 更新父项目条目的子条目
    const currentChildren = new Set(parentProjectItem.children);
    currentChildren.add(projectItemId);
    parentProjectItem.children = Array.from(currentChildren);
    this.updateProjectItem(db, parentProjectItem);

    // 更新项目条目的父条目和所属项目
    const currentParents = new Set(projectItem.parents);
    currentParents.add(parentProjectItemId);
    projectItem.parents = Array.from(currentParents);

    // 确保继承父条目的所有项目关联
    const currentProjects = new Set([
      ...projectItem.projects,
      ...parentProjectItem.projects,
    ]);
    projectItem.projects = Array.from(currentProjects);

    this.updateProjectItem(db, projectItem);

    Operation.insertOperation(
      db,
      "project-item",
      "insert",
      projectItemId,
      Date.now(),
    );

    return [parentProjectItem, projectItem];
  }

  static removeRootProjectItem(
    db: Database.Database,
    projectId: number,
    projectItemId: number,
    notDelete?: boolean,
  ): [Project, ProjectItem | null] | null {
    const project = this.getProject(db, projectId);
    const projectItem = this.getProjectItem(db, projectItemId);

    if (!projectItem) {
      return null;
    }

    // 更新项目的子条目，移除该条目
    project.children = project.children.filter((id) => id !== projectItemId);
    this.updateProject(db, project);

    if (notDelete) {
      return [project, projectItem];
    }

    // 从项目条目的所属项目列表中移除该项目
    projectItem.projects = projectItem.projects.filter(
      (id) => id !== projectId,
    );
    this.updateProjectItem(db, projectItem);

    // 递归处理子条目
    for (const childId of projectItem.children) {
      this.removeChildProjectItem(db, projectId, projectItemId, childId);
    }

    // 如果项目条目不再属于任何项目，则删除它
    if (projectItem.projects.length === 0) {
      this.deleteProjectItem(db, projectItemId);
    }

    return [project, projectItem];
  }

  static removeChildProjectItem(
    db: Database.Database,
    projectId: number,
    parentProjectItemId: number,
    projectItemId: number,
    notDelete?: boolean,
  ): [ProjectItem | null, ProjectItem | null] | null {
    const parentProjectItem = this.getProjectItem(db, parentProjectItemId);
    if (!parentProjectItem) {
      return null;
    }

    const projectItem = this.getProjectItem(db, projectItemId);
    if (!projectItem) {
      return null;
    }

    // 更新父条目的子条目列表，移除当前条目
    parentProjectItem.children = parentProjectItem.children.filter(
      (id) => id !== projectItemId,
    );
    this.updateProjectItem(db, parentProjectItem);

    if (notDelete) {
      return [parentProjectItem, projectItem];
    }

    // 从项目条目的父级列表和所属项目列表中移除相应的ID
    projectItem.parents = projectItem.parents.filter(
      (id) => id !== parentProjectItemId,
    );
    projectItem.projects = projectItem.projects.filter(
      (id) => id !== projectId,
    );
    this.updateProjectItem(db, projectItem);

    // 递归处理子条目
    for (const childId of projectItem.children) {
      this.removeChildProjectItem(
        db,
        projectId,
        projectItemId,
        childId,
        notDelete,
      );
    }

    // 如果项目条目不再属于任何项目，则删除它
    if (projectItem.projects.length === 0) {
      this.deleteProjectItem(db, projectItemId);
    }

    return [parentProjectItem, projectItem];
  }
}
