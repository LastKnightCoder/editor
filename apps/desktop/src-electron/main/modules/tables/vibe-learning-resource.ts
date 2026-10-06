import Database from "better-sqlite3";
import {
  VLResource,
  CreateVLResource,
  UpdateVLResource,
  VLResourceType,
  VLResourceSourceType,
  VLNoteType,
} from "@/types/vibe-learning";
import Operation from "./operation";
import log from "electron-log";

interface VLResourceRecord {
  id: number;
  project_id: number;
  sort_index: number;
  create_time: number;
  update_time: number;
  name: string;
  original_path: string;
  markdown_path: string | null;
  resource_type: string;
  file_size: number | null;
  duration: number | null;
  source_type: string | null;
  source_meta_info: string | null;
  transcript_segments: string | null;
}

const RESOURCE_SORT_STEP = 1024;
const RESOURCE_SORT_BASE_OFFSET = 2;
const RESOURCE_LIST_ORDER_SQL = "ORDER BY sort_index ASC, create_time DESC, id DESC";

export default class VibeLearningResourceTable {
  static getListenEvents() {
    return {
      "vl-create-resource": this.createResource.bind(this),
      "vl-ensure-note-resource": this.ensureNoteResource.bind(this),
      "vl-update-resource": this.updateResource.bind(this),
      "vl-update-markdown-path": this.updateMarkdownPath.bind(this),
      "vl-delete-resource": this.deleteResource.bind(this),
      "vl-get-resource": this.getResourceById.bind(this),
      "vl-get-resources-by-project": this.getResourcesByProjectId.bind(this),
      "vl-get-all-resources": this.getAllResources.bind(this),
      "vl-get-resources-by-ids": this.getResourcesByIds.bind(this),
      "vl-reorder-resources": this.reorderResources.bind(this),
    };
  }

  static parseResource(record: VLResourceRecord): VLResource {
    return {
      id: record.id,
      projectId: record.project_id,
      sortIndex: record.sort_index,
      createTime: record.create_time,
      updateTime: record.update_time,
      name: record.name,
      originalPath: record.original_path,
      markdownPath: record.markdown_path || null,
      resourceType: record.resource_type as VLResourceType,
      fileSize: record.file_size || null,
      duration: record.duration || null,
      sourceType: (record.source_type as VLResourceSourceType) || null,
      sourceMetaInfo: record.source_meta_info || null,
      transcriptSegments: record.transcript_segments
        ? JSON.parse(record.transcript_segments)
        : null,
    };
  }

  static normalizeProjectsWithZeroSortIndex(db: Database.Database) {
    const projects = db
      .prepare(
        `
          SELECT DISTINCT project_id
          FROM vibe_learning_resources
          WHERE sort_index = 0
        `
      )
      .all() as Array<{ project_id: number }>;

    for (const project of projects) {
      this.normalizeProjectSortIndexes(db, project.project_id);
    }
  }

  static normalizeProjectSortIndexes(db: Database.Database, projectId: number) {
    const orderedIds = db
      .prepare(
        `
          SELECT id
          FROM vibe_learning_resources
          WHERE project_id = ?
          ORDER BY
            CASE WHEN sort_index = 0 THEN 1 ELSE 0 END ASC,
            sort_index ASC,
            create_time DESC,
            id DESC
        `
      )
      .all(projectId) as Array<{ id: number }>;

    if (orderedIds.length === 0) {
      return;
    }

    const now = Date.now();
    const updateStmt = db.prepare(
      `
        UPDATE vibe_learning_resources
        SET sort_index = ?, update_time = ?
        WHERE id = ?
      `
    );

    orderedIds.forEach(({ id }, index) => {
      updateStmt.run((index + RESOURCE_SORT_BASE_OFFSET) * RESOURCE_SORT_STEP, now, id);
    });
  }

  static getMinSortIndex(db: Database.Database, projectId: number): number | null {
    const row = db
      .prepare(
        `
          SELECT MIN(sort_index) AS min_sort
          FROM vibe_learning_resources
          WHERE project_id = ?
        `
      )
      .get(projectId) as { min_sort: number | null };

    return row?.min_sort ?? null;
  }

