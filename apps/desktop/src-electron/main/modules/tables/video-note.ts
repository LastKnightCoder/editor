import Database from "better-sqlite3";
import { VideoNote } from "@/types";
import Operation from "./operation";
import ContentTable from "./content";
import VideoNoteItemTable from "./video-note-item";

export default class VideoNoteTable {
  static upgradeTable(db: Database.Database) {
    // Migration: Move from notes array to video_note_item table
    this.migrateToVideoNoteItem(db);
  }

  /**
   * Migrate from old notes array structure to new video_note_item table
   * This will:
   * 1. Check if migration is needed
   * 2. Merge all sub-notes into a single content for each video_note
   * 3. Create video_note_item records
   * 4. Remove the notes column from video_notes table
   */
  private static migrateToVideoNoteItem(db: Database.Database) {
    // Check if we have notes column (old structure)
    const tableInfo = db.prepare("PRAGMA table_info(video_notes)").all() as {
      name: string;
    }[];
    const hasNotesColumn = tableInfo.some((col) => col.name === "notes");

    if (!hasNotesColumn) {
      // Already migrated, add new columns if needed
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

    // Migrate each video_note
    for (const videoNote of allVideoNotes) {
      // Check if already migrated
      const existingItem = VideoNoteItemTable.getByVideoNoteId(
        db,
        videoNote.id,
      );
      if (existingItem) {
        continue; // Already migrated
      }

      const notes = JSON.parse(videoNote.notes) as {
        id: string;
        contentId: number;
        startTime: number;
      }[];

      if (notes.length === 0) {
        continue; // No notes to migrate
      }

      // Merge all notes content into one
      const mergedContent: any[] = [];
      let totalCount = 0;
      const contentIdsToDelete: number[] = [];

      for (const note of notes) {
        const content = ContentTable.getContentById(db, note.contentId);
        if (content) {
          // Add content to merged content
          if (Array.isArray(content.content)) {
            mergedContent.push(...content.content);
          }
          totalCount += content.count || 0;
          contentIdsToDelete.push(note.contentId);
        }
      }

      // Create new merged content
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

      // Create video_note_item record
      VideoNoteItemTable.create(db, {
        videoNoteId: videoNote.id,
        contentId: newContentId,
        title: "",
      });

      // Delete old content records
      for (const contentId of contentIdsToDelete) {
        ContentTable.deleteContent(db, contentId);
      }
    }

    // Rebuild table without notes column
    this.rebuildTableWithoutNotes(db);
  }

  private static addNewColumns(db: Database.Database) {
    const tableInfo = db.prepare("PRAGMA table_info(video_notes)").all() as {
      name: string;
    }[];
    const hasDescription = tableInfo.some((col) => col.name === "description");
    const hasTranscript = tableInfo.some((col) => col.name === "transcript");
    const hasTranscriptSegments = tableInfo.some(
      (col) => col.name === "transcript_segments",
    );
    const hasTranscriptWordSegments = tableInfo.some(
      (col) => col.name === "transcript_word_segments",
    );
    const hasSummary = tableInfo.some((col) => col.name === "summary");

    if (!hasDescription) {
      db.exec("ALTER TABLE video_notes ADD COLUMN description TEXT DEFAULT ''");
    }
    if (!hasTranscript) {
      db.exec("ALTER TABLE video_notes ADD COLUMN transcript TEXT DEFAULT ''");
    }
    if (!hasTranscriptSegments) {
      db.exec(
        "ALTER TABLE video_notes ADD COLUMN transcript_segments TEXT DEFAULT ''",
      );
    }
    if (!hasTranscriptWordSegments) {
      db.exec(
        "ALTER TABLE video_notes ADD COLUMN transcript_word_segments TEXT DEFAULT ''",
      );
    }
    if (!hasSummary) {
      db.exec("ALTER TABLE video_notes ADD COLUMN summary TEXT DEFAULT ''");
    }
  }

  private static rebuildTableWithoutNotes(db: Database.Database) {
    // SQLite doesn't support DROP COLUMN, so we need to rebuild the table
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
        summary TEXT DEFAULT ''
      )
    `);

    db.exec(`
      INSERT INTO video_notes_new (id, create_time, update_time, meta_info)
      SELECT id, create_time, update_time, meta_info FROM video_notes
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
    };
  }

  static parseVideoNote(note: any): VideoNote {
    console.log(`[VideoNoteTable] parseVideoNote called for id: ${note?.id}`);
    console.log(
      `[VideoNoteTable] note.meta_info raw value:`,
      `"${note?.meta_info}"`,
    );

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

    // 安全解析 meta_info，防止无效 JSON
    let metaInfo: VideoNote["metaInfo"];
    try {
      if (note.meta_info && note.meta_info !== "undefined") {
        console.log(`[VideoNoteTable] Parsing meta_info...`);
        metaInfo = JSON.parse(note.meta_info);
        console.log(`[VideoNoteTable] Parsed metaInfo:`, metaInfo);
      } else {
        console.log(
          `[VideoNoteTable] meta_info is invalid, using default. Value was:`,
          note.meta_info,
        );
        // 使用 local 类型作为默认值，filePath 为空
        metaInfo = { type: "local", filePath: "" } as VideoNote["metaInfo"];
      }
    } catch (e) {
      console.error(
        `[VideoNoteTable] Failed to parse meta_info for video note ${note.id}:`,
        e,
      );
      console.error(
        `[VideoNoteTable] meta_info value was:`,
        `"${note.meta_info}"`,
      );
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
    };
  }

  static createEmptyVideoNote(
    db: Database.Database,
    metaInfo: VideoNote["metaInfo"],
  ): VideoNote {
    // 确保 metaInfo 是有效的对象
    const safeMetaInfo = metaInfo || { type: "local", filePath: "" };

    const stmt = db.prepare(`
      INSERT INTO video_notes (create_time, update_time, meta_info, description, transcript)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const result = stmt.run(now, now, JSON.stringify(safeMetaInfo), "", "");

    return this.getVideoNoteById(db, result.lastInsertRowid);
  }

  static getVideoNoteById(
    db: Database.Database,
    id: number | bigint,
  ): VideoNote {
    console.log(
      `[VideoNoteTable] getVideoNoteById called with id: ${id}, type: ${typeof id}`,
    );

    const stmt = db.prepare(`
      SELECT * FROM video_notes WHERE id = ?
    `);
    const note = stmt.get(id) as any;

    console.log(
      `[VideoNoteTable] Raw note from DB:`,
      JSON.stringify(note, null, 2),
    );
    console.log(`[VideoNoteTable] meta_info value:`, note?.meta_info);
    console.log(`[VideoNoteTable] meta_info type:`, typeof note?.meta_info);

    if (!note) {
      throw new Error(`Video note ${id} not found`);
    }
    return this.parseVideoNote(note);
  }

  static getAllVideoNotes(db: Database.Database): VideoNote[] {
    const stmt = db.prepare(`
      SELECT * FROM video_notes
    `);
    const allVideoNotes = stmt.all();
    return allVideoNotes.map((note: any) => this.parseVideoNote(note));
  }

  static updateVideoNote(
    db: Database.Database,
    note: { id: number; metaInfo?: VideoNote["metaInfo"] },
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
    payload: { id: number; description: string },
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
    },
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, transcript = ?, transcript_segments = ?, transcript_word_segments = ? WHERE id = ?
    `);
    stmt.run(
      now,
      payload.transcript,
      payload.transcriptSegments
        ? JSON.stringify(payload.transcriptSegments)
        : "",
      payload.transcriptWordSegments
        ? JSON.stringify(payload.transcriptWordSegments)
        : "",
      payload.id,
    );
    return this.getVideoNoteById(db, payload.id);
  }

  static updateSummary(
    db: Database.Database,
    payload: { id: number; summary: string },
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET update_time = ?, summary = ? WHERE id = ?
    `);
    stmt.run(now, payload.summary, payload.id);
    return this.getVideoNoteById(db, payload.id);
  }

  static deleteVideoNote(db: Database.Database, id: number): number {
    // Delete associated video_note_item first
    const noteItem = VideoNoteItemTable.getByVideoNoteId(db, id);
    if (noteItem) {
      VideoNoteItemTable.remove(db, noteItem.id);
    }

    const stmt = db.prepare(`
      DELETE FROM video_notes WHERE id = ?
    `);
    const result = stmt.run(id);
    Operation.insertOperation(db, "video-note", "delete", id, Date.now());
    return result.changes;
  }
}
