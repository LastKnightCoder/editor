import Database from "better-sqlite3";
import {
  VLResource,
  CreateVLResource,
  UpdateVLResource,
  VLResourceType,
} from "@/types/vibe-learning";
import Operation from "./operation";
import log from "electron-log";

/**
 * 数据库记录类型
 */
interface VLResourceRecord {
  id: number;
  project_id: number;
  create_time: number;
  update_time: number;
  name: string;
  original_path: string;
  markdown_path: string | null;
  resource_type: string;
  file_size: number | null;
  duration: number | null;
}

/**
 * Vibe Learning 资源表
 * 存储在主数据库中，用于记录资源元信息
 * 注意：不存储 status 字段，状态通过实时计算得出
 */
export default class VibeLearningResourceTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vibe_learning_resources (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        name TEXT NOT NULL,
        original_path TEXT NOT NULL,
        markdown_path TEXT,
        resource_type TEXT NOT NULL,
        file_size INTEGER,
        duration INTEGER,
        FOREIGN KEY(project_id) REFERENCES project(id)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vlr_project_id 
      ON vibe_learning_resources(project_id)
    `);

    log.info("[VibeLearningResource] Table initialized");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static upgradeTable(_db: Database.Database) {
    // 未来升级逻辑
  }

  static getListenEvents() {
    return {
      "vl-create-resource": this.createResource.bind(this),
      "vl-update-resource": this.updateResource.bind(this),
      "vl-update-markdown-path": this.updateMarkdownPath.bind(this),
      "vl-delete-resource": this.deleteResource.bind(this),
      "vl-get-resource": this.getResourceById.bind(this),
      "vl-get-resources-by-project": this.getResourcesByProjectId.bind(this),
      "vl-get-all-resources": this.getAllResources.bind(this),
      "vl-get-resources-by-ids": this.getResourcesByIds.bind(this),
    };
  }

  /**
   * 解析数据库记录为 VLResource 对象
   */
  static parseResource(record: VLResourceRecord): VLResource {
    return {
      id: record.id,
      projectId: record.project_id,
      createTime: record.create_time,
      updateTime: record.update_time,
      name: record.name,
      originalPath: record.original_path,
      markdownPath: record.markdown_path || null,
      resourceType: record.resource_type as VLResourceType,
      fileSize: record.file_size || null,
      duration: record.duration || null,
    };
  }

  /**
   * 创建资源记录
   */
  static createResource(
    db: Database.Database,
    params: CreateVLResource,
  ): VLResource {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO vibe_learning_resources
      (project_id, create_time, update_time, name, original_path, markdown_path, resource_type, file_size, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      params.projectId,
      now,
      now,
      params.name,
      params.originalPath,
      null, // markdown_path 初始为空
      params.resourceType,
      params.fileSize || null,
      params.duration || null,
    );

    const resourceId = Number(res.lastInsertRowid);
    Operation.insertOperation(
      db,
      "vibe-learning-resource",
      "insert",
      resourceId,
      now,
    );

    log.info(
      `[VibeLearningResource] Created resource: ${resourceId} for project ${params.projectId}`,
    );

    const resource = this.getResourceById(db, resourceId);
    if (!resource) {
      throw new Error(`Failed to retrieve created resource: ${resourceId}`);
    }
    return resource;
  }

  /**
   * 更新资源记录
   */
  static updateResource(
    db: Database.Database,
    params: UpdateVLResource,
  ): VLResource | null {
    const existing = this.getResourceById(db, params.id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE vibe_learning_resources SET
        update_time = ?,
        name = ?,
        markdown_path = ?,
        file_size = ?,
        duration = ?
      WHERE id = ?
    `);

    stmt.run(
      now,
      params.name ?? existing.name,
      params.markdownPath !== undefined
        ? params.markdownPath
        : existing.markdownPath,
      params.fileSize ?? existing.fileSize,
      params.duration ?? existing.duration,
      params.id,
    );

    Operation.insertOperation(
      db,
      "vibe-learning-resource",
      "update",
      params.id,
      now,
    );

    return this.getResourceById(db, params.id);
  }

  /**
   * 更新 Markdown 路径
   */
  static updateMarkdownPath(
    db: Database.Database,
    id: number,
    markdownPath: string,
  ): boolean {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE vibe_learning_resources SET
        update_time = ?,
        markdown_path = ?
      WHERE id = ?
    `);

    const res = stmt.run(now, markdownPath, id);

    if (res.changes > 0) {
      Operation.insertOperation(
        db,
        "vibe-learning-resource",
        "update",
        id,
        now,
      );
      log.info(
        `[VibeLearningResource] Updated markdown path for resource: ${id}`,
      );
      return true;
    }

    return false;
  }

  /**
   * 删除资源记录
   */
  static deleteResource(db: Database.Database, id: number): boolean {
    const stmt = db.prepare("DELETE FROM vibe_learning_resources WHERE id = ?");
    const res = stmt.run(id);

    if (res.changes > 0) {
      Operation.insertOperation(
        db,
        "vibe-learning-resource",
        "delete",
        id,
        Date.now(),
      );
      log.info(`[VibeLearningResource] Deleted resource: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * 删除项目下的所有资源
   */
  static deleteResourcesByProjectId(
    db: Database.Database,
    projectId: number,
  ): number {
    const resources = this.getResourcesByProjectId(db, projectId);
    let deletedCount = 0;

    for (const resource of resources) {
      if (this.deleteResource(db, resource.id)) {
        deletedCount++;
      }
    }

    log.info(
      `[VibeLearningResource] Deleted ${deletedCount} resources for project ${projectId}`,
    );
    return deletedCount;
  }

  /**
   * 根据 ID 获取资源
   */
  static getResourceById(db: Database.Database, id: number): VLResource | null {
    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_resources WHERE id = ?",
    );
    const record = stmt.get(id) as VLResourceRecord | undefined;

    if (!record) {
      return null;
    }

    return this.parseResource(record);
  }

  /**
   * 根据项目 ID 获取所有资源
   */
  static getResourcesByProjectId(
    db: Database.Database,
    projectId: number,
  ): VLResource[] {
    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_resources WHERE project_id = ? ORDER BY create_time DESC",
    );
    const records = stmt.all(projectId) as VLResourceRecord[];

    return records.map((record) => this.parseResource(record));
  }

  /**
   * 获取所有资源（用于启动时检查）
   */
  static getAllResources(db: Database.Database): VLResource[] {
    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_resources ORDER BY create_time DESC",
    );
    const records = stmt.all() as VLResourceRecord[];

    return records.map((record) => this.parseResource(record));
  }

  /**
   * 根据 ID 列表获取资源
   */
  static getResourcesByIds(db: Database.Database, ids: number[]): VLResource[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM vibe_learning_resources WHERE id IN (${placeholders})`,
    );
    const records = stmt.all(...ids) as VLResourceRecord[];

    return records.map((record) => this.parseResource(record));
  }

  /**
   * 获取特定项目中需要处理的资源（markdown_path 为空）
   */
  static getPendingResources(
    db: Database.Database,
    projectId?: number,
  ): VLResource[] {
    if (projectId !== undefined) {
      const stmt = db.prepare(
        "SELECT * FROM vibe_learning_resources WHERE markdown_path IS NULL AND project_id = ? ORDER BY create_time ASC",
      );
      const records = stmt.all(projectId) as VLResourceRecord[];
      return records.map((record) => this.parseResource(record));
    }

    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_resources WHERE markdown_path IS NULL ORDER BY create_time ASC",
    );
    const records = stmt.all() as VLResourceRecord[];
    return records.map((record) => this.parseResource(record));
  }
}
