import Database from "better-sqlite3";
import {
  Project,
  ProjectItem,
  CreateProject,
  UpdateProject,
  CreateProjectItem,
  UpdateProjectItem,
  EProjectItemType,
  EProjectType,
} from "@/types/project";
import Operation from "./operation";
import DataTableTable from "./data-table";
import { Descendant } from "slate";
import { getContentLength } from "@/utils/helper";
import { getMarkdown } from "@/utils/markdown.ts";
import { basename, join } from "node:path";
import { BrowserWindow } from "electron";
import { v4 as uuidv4 } from "uuid";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import CardTable from "./card";
import ArticleTable from "./article";
import VideoNoteTable from "./video-note";
import AudioNoteTable from "./audio-note";
import WhiteBoardContentTable from "./white-board-content";
import WebLinkTable from "./web-link";
import { WebLinkSourceType } from "@/types";
import VibeLearningResourceTable from "./vibe-learning-resource";
import VibeLearningChatTable from "./vibe-learning-chat";
import VLNoteTable from "./vl-note";
import VLQuizTable from "./vl-quiz";
import vibeLearningDBManager from "../vibe-learning-db";
import PathUtil from "../../utils/PathUtil";
import { rmSync, existsSync } from "node:fs";

import log from "electron-log";

const LEGACY_WEB_LINK_MIGRATION_KEY = "project:legacy-web-links";
const PROJECT_ID_SEQ_KEY = "project:id-seq";