  static getCreateSortIndex(db: Database.Database, projectId: number): number {
    const minSortIndex = this.getMinSortIndex(db, projectId);

    if (minSortIndex === null) {
      return RESOURCE_SORT_STEP * RESOURCE_SORT_BASE_OFFSET;
    }

    if (minSortIndex > RESOURCE_SORT_STEP) {
      return minSortIndex - RESOURCE_SORT_STEP;
    }

    this.normalizeProjectSortIndexes(db, projectId);
    return RESOURCE_SORT_STEP;
  }

  static createResource(db: Database.Database, params: CreateVLResource): VLResource {
    const now = Date.now();
    const sortIndex = this.getCreateSortIndex(db, params.projectId);
    const stmt = db.prepare(`
      INSERT INTO vibe_learning_resources
      (project_id, sort_index, create_time, update_time, name, original_path, markdown_path, resource_type, file_size, duration, source_type, source_meta_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      params.projectId,
      sortIndex,
      now,
      now,
      params.name,
      params.originalPath,
      null, // markdown_path 初始为空
      params.resourceType,
      params.fileSize || null,
      params.duration || null,
      params.sourceType || null,
      params.sourceMetaInfo || null
    );

    const resourceId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "vibe-learning-resource", "insert", resourceId, now);

    log.info(
      `[VibeLearningResource] Created resource: ${resourceId} for project ${params.projectId}, sourceType: ${params.sourceType || "local"}`
    );

    const resource = this.getResourceById(db, resourceId);
    if (!resource) {
      throw new Error(`Failed to retrieve created resource: ${resourceId}`);
    }
    return resource;
  }

  static getNoteResourceByContentId(
    db: Database.Database,
    projectId: number,
    contentId: number
  ): VLResource | null {
    const stmt = db.prepare(
      `
        SELECT *
        FROM vibe_learning_resources
        WHERE project_id = ?
          AND source_type = 'note'
          AND original_path = ?
        ORDER BY create_time DESC
        LIMIT 1
      `
    );
    const record = stmt.get(projectId, `note://${contentId}`) as VLResourceRecord | undefined;

    if (!record) {
      return null;
    }

    return this.parseResource(record);
  }

  static ensureNoteResource(
    db: Database.Database,
    params: {
      projectId: number;
      contentId: number;
      title: string;
      noteType: VLNoteType | string;
      originalId: number;
    }
  ): { resource: VLResource; created: boolean } {
    const existing = this.getNoteResourceByContentId(db, params.projectId, params.contentId);
    if (existing) {
      return {
        resource: existing,
        created: false,
      };
    }

    const safeTitle = params.title.trim() || "未命名笔记";
    const resource = this.createResource(db, {
      projectId: params.projectId,
      name: `${safeTitle}.md`,
      originalPath: `note://${params.contentId}`,
      resourceType: "md",
      sourceType: "note",
      sourceMetaInfo: JSON.stringify({
        contentId: params.contentId,
        type: params.noteType,
        title: safeTitle,
        originalId: params.originalId,
      }),
    });

    return {
      resource,
      created: true,
    };
  }

  static updateResource(db: Database.Database, params: UpdateVLResource): VLResource | null {
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
      params.markdownPath !== undefined ? params.markdownPath : existing.markdownPath,
      params.fileSize ?? existing.fileSize,
      params.duration ?? existing.duration,
      params.id
    );

    Operation.insertOperation(db, "vibe-learning-resource", "update", params.id, now);

    return this.getResourceById(db, params.id);
  }

  static updateMarkdownPath(db: Database.Database, id: number, markdownPath: string): boolean {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE vibe_learning_resources SET
        update_time = ?,
        markdown_path = ?
      WHERE id = ?
    `);

    const res = stmt.run(now, markdownPath, id);

    if (res.changes > 0) {
      Operation.insertOperation(db, "vibe-learning-resource", "update", id, now);
      log.info(`[VibeLearningResource] Updated markdown path for resource: ${id}`);
      return true;
    }

    return false;
  }

  static updateTranscriptSegments(
    db: Database.Database,
    id: number,
    segments: Array<{ text: string; start: number; end: number }>
  ): boolean {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE vibe_learning_resources SET
        update_time = ?,
        transcript_segments = ?
      WHERE id = ?
    `);

    const res = stmt.run(now, JSON.stringify(segments), id);

