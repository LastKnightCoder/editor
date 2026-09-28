import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { basename } from "node:path";
import { AudioNote } from "@/types";
import Operation from "./operation";
import AudioNoteItemTable from "./audio-note-item";

interface AudioNoteRow {
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
  speakers?: string;
  chapters?: string;
}

export default class AudioNoteTable {
  static upgradeTable(_db: Database.Database) {
    // placeholder for future migrations
  }

  static getListenEvents() {
    return {
      "create-empty-audio-note": this.createEmptyAudioNote.bind(this),
      "update-audio-note": this.updateAudioNote.bind(this),
      "delete-audio-note": this.deleteAudioNote.bind(this),
      "get-audio-note-by-id": this.getAudioNoteById.bind(this),
      "get-all-audio-notes": this.getAllAudioNotes.bind(this),
      "update-audio-note-description": this.updateDescription.bind(this),
      "update-audio-note-transcript": this.updateTranscript.bind(this),
      "update-audio-note-summary": this.updateSummary.bind(this),
      "update-audio-note-highlights": this.updateHighlights.bind(this),
      "update-audio-note-insights": this.updateInsights.bind(this),
      "update-audio-note-speakers": this.updateSpeakers.bind(this),
      "update-audio-note-chapters": this.updateChapters.bind(this),
    };
  }

  static parseAudioNote(note: AudioNoteRow): AudioNote {
    let transcriptSegments: AudioNote["transcriptSegments"] = undefined;
    if (note.transcript_segments) {
      try {
        transcriptSegments = JSON.parse(note.transcript_segments);
      } catch {
        transcriptSegments = undefined;
      }
    }

    let transcriptWordSegments: AudioNote["transcriptWordSegments"] = undefined;
    if (note.transcript_word_segments) {
      try {
        transcriptWordSegments = JSON.parse(note.transcript_word_segments);
      } catch {
        transcriptWordSegments = undefined;
      }
    }

    let highlights: AudioNote["highlights"] = undefined;
    if (note.highlights) {
      try {
        highlights = JSON.parse(note.highlights);
      } catch {
        highlights = undefined;
      }
    }

    let insights: AudioNote["insights"] = undefined;
    if (note.insights) {
      try {
        insights = JSON.parse(note.insights);
      } catch {
        insights = undefined;
      }
    }

    let speakers: AudioNote["speakers"] = undefined;
    if (note.speakers) {
      try {
        speakers = JSON.parse(note.speakers);
      } catch {
        speakers = undefined;
      }
    }

    let chapters: AudioNote["chapters"] = undefined;
    if (note.chapters) {
      try {
        chapters = JSON.parse(note.chapters);
      } catch {
        chapters = undefined;
      }
    }

    let metaInfo: AudioNote["metaInfo"];
    try {
      if (note.meta_info && note.meta_info !== "undefined") {
        metaInfo = JSON.parse(note.meta_info);
      } else {
        metaInfo = { type: "local", filePath: "" } as AudioNote["metaInfo"];
      }
    } catch (e) {
      console.error(`解析 meta_info 失败，audio_note id: ${note.id}`, e);
      metaInfo = { type: "local", filePath: "" } as AudioNote["metaInfo"];
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
      speakers,
      chapters,
    };
  }

  static createEmptyAudioNote(db: Database.Database, metaInfo: AudioNote["metaInfo"]): AudioNote {
    const safeMetaInfo = metaInfo || { type: "local", filePath: "" };

    const stmt = db.prepare(`
      INSERT INTO audio_notes (create_time, update_time, meta_info, description, transcript)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const result = stmt.run(now, now, JSON.stringify(safeMetaInfo), "", "");

    return this.getAudioNoteById(db, result.lastInsertRowid);
  }

  static getAudioNoteById(db: Database.Database, id: number | bigint): AudioNote {
    const stmt = db.prepare(`
      SELECT * FROM audio_notes WHERE id = ?
    `);
    const note = stmt.get(id) as AudioNoteRow | undefined;

    if (!note) {
      throw new Error(`音频笔记 ${id} 不存在`);
    }
    return this.parseAudioNote(note);
  }

  static getAllAudioNotes(db: Database.Database): AudioNote[] {
    const stmt = db.prepare(`
      SELECT * FROM audio_notes
    `);
    const allAudioNotes = stmt.all() as AudioNoteRow[];
    return allAudioNotes.map(note => this.parseAudioNote(note));
  }

  static updateAudioNote(
    db: Database.Database,
    note: { id: number; metaInfo?: AudioNote["metaInfo"] }
  ): AudioNote {
    const now = Date.now();
    const existing = this.getAudioNoteById(db, note.id);
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, meta_info = ? WHERE id = ?
    `);
    stmt.run(now, JSON.stringify(note.metaInfo ?? existing.metaInfo), note.id);
    Operation.insertOperation(db, "audio-note", "update", note.id, Date.now());
    return this.getAudioNoteById(db, note.id);
  }

