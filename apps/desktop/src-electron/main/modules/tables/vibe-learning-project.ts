import Database from "better-sqlite3";
import { basename, join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import log from "electron-log";
import {
  VibeLearningProject,
  VibeLearningProjectSummary,
  VibeLearningOpenedItem,
  CreateVibeLearningProject,
  UpdateVibeLearningProject,
} from "@/types";
import Operation from "./operation";
import VibeLearningResourceTable from "./vibe-learning-resource";
import ChatSessionTable from "./chat-session";
import VLNoteTable from "./vl-note";
import VLQuizTable from "./vl-quiz";
import vibeLearningDBManager from "../vibe-learning-db";
import PathUtil from "../../utils/PathUtil";
import { getNextModuleEntityId } from "./module-entity-id";

/**
 * 「Vibe Learning」模块的列表实体表。
 * 原先由 project 表承载（project_type = 'vibe-learning'），拆分为独立模块后独立成表。
 * 资源 / 笔记 / 测验 / 会话仍以 project_id 关联这里的 id，删除时的级联逻辑
 * 原样从 ProjectTable.deleteProject 的 VibeLearning 分支搬来。
 */
export default class VibeLearningProjectTable {
  static getListenEvents() {
    return {
      "vibe-learning-project:create": this.create.bind(this),
      "vibe-learning-project:update": this.update.bind(this),
      "vibe-learning-project:delete": this.remove.bind(this),
      "vibe-learning-project:get": this.getById.bind(this),
      "vibe-learning-project:list": this.list.bind(this),
      "vibe-learning-project:record-open": this.recordOpen.bind(this),
    };
  }

  static parse(row: Record<string, unknown>): VibeLearningProject {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      title: row.title as string,
      desc: JSON.parse((row.desc as string) || "[]"),
      archived: Boolean(row.archived),
      pinned: Boolean(row.pinned),
    };
  }

  static getById(db: Database.Database, id: number): VibeLearningProject | null {
    const row = db.prepare(`SELECT * FROM vibe_learning_project WHERE id = ?`).get(id);
    if (!row) return null;
    return this.parse(row as Record<string, unknown>);
  }

  /** 列表：附带资源数（卡片大数字）、打开时间与上次打开的资料 / 笔记标题（已删除时为 null） */
  static list(db: Database.Database): VibeLearningProjectSummary[] {
    const rows = db
      .prepare(
        `SELECT vlp.*,
                (SELECT COUNT(*) FROM vibe_learning_resources vlr
                  WHERE vlr.project_id = vlp.id) AS resource_count,
                CASE vlp.last_open_kind
                  WHEN 'resource' THEN (SELECT name FROM vibe_learning_resources
                    WHERE id = vlp.last_open_item_id AND project_id = vlp.id)
                  WHEN 'note' THEN (SELECT title FROM vl_note
                    WHERE id = vlp.last_open_item_id AND project_id = vlp.id)
                END AS last_item_title
         FROM vibe_learning_project vlp
         ORDER BY vlp.update_time DESC`
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map(row => ({
      ...this.parse(row),
      resourceCount: Number(row.resource_count || 0),
      openedAt: (row.last_open_time as number | null) ?? null,
      lastItemTitle: (row.last_item_title as string | null) ?? null,
    }));
  }

  // 打开记录不是内容修改：不动 update_time，也不记 operation。
  // item 缺省（停在生成任务等非资料 / 笔记位置）时保留上次打开的资料 / 笔记
  static recordOpen(db: Database.Database, id: number, item?: VibeLearningOpenedItem | null): void {
    db.prepare(
      `UPDATE vibe_learning_project SET last_open_time = ?,
         last_open_kind = COALESCE(?, last_open_kind),
         last_open_item_id = COALESCE(?, last_open_item_id)
       WHERE id = ?`
    ).run(Date.now(), item?.kind ?? null, item?.id ?? null, id);
  }

  static create(db: Database.Database, payload: CreateVibeLearningProject): VibeLearningProject {
    const tx = db.transaction((item: CreateVibeLearningProject) => {
      const now = Date.now();
      const id = getNextModuleEntityId(db);
      db.prepare(
        `
          INSERT INTO vibe_learning_project
          (id, create_time, update_time, title, desc, archived, pinned)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        now,
        now,
        item.title,
        JSON.stringify(item.desc || []),
        Number(item.archived || false),
        Number(item.pinned || false)
      );

      Operation.insertOperation(db, "vibe-learning-project", "insert", id, now);
      return id;
    });

    const id = tx(payload);
    const created = this.getById(db, id);
    if (!created) {
      throw new Error(`Failed to create vibe learning project with id ${id}`);
    }
    return created;
  }

  static update(
    db: Database.Database,
    payload: UpdateVibeLearningProject
  ): VibeLearningProject | null {
    const existing = this.getById(db, payload.id);
    if (!existing) return null;

    const now = Date.now();
    db.prepare(
      `
        UPDATE vibe_learning_project SET
          update_time = ?,
          title = ?,
          desc = ?,
          archived = ?,
          pinned = ?
        WHERE id = ?
      `
    ).run(
      now,
      payload.title,
      JSON.stringify(payload.desc ?? existing.desc),
      Number(payload.archived ?? existing.archived),
      Number(payload.pinned ?? existing.pinned),
      payload.id
    );

    Operation.insertOperation(db, "vibe-learning-project", "update", payload.id, now);
    return this.getById(db, payload.id);
  }

  static remove(db: Database.Database, id: number): number {
    const existing = this.getById(db, id);
    if (!existing) return 0;

    VibeLearningResourceTable.deleteResourcesByProjectId(db, id);
    // 学习项目的对话（目录行 + 会话文件）随项目一起删
    ChatSessionTable.removeByDomain(db, "vibe-learning-chat", String(id));
    VLNoteTable.deleteByProjectId(db, id);
    VLQuizTable.deleteByProjectId(db, id);
    this.removeDiskArtifacts(db, id);

    const changes = db.prepare(`DELETE FROM vibe_learning_project WHERE id = ?`).run(id).changes;
    Operation.insertOperation(db, "vibe-learning-project", "delete", id, Date.now());
    return changes;
  }

  /** 删除按项目 id 命名的磁盘产物：per-project 索引库 + markdown 目录 */
  private static removeDiskArtifacts(db: Database.Database, id: number) {
    const dbList = db.pragma("database_list") as Array<{
      name: string;
      file: string;
    }>;
    const mainDbFile = dbList.find(d => d.name === "main")?.file;
    if (!mainDbFile) return;

    const mainDbName = basename(mainDbFile);
    vibeLearningDBManager.deleteDatabase(mainDbName, id);

    const dbNameWithoutExt = mainDbName.replace(/\.db$/, "");
    const markdownDir = join(PathUtil.getAppDir(), "vibe-learning", dbNameWithoutExt, String(id));
    if (!existsSync(markdownDir)) return;
    try {
      rmSync(markdownDir, { recursive: true, force: true });
      log.info(`[VibeLearningProjectTable] Deleted markdown folder: ${markdownDir}`);
    } catch (error) {
      log.error(`[VibeLearningProjectTable] Error deleting markdown folder: ${error}`);
    }
  }
}
