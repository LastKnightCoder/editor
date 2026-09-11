import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { basename } from "node:path";
import type { Descendant } from "slate";
import { VideoNote } from "@/types";
import Operation from "./operation";
import ContentTable from "./content";
import VideoNoteItemTable from "./video-note-item";
import VideoNoteChatTable from "./video-note-chat";
import videoNoteIndexQueue from "../video-note-index-queue";

interface VideoNoteRow {
  id: number;
  create_time: number;
  update_time: number;
  meta_info: string;
  description?: string;
  transcript?: string;
  transcript_segments?: string;
  transcript_word_segments?: string;
  summary?: string;
  highlights?: string;
  insights?: string;
}

export default class VideoNoteTable {
  static upgradeTable(db: Database.Database) {
    this.migrateToVideoNoteItem(db);
  }

  private static migrateToVideoNoteItem(db: Database.Database) {
    const tableInfo = db.prepare("PRAGMA table_info(video_notes)").all() as {
      name: string;
    }[];
    const hasNotesColumn = tableInfo.some(col => col.name === "notes");

    if (!hasNotesColumn) {
      this.addNewColumns(db);
      return;
    }

    const allVideoNotes = db.prepare("SELECT * FROM video_notes").all() as {
      id: number;
      notes: string;
      create_time: number;
      update_time: number;
      meta_info: string;
    }[];

    for (const videoNote of allVideoNotes) {
      const existingItem = VideoNoteItemTable.getByVideoNoteId(db, videoNote.id);
      if (existingItem) {
        continue;
      }

      const notes = JSON.parse(videoNote.notes) as {
        id: string;
        contentId: number;
        startTime: number;
      }[];

      if (notes.length === 0) {
        continue;
      }

      const mergedContent: Descendant[] = [];
      let totalCount = 0;
      const contentIdsToDelete: number[] = [];

      for (const note of notes) {
        const content = ContentTable.getContentById(db, note.contentId);
        if (content) {
          if (Array.isArray(content.content)) {
            mergedContent.push(...(content.content as Descendant[]));
          }
          totalCount += content.count || 0;
          contentIdsToDelete.push(note.contentId);
        }
      }

      const newContentId = ContentTable.createContent(db, {
        content:
          mergedContent.length > 0
            ? mergedContent
            : [
                {
                  type: "paragraph",
                  children: [{ type: "formatted", text: "" }],
                },
              ],
        count: totalCount,
      });

      VideoNoteItemTable.create(db, {
        videoNoteId: videoNote.id,
        contentId: newContentId,
        title: "",
      });

      for (const contentId of contentIdsToDelete) {
        ContentTable.deleteContent(db, contentId);
      }
    }

    this.rebuildTableWithoutNotes(db);
  }

  private static addNewColumns(db: Database.Database) {
    const tableInfo = db.prepare("PRAGMA table_info(video_notes)").all() as {
      name: string;
    }[];
    const hasDescription = tableInfo.some(col => col.name === "description");
    const hasTranscript = tableInfo.some(col => col.name === "transcript");
    const hasTranscriptSegments = tableInfo.some(col => col.name === "transcript_segments");
    const hasTranscriptWordSegments = tableInfo.some(
      col => col.name === "transcript_word_segments"
    );
    const hasSummary = tableInfo.some(col => col.name === "summary");
    const hasEbookMarkdown = tableInfo.some(col => col.name === "ebook_markdown");
    const hasHighlights = tableInfo.some(col => col.name === "highlights");
    const hasInsights = tableInfo.some(col => col.name === "insights");

    if (!hasDescription) {
      db.exec("ALTER TABLE video_notes ADD COLUMN description TEXT DEFAULT ''");
    }
    if (!hasTranscript) {
      db.exec("ALTER TABLE video_notes ADD COLUMN transcript TEXT DEFAULT ''");
    }
    if (!hasTranscriptSegments) {
      db.exec("ALTER TABLE video_notes ADD COLUMN transcript_segments TEXT DEFAULT ''");
    }
    if (!hasTranscriptWordSegments) {
      db.exec("ALTER TABLE video_notes ADD COLUMN transcript_word_segments TEXT DEFAULT ''");
    }
    if (!hasSummary) {
      db.exec("ALTER TABLE video_notes ADD COLUMN summary TEXT DEFAULT ''");
    }
    if (!hasHighlights) {
      db.exec("ALTER TABLE video_notes ADD COLUMN highlights TEXT DEFAULT '[]'");
    }
    if (!hasInsights) {
      db.exec("ALTER TABLE video_notes ADD COLUMN insights TEXT DEFAULT ''");
    }
    if (hasEbookMarkdown) {
      this.rebuildTableWithoutEbookMarkdown(db);
    }
  }

