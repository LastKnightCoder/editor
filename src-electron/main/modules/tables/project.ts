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
import { WhiteBoard } from "@/types";
import { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";
import { basename } from "node:path";
import { BrowserWindow } from "electron";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import CardTable from "./card";
import ArticleTable from "./article";
import VideoNoteTable from "./video-note";
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
        content_id INTEGER,
        children TEXT,
        parents TEXT,
        projects TEXT,
        ref_type TEXT,
        ref_id INTEGER,
        white_board_data TEXT,
        project_item_type TEXT DEFAULT 'document',
        FOREIGN KEY(content_id) REFERENCES contents(id)
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    // 检查project表的结构
    const projectStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project'",
    );
    const projectInfo = (projectStmt.get() as { sql: string }).sql;

    if (!projectInfo.includes("archived")) {
      const alertStmt = db.prepare(
        "ALTER TABLE project ADD COLUMN archived INTEGER DEFAULT 0",
      );
      alertStmt.run();
    }

    if (!projectInfo.includes("pinned")) {
      const alertStmt = db.prepare(
        "ALTER TABLE project ADD COLUMN pinned INTEGER DEFAULT 0",
      );
      alertStmt.run();
    }

    // 检查project_item表的结构
    const stmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_item'",
    );
    const tableInfo = (stmt.get() as { sql: string }).sql;

    if (!tableInfo.includes("white_board_data")) {
      const alertStmt = db.prepare(
        "ALTER TABLE project_item ADD COLUMN white_board_data TEXT",
      );
      alertStmt.run();
    }

    if (!tableInfo.includes("project_item_type")) {
      const alertStmt = db.prepare(
        "ALTER TABLE project_item ADD COLUMN project_item_type TEXT DEFAULT 'document'",
      );
      alertStmt.run();
    }

    // 如果不包含content_id字段，则添加
    if (!tableInfo.includes("content_id")) {
      // 1. 添加content_id列
      const addColumnStmt = db.prepare(
        "ALTER TABLE project_item ADD COLUMN content_id INTEGER",
      );
      addColumnStmt.run();

      // 2. 获取所有项目条目
      const getAllItemsStmt = db.prepare("SELECT * FROM project_item");
      const items = getAllItemsStmt.all();

      // 3. 为每个条目创建内容记录
      for (const item of items as any[]) {
        let contentId = null;

        // 处理不同的引用类型
        if (item.ref_type === "card" && item.ref_id) {
          // 对于引用卡片的条目，获取卡片的contentId
          const cardResult = CardTable.getCardById(db, item.ref_id);
          if (cardResult && cardResult.contentId) {
            contentId = cardResult.contentId;
            // 增加引用计数
            ContentTable.incrementRefCount(db, contentId);
          }
        } else if (item.ref_type === "article" && item.ref_id) {
          // 对于引用文章的条目，获取文章的contentId
          const articleResult = ArticleTable.getArticleById(db, item.ref_id);
          if (articleResult && articleResult.contentId) {
            contentId = articleResult.contentId;
            // 增加引用计数
            ContentTable.incrementRefCount(db, contentId);
          }
        } else if (
          item.content &&
          item.ref_type !== "white-board" &&
          item.ref_type !== "video-note"
        ) {
          // 创建新的内容记录
          try {
            const content = JSON.parse(item.content);
            const count = item.count || getContentLength(content);

            contentId = ContentTable.createContent(db, {
              content: content,
              count: count,
            });
          } catch (error) {
            console.error("Error parsing content:", error);
          }
        }

        // 更新条目的content_id字段
        if (contentId) {
          const updateStmt = db.prepare(
            "UPDATE project_item SET content_id = ? WHERE id = ?",
          );
          updateStmt.run(contentId, item.id);
        }
      }

      // 删除content字段
      const dropContentColumnStmt = db.prepare(
        "ALTER TABLE project_item DROP COLUMN content",
      );
      dropContentColumnStmt.run();

      // 删除count字段
      const dropCountColumnStmt = db.prepare(
        "ALTER TABLE project_item DROP COLUMN count",
      );
      dropCountColumnStmt.run();
    }
    // 删除不在任何项目中的条目
    this.deleteProjectItemsNotInAnyProject(db);
  }

  static getListenEvents() {
    return {
      "create-project": this.createProject.bind(this),
      "update-project": this.updateProject.bind(this),
      "delete-project": this.deleteProject.bind(this),
      "get-project": this.getProject.bind(this),
      "get-all-projects": this.getAllProjects.bind(this),
      "create-project-item": this.createProjectItem.bind(this),
      "update-project-item": this.updateProjectItem.bind(this),
      "update-project-item-whiteboard-data":
        this.updateProjectItemWhiteBoardData.bind(this),
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
      whiteBoardData: item.white_board_data
        ? JSON.parse(item.white_board_data)
        : {},
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

  static createProjectItem(
    db: Database.Database,
    item: CreateProjectItem,
  ): ProjectItem {
    let contentId = 0;

    if (item.refType === "card" && item.refId) {
      const card = CardTable.getCardById(db, item.refId);
      if (card) {
        contentId = card.contentId;
      }
      // 增加计数
      ContentTable.incrementRefCount(db, contentId);
    } else if (item.refType === "article" && item.refId) {
      const article = ArticleTable.getArticleById(db, item.refId);
      if (article) {
        contentId = article.contentId;
      }
      // 增加计数
      ContentTable.incrementRefCount(db, contentId);
    } else if (
      item.refType !== "white-board" &&
      item.refType !== "video-note"
    ) {
      // 如果没有引用，且提供了内容，则创建新的内容记录
      contentId = ContentTable.createContent(db, {
        content: item.content,
        count: item.count || getContentLength(item.content),
      });
    }

    const stmt = db.prepare(`
      INSERT INTO project_item
      (create_time, update_time, title, content_id, children, parents, projects, ref_type, ref_id, white_board_data, project_item_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      item.title,
      contentId,
      JSON.stringify(item.children || []),
      JSON.stringify(item.parents || []),
      JSON.stringify(item.projects || []),
      item.refType,
      item.refId,
      JSON.stringify(item.whiteBoardData || {}),
      item.projectItemType,
    );

    Operation.insertOperation(
      db,
      "project_item",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getProjectItem(db, Number(res.lastInsertRowid));
  }

  static updateProjectItem(
    db: Database.Database,
    item: UpdateProjectItem,
    ...res: any[]
  ): ProjectItem {
    const win = res[res.length - 1];

    if (
      item.refType !== "white-board" &&
      item.refType !== "video-note" &&
      item.contentId
    ) {
      ContentTable.updateContent(db, item.contentId, {
        content: item.content,
        count: item.count || getContentLength(item.content),
      });
    }

    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        title = ?,
        children = ?,
        parents = ?,
        projects = ?,
        ref_type = ?,
        ref_id = ?,
        white_board_data = ?,
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
      JSON.stringify(item.whiteBoardData || item.whiteBoardData || {}),
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

    Operation.insertOperation(db, "project_item", "update", item.id, now);

    return this.getProjectItem(db, item.id);
  }

  static updateProjectItemWhiteBoardData(
    db: Database.Database,
    id: number,
    whiteBoardData: WhiteBoard["data"],
  ): ProjectItem {
    const stmt = db.prepare(`
      UPDATE project_item SET
        update_time = ?,
        white_board_data = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(now, JSON.stringify(whiteBoardData || {}), id);

    Operation.insertOperation(db, "project_item", "update", id, now);

    const item = this.getProjectItem(db, id);

    if (item.refType === "white-board" && item.refId && item.whiteBoardData) {
      const whiteBoardStmt = db.prepare(
        "UPDATE white_boards SET update_time = ?, data = ? WHERE id = ?",
      );
      whiteBoardStmt.run(now, JSON.stringify(item.whiteBoardData), item.refId);
    }

    if (item.refType !== "" && item.refId) {
      const projectItems = this.getProjectItemByRef(
        db,
        item.refType,
        item.refId,
      );
      for (const projectItem of projectItems) {
        if (projectItem.id !== item.id) {
          const projectItemStmt = db.prepare(
            `UPDATE project_item SET update_time = ?, white_board_data = ? WHERE id = ?`,
          );
          projectItemStmt.run(
            now,
            JSON.stringify(item.whiteBoardData || {}),
            projectItem.id,
          );
        }
      }
    }

    return item;
  }

  static deleteProjectItem(db: Database.Database, id: number): boolean {
    // 获取project_item信息，以获取contentId
    const itemInfo = this.getProjectItem(db, id);

    if (itemInfo && itemInfo.contentId) {
      // 删除关联的content记录（减少引用计数）
      ContentTable.deleteContent(db, itemInfo.contentId);
    }

    const stmt = db.prepare("DELETE FROM project_item WHERE id = ?");

    // 删除全文搜索索引
    FTSTable.removeIndexByIdAndType(db, id, "project-item");
    // 删除向量文档索引
    VecDocumentTable.removeIndexByIdAndType(db, id, "project-item");

    Operation.insertOperation(db, "project-item", "delete", id, Date.now());

    // 如果 refType 为 video-note，则删除 video_note 表中的记录
    if (itemInfo.refType === "video-note") {
      VideoNoteTable.deleteVideoNote(db, itemInfo.refId);
    }

    return stmt.run(id).changes > 0;
  }

  static getProjectItem(db: Database.Database, id: number): ProjectItem {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      WHERE pi.id = ?
    `);
    const item = stmt.get(id);
    return this.parseProjectItem(item);
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
      WHERE json_array_length(pi.projects) = 0
    `);
    const items = stmt.all();
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
}