  static updateDescription(
    db: Database.Database,
    payload: { id: number; description: string }
  ): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, description = ? WHERE id = ?
    `);
    stmt.run(now, payload.description, payload.id);
    return this.getAudioNoteById(db, payload.id);
  }

  static updateTranscript(
    db: Database.Database,
    payload: {
      id: number;
      transcript: string;
      transcriptSegments?: AudioNote["transcriptSegments"];
      transcriptWordSegments?: AudioNote["transcriptWordSegments"];
    }
  ): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, transcript = ?, transcript_segments = ?, transcript_word_segments = ? WHERE id = ?
    `);
    stmt.run(
      now,
      payload.transcript,
      payload.transcriptSegments ? JSON.stringify(payload.transcriptSegments) : "",
      payload.transcriptWordSegments ? JSON.stringify(payload.transcriptWordSegments) : "",
      payload.id
    );
    return this.getAudioNoteById(db, payload.id);
  }

  static updateSummary(db: Database.Database, payload: { id: number; summary: string }): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, summary = ? WHERE id = ?
    `);
    stmt.run(now, payload.summary, payload.id);
    return this.getAudioNoteById(db, payload.id);
  }

  static updateHighlights(
    db: Database.Database,
    payload: {
      id: number;
      highlights: AudioNote["highlights"];
    }
  ): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, highlights = ? WHERE id = ?
    `);
    stmt.run(now, JSON.stringify(payload.highlights || []), payload.id);
    return this.getAudioNoteById(db, payload.id);
  }

  static updateInsights(
    db: Database.Database,
    payload: {
      id: number;
      insights: AudioNote["insights"];
    }
  ): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, insights = ? WHERE id = ?
    `);
    stmt.run(now, payload.insights ? JSON.stringify(payload.insights) : "", payload.id);
    return this.getAudioNoteById(db, payload.id);
  }

  static updateSpeakers(
    db: Database.Database,
    payload: {
      id: number;
      speakers: AudioNote["speakers"];
    }
  ): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, speakers = ? WHERE id = ?
    `);
    stmt.run(now, JSON.stringify(payload.speakers || []), payload.id);
    return this.getAudioNoteById(db, payload.id);
  }

  static updateChapters(
    db: Database.Database,
    payload: {
      id: number;
      chapters: AudioNote["chapters"];
    }
  ): AudioNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE audio_notes SET update_time = ?, chapters = ? WHERE id = ?
    `);
    stmt.run(now, JSON.stringify(payload.chapters || []), payload.id);
    return this.getAudioNoteById(db, payload.id);
  }

  static deleteAudioNote(
    db: Database.Database,
    id: number,
    ctx: CommandContext = fallbackCommandContext
  ): number {
    const result = db.transaction(() => {
      AudioNoteItemTable.removeByAudioNoteId(db, id);

      const stmt = db.prepare(`
        DELETE FROM audio_notes WHERE id = ?
      `);
      const deleteResult = stmt.run(id);
      if (deleteResult.changes > 0) {
        Operation.insertOperation(db, "audio-note", "delete", id, Date.now());
      }
      return deleteResult;
    })();

    if (result.changes > 0) {
      ctx.broadcastAll("audio-note:deleted", { databaseName: basename(db.name), audioNoteId: id });
    }
    return result.changes;
  }
}