  private static rebuildTableWithoutNotes(db: Database.Database) {
    // SQLite 不支持 DROP COLUMN，通过重建表来移除旧列
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_notes_new (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        meta_info TEXT NOT NULL,
        description TEXT DEFAULT '',
        transcript TEXT DEFAULT '',
        transcript_segments TEXT DEFAULT '',
        transcript_word_segments TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        highlights TEXT DEFAULT '[]',
        insights TEXT DEFAULT ''
      )
    `);

    db.exec(`
      INSERT INTO video_notes_new (id, create_time, update_time, meta_info)
      SELECT id, create_time, update_time, meta_info FROM video_notes
    `);

    db.exec("DROP TABLE video_notes");
    db.exec("ALTER TABLE video_notes_new RENAME TO video_notes");
  }

  private static rebuildTableWithoutEbookMarkdown(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_notes_new (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        meta_info TEXT NOT NULL,
        description TEXT DEFAULT '',
        transcript TEXT DEFAULT '',
        transcript_segments TEXT DEFAULT '',
        transcript_word_segments TEXT DEFAULT '',
        summary TEXT DEFAULT '',
        highlights TEXT DEFAULT '[]',
        insights TEXT DEFAULT ''
      )
    `);

    db.exec(`
      INSERT INTO video_notes_new (
        id,
        create_time,
        update_time,
        meta_info,
        description,
        transcript,
        transcript_segments,
        transcript_word_segments,
        summary,
        highlights,
        insights
      )
      SELECT
        id,
        create_time,
        update_time,
        meta_info,
        description,
        transcript,
        transcript_segments,
        transcript_word_segments,
        summary,
        highlights,
        insights
      FROM video_notes
    `);

