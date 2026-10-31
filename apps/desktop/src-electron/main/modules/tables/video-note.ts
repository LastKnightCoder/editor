import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { basename } from "node:path";
import { VideoNote } from "@/types";
import type { VideoCaptions } from "@tau/plugins";
import Operation from "./operation";
import VideoNoteItemTable from "./video-note-item";
import ChatSessionTable from "./chat-session";
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
  static getListenEvents() {
    return {
      "create-empty-video-note": this.createEmptyVideoNote.bind(this),
      "update-video-note": this.updateVideoNote.bind(this),
      "delete-video-note": this.deleteVideoNote.bind(this),
      "get-video-note-by-id": this.getVideoNoteById.bind(this),
      "get-all-video-notes": this.getAllVideoNotes.bind(this),
      "update-video-note-description": this.updateDescription.bind(this),
      "update-video-note-transcript": this.updateTranscript.bind(this),
      "import-video-note-captions": this.importCaptions.bind(this),
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

  static importCaptions(
    db: Database.Database,
    payload: { id: number; expectedUpdateTime: number; captions: VideoCaptions }
  ): VideoNote | null {
    const note = this.getVideoNoteById(db, payload.id);
    if (
      !note ||
      note.updateTime !== payload.expectedUpdateTime ||
      note.transcript?.trim() ||
      note.transcriptSegments?.length
    )
      return null;
    return this.updateTranscript(db, {
      id: payload.id,
      transcript: payload.captions.segments.map(segment => segment.text).join(" "),
      transcriptSegments: [...payload.captions.segments],
    });
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
    // 视频笔记的对话（目录行 + 会话文件）随笔记一起删
    ChatSessionTable.removeByDomain(db, "video-note-chat", String(id));
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