export default class ProjectTable {
  static upgradeTable(db: Database.Database) {
    // 检查并添加新字段
    const tableInfo = db.prepare(`PRAGMA table_info(project)`).all() as Array<{
      name: string;
    }>;
    const hasProjectType = tableInfo.some(
      (column) => column.name === "project_type",
    );
    const hasDataTableId = tableInfo.some(
      (column) => column.name === "data_table_id",
    );

    if (!hasProjectType) {
      db.exec(
        "ALTER TABLE project ADD COLUMN project_type TEXT DEFAULT 'document-tree'",
      );
      db.exec(
        `UPDATE project SET project_type = 'document-tree' WHERE project_type IS NULL`,
      );
    }

    if (!hasDataTableId) {
      db.exec("ALTER TABLE project ADD COLUMN data_table_id INTEGER DEFAULT 0");
      db.exec(
        `UPDATE project SET data_table_id = 0 WHERE data_table_id IS NULL`,
      );
    }

    // 检查 project_item 表是否有 podcast_id 字段
    const projectItemTableInfo = db
      .prepare(`PRAGMA table_info(project_item)`)
      .all() as Array<{
      name: string;
    }>;
    const hasPodcastId = projectItemTableInfo.some(
      (column) => column.name === "podcast_id",
    );

    if (!hasPodcastId) {
      db.exec(
        `ALTER TABLE project_item ADD COLUMN podcast_id INTEGER DEFAULT NULL;`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_project_item_podcast_id ON project_item(podcast_id);`,
      );
      log.info("已添加 podcast_id 字段到 project_item 表");
    }

    // 删除不在任何项目中的条目
    this.deleteProjectItemsNotInAnyProject(db);
    this.migrateLegacyWebLinks(db);
  }

  static extractLegacyWebLink(title: string): { title: string; url: string } {
    const urlRegex = /\s*\[([^\]]+)\]\s*$/;
    const match = title.match(urlRegex);
    if (match && match[1]) {
      return {
        title: title.replace(urlRegex, "").trim(),
        url: match[1],
      };
    }
    return {
      title: title.trim(),
      url: "",
    };
  }

  private static ensureMigrationMetaTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS migration_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private static isMigrationDone(db: Database.Database, key: string) {
    this.ensureMigrationMetaTable(db);
    const row = db
      .prepare(`SELECT value FROM migration_meta WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value === "done";
  }

  private static markMigrationDone(db: Database.Database, key: string) {
    this.ensureMigrationMetaTable(db);
    db.prepare(
      `
        INSERT INTO migration_meta (key, value)
        VALUES (?, 'done')
        ON CONFLICT(key) DO UPDATE SET value = 'done'
      `,
    ).run(key);
  }

  private static getNextProjectId(db: Database.Database): number {
    this.ensureMigrationMetaTable(db);
    const seqRow = db
      .prepare(`SELECT value FROM migration_meta WHERE key = ?`)
      .get(PROJECT_ID_SEQ_KEY) as { value: string } | undefined;
    const parsedSeq = Number.parseInt(seqRow?.value || "0", 10);
    const currentSeq = Number.isFinite(parsedSeq) ? parsedSeq : 0;
    const maxIdRow = db.prepare(
      `SELECT COALESCE(MAX(id), 0) as max_id FROM project`,
    );
    const maxProjectId = Number(
      (maxIdRow.get() as { max_id: number } | undefined)?.max_id || 0,
    );
    const nextProjectId = Math.max(currentSeq, maxProjectId) + 1;

    db.prepare(
      `
        INSERT INTO migration_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
    ).run(PROJECT_ID_SEQ_KEY, String(nextProjectId));

    return nextProjectId;
  }

  static migrateLegacyWebLinks(db: Database.Database) {
    if (this.isMigrationDone(db, LEGACY_WEB_LINK_MIGRATION_KEY)) {
      return;
    }

    const webviewItems = db
      .prepare(
        `SELECT id, title, ref_type, ref_id FROM project_item WHERE project_item_type = ?`,
      )
      .all(EProjectItemType.WebView) as any[];
    const updateStmt = db.prepare(
      `UPDATE project_item SET title = ?, ref_type = ?, ref_id = ? WHERE id = ?`,
    );
    const updateTitleStmt = db.prepare(
      `UPDATE project_item SET title = ? WHERE id = ?`,
    );
    for (const item of webviewItems) {
      if (item.ref_type === "web-link" && item.ref_id) continue;
      const parsed = this.extractLegacyWebLink(item.title || "");
      if (!parsed.url) {
        if (parsed.title !== item.title) {
          updateTitleStmt.run(parsed.title, item.id);
        }
        continue;
      }
      const sourceType: WebLinkSourceType = parsed.url.startsWith("http")
        ? "remote"
        : "local";
      const webLink = WebLinkTable.create(db, {
        title: parsed.title || parsed.url,
        url: parsed.url,
        sourceType,
      });
      updateStmt.run(webLink.title, "web-link", webLink.id, item.id);
    }

    this.markMigrationDone(db, LEGACY_WEB_LINK_MIGRATION_KEY);
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
      "get-project-items-by-content-id":
        this.getProjectItemsByContentId.bind(this),
      "add-root-project-item": this.addRootProjectItem.bind(this),
      "add-child-project-item": this.addChildProjectItem.bind(this),
      "add-ref-root-project-item": this.addRefRootProjectItem.bind(this),
      "add-ref-child-project-item": this.addRefChildProjectItem.bind(this),
      "remove-root-project-item": this.removeRootProjectItem.bind(this),
      "remove-child-project-item": this.removeChildProjectItem.bind(this),
      "get-project-items-by-dates": this.getProjectItemsByDates.bind(this),
      "get-project-items-by-date-range":
        this.getProjectItemsByDateRange.bind(this),
      "get-project-items-content-by-ids":
        this.getProjectItemsContentByIds.bind(this),
      "attach-podcast-to-project-item": this.attachPodcast.bind(this),
      "detach-podcast-from-project-item": this.detachPodcast.bind(this),
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
      projectType: project.project_type || "document-tree",
      dataTableId: project.data_table_id || 0,
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

    // 解析播客信息
    let podcast:
      | {
          id: number;
          name?: string;
          audioUrl: string;
          script: string;
          scriptLines: Array<{
            speaker: string;
            text: string;
            startTime: number;
            duration: number;
            voiceId: string;
          }>;
          duration: number;
          speakers: Array<{
            name: string;
            voiceId: string;
            voiceName: string;
            role: string;
          }>;
        }
      | undefined = undefined;
    if (item.podcast_id && item.podcast_audio_url) {
      podcast = {
        id: item.podcast_id,
        name: item.podcast_name || undefined,
        audioUrl: item.podcast_audio_url,
        script: item.podcast_script || "",
        scriptLines: item.podcast_script_lines
          ? JSON.parse(item.podcast_script_lines)
          : [],
        duration: item.podcast_duration || 0,
        speakers: item.podcast_speakers
          ? JSON.parse(item.podcast_speakers)
          : [],
      };
    }

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
      podcast: podcast as ProjectItem["podcast"],
    };
  }

  static createProject(db: Database.Database, project: CreateProject): Project {
    const tx = db.transaction((createProjectPayload: CreateProject) => {
      const now = Date.now();
      let dataTableId = 0;

      // 如果是数据表格类型，先创建数据表格
      if (createProjectPayload.projectType === EProjectType.DataTable) {
        // 创建默认主列
        const defaultColumn = {
          id: uuidv4(),
          title: "名称",
          type: "text",
          width: 200,
          isPrimary: true,
        };

        const dataTable = DataTableTable.create(db, {
          columns: [defaultColumn],
          rows: [],
        });
        dataTableId = dataTable.id;
      }

      const projectId = this.getNextProjectId(db);
      const stmt = db.prepare(`
        INSERT INTO project
        (id, create_time, update_time, title, desc, children, archived, pinned, project_type, data_table_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        projectId,
        now,
        now,
        createProjectPayload.title,
        JSON.stringify(createProjectPayload.desc || []),
        JSON.stringify(createProjectPayload.children || []),
        Number(createProjectPayload.archived || false),
        Number(createProjectPayload.pinned || false),
        createProjectPayload.projectType || EProjectType.DocumentTree,
        dataTableId,
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
        pinned = ?,
        project_type = ?,
        data_table_id = ?
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
      project.projectType || EProjectType.DocumentTree,
      project.dataTableId || 0,
      project.id,
    );

    Operation.insertOperation(db, "project", "update", project.id, now);

    return this.getProject(db, project.id);
  }

  static deleteProject(db: Database.Database, id: number): number {
    // 获取项目信息以确定类型
    const project = this.getProject(db, id);

    // 如果是数据表格类型，减少数据表格的引用计数
    if (project.projectType === EProjectType.DataTable && project.dataTableId) {
      DataTableTable.remove(db, project.dataTableId);
    }

    // 如果是文档树类型，处理项目条目
    if (project.projectType === EProjectType.DocumentTree) {
      // 所有 project_item 的 projects 字段中删除该项目的id
      const projectItems = this.getProjectItemsByProjectId(db, id);
      for (const item of projectItems) {
        item.projects = item.projects.filter((p: number) => p !== id);
        this.updateProjectItem(db, item);
      }
      //  尝试删除无 projects 的 project_item
      this.deleteProjectItemsNotInAnyProject(db);
    }

    // 如果是 VibeLearning 类型，先删除关联的资源和聊天记录，以及索引数据库和 Markdown 文件夹
    if (project.projectType === EProjectType.VibeLearning) {
      VibeLearningResourceTable.deleteResourcesByProjectId(db, id);
      VibeLearningChatTable.deleteChatsByProjectId(db, id);
      VLNoteTable.deleteByProjectId(db, id);
      VLQuizTable.deleteByProjectId(db, id);

      // 获取主数据库名称
      const dbList = db.pragma("database_list") as Array<{
        name: string;
        file: string;
      }>;
      const mainDbFile = dbList.find((d) => d.name === "main")?.file;
      if (mainDbFile) {
        const mainDbName = basename(mainDbFile);

        // 删除项目索引数据库
        vibeLearningDBManager.deleteDatabase(mainDbName, id);

        // 删除 Markdown 文件夹
        const dbNameWithoutExt = mainDbName.replace(/\.db$/, "");
        const markdownDir = join(
          PathUtil.getAppDir(),
          "vibe-learning",
          dbNameWithoutExt,
          String(id),
        );
        if (existsSync(markdownDir)) {
          try {
            rmSync(markdownDir, { recursive: true, force: true });
            log.info(
              `[ProjectTable] Deleted VibeLearning markdown folder: ${markdownDir}`,
            );
          } catch (error) {
            log.error(
              `[ProjectTable] Error deleting VibeLearning markdown folder: ${error}`,
            );
          }
        }
      }
    }

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

  static getContentIdByProjectItem(
    db: Database.Database,
    item: CreateProjectItem,
  ): number {
    let contentId = 0;
    if (item.contentId) {
      contentId = item.contentId;
      ContentTable.incrementRefCount(db, contentId);
    } else if (item.refType === "content" && item.refId) {
      const content = ContentTable.getContentById(db, item.refId);
      if (content) {
        contentId = content.id;
        ContentTable.incrementRefCount(db, contentId);
      }
    } else if (item.refType === "card" && item.refId) {
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
      if (itemInfo.projectItemType === EProjectItemType.AudioNote) {
        AudioNoteTable.deleteAudioNote(db, itemInfo.refId);
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
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
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
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
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
      `SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
       FROM project_item pi
       LEFT JOIN contents c ON pi.content_id = c.id
       LEFT JOIN podcasts p ON pi.podcast_id = p.id
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
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
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
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
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
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
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
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
    `);
    const items = stmt.all();
    return items.map((item) => this.parseProjectItem(item));
  }

  static getProjectItemsByContentId(
    db: Database.Database,
    contentId: number,
  ): ProjectItem[] {
    const stmt = db.prepare(`
      SELECT pi.*, c.content, c.count, c.update_time as content_update_time,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents c ON pi.content_id = c.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
      WHERE pi.content_id = ?
      ORDER BY pi.update_time DESC, pi.id DESC
    `);
    const items = stmt.all(contentId);
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
    const updatedParentProjectItem = this.updateProjectItem(
      db,
      parentProjectItem,
    );
    if (!updatedParentProjectItem) {
      return null;
    }

    return [updatedParentProjectItem, this.getProjectItem(db, createdItemId)];
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

  // 批量日期查询项目条目
  static getProjectItemsByDates(
    db: Database.Database,
    dates: string[],
  ): Record<string, ProjectItem[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT pi.*, ct.content, ct.count,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents ct ON pi.content_id = ct.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
      WHERE date(pi.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY pi.update_time DESC
    `);

    const items = stmt.all(...dates).map((item) => this.parseProjectItem(item));
    const result: Record<string, ProjectItem[]> = {};

    items.forEach((item) => {
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
    endDate: string,
  ): Record<string, ProjectItem[]> {
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate + " 23:59:59").getTime();

    const stmt = db.prepare(`
      SELECT pi.*, ct.content, ct.count,
        p.id as podcast_id, p.name as podcast_name, p.create_time as podcast_create_time,
        p.update_time as podcast_update_time, p.audio_url as podcast_audio_url,
        p.script as podcast_script, p.script_lines as podcast_script_lines,
        p.duration as podcast_duration, p.speakers as podcast_speakers,
        p.ref_count as podcast_ref_count
      FROM project_item pi
      LEFT JOIN contents ct ON pi.content_id = ct.id
      LEFT JOIN podcasts p ON pi.podcast_id = p.id
      WHERE pi.update_time >= ? AND pi.update_time <= ?
      ORDER BY pi.update_time DESC
    `);

    const items = stmt
      .all(startTimestamp, endTimestamp)
      .map((item) => this.parseProjectItem(item));
    const result: Record<string, ProjectItem[]> = {};

    items.forEach((item) => {
      const date = new Date(item.updateTime).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(item);
    });

    return result;
  }

  // 获取项目条目内容（转换为 Markdown）
  static getProjectItemsContentByIds(
    db: Database.Database,
    ids: number[],
    maxLength?: number,
  ): Array<{
    id: number;
    markdown: string;
    truncated: boolean;
    originalLength: number;
    metadata: Record<string, any>;
  }> {
    if (ids.length === 0) return [];

    const items = this.getProjectItemsByIds(db, ids);

    return items.map((item) => {
      const markdown = item.content ? getMarkdown(item.content) : "";
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

  static attachPodcast(
    db: Database.Database,
    projectItemId: number,
    podcastId: number,
  ): ProjectItem | null {
    const stmt = db.prepare(
      "UPDATE project_item SET podcast_id = ?, update_time = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(podcastId, now, projectItemId);
    Operation.insertOperation(db, "project-item", "update", projectItemId, now);
    return this.getProjectItem(db, projectItemId);
  }

  static detachPodcast(
    db: Database.Database,
    projectItemId: number,
  ): ProjectItem | null {
    const stmt = db.prepare(
      "UPDATE project_item SET podcast_id = NULL, update_time = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(now, projectItemId);
    Operation.insertOperation(db, "project-item", "update", projectItemId, now);
    return this.getProjectItem(db, projectItemId);
  }
}