    db.exec("DROP TABLE video_notes");
    db.exec("ALTER TABLE video_notes_new RENAME TO video_notes");
  }

  static getListenEvents() {
    return {
      "create-empty-video-note": this.createEmptyVideoNote.bind(this),
      "update-video-note": this.updateVideoNote.bind(this),
      "delete-video-note": this.deleteVideoNote.bind(this),
      "get-video-note-by-id": this.getVideoNoteById.bind(this),
      "get-all-video-notes": this.getAllVideoNotes.bind(this),
      "update-video-note-description": this.updateDescription.bind(this),
      "update-video-note-transcript": this.updateTranscript.bind(this),
      "update-video-note-summary": this.updateSummary.bind(this),
      "update-video-note-highlights": this.updateHighlights.bind(this),
      "update-video-note-insights": this.updateInsights.bind(this),
    };
  }

  static parseVideoNote(note: VideoNoteRow): VideoNote {
    let transcriptSegments: VideoNote["transcriptSegments"] = undefined;
    if (note.transcript_segments) {
      try {
        transcriptSegments = JSON.parse(note.transcript_segments);
      } catch {
        transcriptSegments = undefined;
      }
    }

    let transcriptWordSegments: VideoNote["transcriptWordSegments"] = undefined;
    if (note.transcript_word_segments) {
      try {
        transcriptWordSegments = JSON.parse(note.transcript_word_segments);
      } catch {
        transcriptWordSegments = undefined;
      }
    }

    let highlights: VideoNote["highlights"] = undefined;
    if (note.highlights) {
      try {
        highlights = JSON.parse(note.highlights);
      } catch {
        highlights = undefined;
      }
    }

    let insights: VideoNote["insights"] = undefined;
    if (note.insights) {
      try {
        insights = JSON.parse(note.insights);
      } catch {
        insights = undefined;
      }
    }

    // 安全解析 meta_info，防止无效 JSON 导致崩溃
    let metaInfo: VideoNote["metaInfo"];
    try {
      if (note.meta_info && note.meta_info !== "undefined") {
        metaInfo = JSON.parse(note.meta_info);
      } else {
        metaInfo = { type: "local", filePath: "" } as VideoNote["metaInfo"];
      }
    } catch (e) {
      console.error(`解析 meta_info 失败，video_note id: ${note.id}`, e);
      metaInfo = { type: "local", filePath: "" } as VideoNote["metaInfo"];
    }

    return {
      id: note.id,
      createTime: note.create_time,
      updateTime: note.update_time,
      metaInfo,
      description: note.description || "",
      transcript: note.transcript || "",
      transcriptSegments,
      transcriptWordSegments,
      summary: note.summary || "",
      highlights,
      insights,
    };
  }

  static createEmptyVideoNote(db: Database.Database, metaInfo: VideoNote["metaInfo"]): VideoNote {
    const safeMetaInfo = metaInfo || { type: "local", filePath: "" };

    const stmt = db.prepare(`
      INSERT INTO video_notes (create_time, update_time, meta_info, description, transcript)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const result = stmt.run(now, now, JSON.stringify(safeMetaInfo), "", "");

    return this.getVideoNoteById(db, result.lastInsertRowid);
  }

  static getVideoNoteById(db: Database.Database, id: number | bigint): VideoNote {
    const stmt = db.prepare(`
      SELECT * FROM video_notes WHERE id = ?
    `);
    const note = stmt.get(id) as VideoNoteRow | undefined;

    if (!note) {
      throw new Error(`视频笔记 ${id} 不存在`);
    }
    return this.parseVideoNote(note);
  }

  static getAllVideoNotes(db: Database.Database): VideoNote[] {
    const stmt = db.prepare(`
      SELECT * FROM video_notes
    `);
    const allVideoNotes = stmt.all() as VideoNoteRow[];
    return allVideoNotes.map(note => this.parseVideoNote(note));
  }

  static updateVideoNote(
    db: Database.Database,
    note: { id: number; metaInfo?: VideoNote["metaInfo"] }
  ): VideoNote {
    const now = Date.now();
    const existing = this.getVideoNoteById(db, note.id);
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, meta_info = ? WHERE id = ?
    `);
    stmt.run(now, JSON.stringify(note.metaInfo ?? existing.metaInfo), note.id);
    Operation.insertOperation(db, "video-note", "update", note.id, Date.now());
    return this.getVideoNoteById(db, note.id);
  }

  static updateDescription(
    db: Database.Database,
    payload: { id: number; description: string }
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, description = ? WHERE id = ?
    `);
    stmt.run(now, payload.description, payload.id);
    return this.getVideoNoteById(db, payload.id);
  }

  static updateTranscript(
    db: Database.Database,
    payload: {
      id: number;
      transcript: string;
      transcriptSegments?: VideoNote["transcriptSegments"];
      transcriptWordSegments?: VideoNote["transcriptWordSegments"];
    }
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, transcript = ?, transcript_segments = ?, transcript_word_segments = ? WHERE id = ?
    `);
    stmt.run(
      now,
      payload.transcript,
      payload.transcriptSegments ? JSON.stringify(payload.transcriptSegments) : "",
      payload.transcriptWordSegments ? JSON.stringify(payload.transcriptWordSegments) : "",
      payload.id
    );
    if (payload.transcriptSegments && payload.transcriptSegments.length > 0) {
      videoNoteIndexQueue.enqueueTask(basename(db.name), payload.id);
    }
    return this.getVideoNoteById(db, payload.id);
  }

  static updateSummary(db: Database.Database, payload: { id: number; summary: string }): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, summary = ? WHERE id = ?
    `);
    stmt.run(now, payload.summary, payload.id);
    return this.getVideoNoteById(db, payload.id);
  }

  static updateHighlights(
    db: Database.Database,
    payload: {
      id: number;
      highlights: VideoNote["highlights"];
    }
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, highlights = ? WHERE id = ?
    `);
    stmt.run(now, JSON.stringify(payload.highlights || []), payload.id);
    return this.getVideoNoteById(db, payload.id);
  }

  static updateInsights(
    db: Database.Database,
    payload: {
      id: number;
      insights: VideoNote["insights"];
    }
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, insights = ? WHERE id = ?
    `);
    stmt.run(now, payload.insights ? JSON.stringify(payload.insights) : "", payload.id);
    return this.getVideoNoteById(db, payload.id);
  }

  static deleteVideoNote(
    db: Database.Database,
    id: number,
    ctx: CommandContext = fallbackCommandContext
  ): number {
    VideoNoteItemTable.removeByVideoNoteId(db, id);
    VideoNoteChatTable.deleteChatsByVideoNoteId(db, id);
    videoNoteIndexQueue.cleanupVideoNoteArtifacts(basename(db.name), id);

    const stmt = db.prepare(`
      DELETE FROM video_notes WHERE id = ?
    `);
    const result = stmt.run(id);
    Operation.insertOperation(db, "video-note", "delete", id, Date.now());
    if (result.changes > 0) {
      ctx.broadcastAll("video-note:deleted", { databaseName: basename(db.name), videoNoteId: id });
    }
    return result.changes;
  }
}