    if (res.changes > 0) {
      log.info(
        `[VibeLearningResource] Updated transcript segments for resource: ${id}, count=${segments.length}`
      );
      return true;
    }

    return false;
  }

  static deleteResource(db: Database.Database, id: number): boolean {
    const stmt = db.prepare("DELETE FROM vibe_learning_resources WHERE id = ?");
    const res = stmt.run(id);

    if (res.changes > 0) {
      Operation.insertOperation(db, "vibe-learning-resource", "delete", id, Date.now());
      log.info(`[VibeLearningResource] Deleted resource: ${id}`);
      return true;
    }

    return false;
  }

  static deleteResourcesByProjectId(db: Database.Database, projectId: number): number {
    const resources = this.getResourcesByProjectId(db, projectId);
    let deletedCount = 0;

    for (const resource of resources) {
      if (this.deleteResource(db, resource.id)) {
        deletedCount++;
      }
    }

    log.info(`[VibeLearningResource] Deleted ${deletedCount} resources for project ${projectId}`);
    return deletedCount;
  }

  static getResourceById(db: Database.Database, id: number): VLResource | null {
    const stmt = db.prepare("SELECT * FROM vibe_learning_resources WHERE id = ?");
    const record = stmt.get(id) as VLResourceRecord | undefined;

    if (!record) {
      return null;
    }

    return this.parseResource(record);
  }

  static getResourcesByProjectId(db: Database.Database, projectId: number): VLResource[] {
    const stmt = db.prepare(
      `SELECT * FROM vibe_learning_resources WHERE project_id = ? ${RESOURCE_LIST_ORDER_SQL}`
    );
    const records = stmt.all(projectId) as VLResourceRecord[];

    return records.map(record => this.parseResource(record));
  }

  static getAllResources(db: Database.Database): VLResource[] {
    const stmt = db.prepare(
      `SELECT * FROM vibe_learning_resources ORDER BY project_id ASC, sort_index ASC, create_time DESC, id DESC`
    );
    const records = stmt.all() as VLResourceRecord[];

    return records.map(record => this.parseResource(record));
  }

  static getResourcesByIds(db: Database.Database, ids: number[]): VLResource[] {
    if (ids.length === 0) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(
      `SELECT * FROM vibe_learning_resources WHERE id IN (${placeholders}) ${RESOURCE_LIST_ORDER_SQL}`
    );
    const records = stmt.all(...ids) as VLResourceRecord[];

    return records.map(record => this.parseResource(record));
  }

  static reorderResources(
    db: Database.Database,
    params: { projectId: number; orderedIds: number[] }
  ): number {
    const currentIds = this.getResourcesByProjectId(db, params.projectId).map(
      resource => resource.id
    );

    if (currentIds.length === 0) {
      return 0;
    }

    const currentIdSet = new Set(currentIds);
    const orderedIds = params.orderedIds.filter(
      (id, index, array) => currentIdSet.has(id) && array.indexOf(id) === index
    );
    const remainingIds = currentIds.filter(id => !orderedIds.includes(id));
    const nextIds = [...orderedIds, ...remainingIds];
    const now = Date.now();
    const updateStmt = db.prepare(
      `
        UPDATE vibe_learning_resources
        SET sort_index = ?, update_time = ?
        WHERE id = ? AND project_id = ?
      `
    );

    nextIds.forEach((id, index) => {
      updateStmt.run(
        (index + RESOURCE_SORT_BASE_OFFSET) * RESOURCE_SORT_STEP,
        now,
        id,
        params.projectId
      );
      Operation.insertOperation(db, "vibe-learning-resource", "update", id, now);
    });

    return nextIds.length;
  }

  static getPendingResources(db: Database.Database, projectId?: number): VLResource[] {
    if (projectId !== undefined) {
      const stmt = db.prepare(
        "SELECT * FROM vibe_learning_resources WHERE markdown_path IS NULL AND project_id = ? ORDER BY create_time ASC"
      );
      const records = stmt.all(projectId) as VLResourceRecord[];
      return records.map(record => this.parseResource(record));
    }

    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_resources WHERE markdown_path IS NULL ORDER BY create_time ASC"
    );
    const records = stmt.all() as VLResourceRecord[];
    return records.map(record => this.parseResource(record));
  }
}
