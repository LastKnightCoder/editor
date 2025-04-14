import Database from "better-sqlite3";
import { VideoNote } from "@/types";
import Operation from "./operation";
import ContentTable from "./content";
import { produce } from "immer";
import { BrowserWindow } from "electron";

interface InnerSubVideoNote {
  id: string;
  contentId: number;
  startTime: number;
}

export default class VideoNoteTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_notes (
        id INTEGER PRIMARY KEY,
        notes TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        meta_info TEXT NOT NULL
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    const tableInfoStmt = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'video_notes'",
    );
    const tableInfo = (tableInfoStmt.get() as { sql: string }).sql;
    if (tableInfo.includes("count")) {
      db.prepare(`ALTER TABLE video_notes DROP COLUMN count`).run();
    }

    // 读取所有的 notes，把 content, count 存入到 ContentTable 中
    const stmt = db.prepare(`
      SELECT id, notes FROM video_notes
    `);
    const notes = stmt.all() as {
      id: number;
      notes: string;
    }[];
    for (const note of notes) {
      const notesObj: Omit<VideoNote["notes"][number], "contentId">[] =
        JSON.parse(note.notes);
      const newNotes = produce(notesObj, (draft) => {
        for (const noteObj of draft) {
          // 如果 contentId 存在，则跳过
          // @ts-ignore
          if (noteObj.contentId) {
            continue;
          }
          const contentId = ContentTable.createContent(db, {
            content: noteObj.content,
            count: noteObj.count,
          });
          // @ts-ignore
          noteObj.contentId = contentId;
          // @ts-ignore
          delete noteObj.content;
          // @ts-ignore
          delete noteObj.count;
        }
      });
      note.notes = JSON.stringify(newNotes);
      // 更新 video_notes 表
      db.prepare(
        `
        UPDATE video_notes SET notes = ? WHERE id = ?
      `,
      ).run(note.notes, note.id);
    }
  }

  static getListenEvents() {
    return {
      "create_empty-video-note": this.createEmptyVideoNote.bind(this),
      "update-video-note": this.updateVideoNote.bind(this),
      "delete-video-note": this.deleteVideoNote.bind(this),
      "get-video-note-by-id": this.getVideoNoteById.bind(this),
      "get-all-video-notes": this.getAllVideoNotes.bind(this),
      "add-sub-note": this.addSubNote.bind(this),
      "delete-sub-note": this.deleteSubNote.bind(this),
      "update-sub-note": this.updateSubNote.bind(this),
    };
  }

  static parseVideoNote(note: any): VideoNote {
    return {
      id: note.id,
      notes: note.notes,
      createTime: note.create_time,
      updateTime: note.update_time,
      metaInfo: JSON.parse(note.meta_info),
    };
  }

  static createEmptyVideoNote(
    db: Database.Database,
    metaInfo: VideoNote["metaInfo"],
  ): VideoNote {
    const stmt = db.prepare(`
      INSERT INTO video_notes (notes, create_time, update_time, meta_info)
      VALUES (?, ?, ?, ?)
    `);
    const now = Date.now();
    const result = stmt.run(
      JSON.stringify([]),
      now,
      now,
      JSON.stringify(metaInfo),
    );

    return this.getVideoNoteById(db, result.lastInsertRowid);
  }

  static addSubNote(
    db: Database.Database,
    videoNoteId: number,
    subNote: Omit<VideoNote["notes"][number], "contentId">,
  ): VideoNote["notes"][number] {
    const originalNotesStmt = db.prepare(`
      SELECT notes FROM video_notes WHERE id = ?
    `);
    const originalNotes = originalNotesStmt.get(videoNoteId) as {
      notes: string;
    };
    const originalNotesObj: Omit<
      VideoNote["notes"][number],
      "content" | "count"
    >[] = JSON.parse(originalNotes.notes);
    const { id, content, count, startTime } = subNote;
    const contentId = ContentTable.createContent(db, {
      content,
      count,
    });
    const innerSubNote: InnerSubVideoNote = {
      id,
      contentId,
      startTime,
    };
    originalNotesObj.push(innerSubNote);
    const newNotes = JSON.stringify(originalNotesObj);

    const updateNotesStmt = db.prepare(`
      UPDATE video_notes SET notes = ? WHERE id = ?
    `);
    updateNotesStmt.run(newNotes, videoNoteId);

    return {
      id,
      startTime,
      contentId,
      content,
      count,
    };
  }

  static deleteSubNote(
    db: Database.Database,
    videoNoteId: number,
    subNoteId: string,
  ): boolean {
    const originalNotesStmt = db.prepare(`
      SELECT notes FROM video_notes WHERE id = ?
    `);
    const originalNotes = originalNotesStmt.get(videoNoteId) as {
      notes: string;
    };
    const originalNotesObj: Omit<
      VideoNote["notes"][number],
      "content" | "count"
    >[] = JSON.parse(originalNotes.notes);
    const toDelete = originalNotesObj.find((note) => note.id === subNoteId);
    if (!toDelete) {
      throw new Error("Sub note not found");
    }
    const newNotes = originalNotesObj.filter((note) => note.id !== subNoteId);
    const updateNotesStmt = db.prepare(`
      UPDATE video_notes SET notes = ? WHERE id = ?
    `);
    updateNotesStmt.run(JSON.stringify(newNotes), videoNoteId);
    const contentId = toDelete.contentId;
    ContentTable.deleteContent(db, contentId);
    return true;
  }

  static updateSubNote(
    db: Database.Database,
    subNote: VideoNote["notes"][number],
    win: BrowserWindow,
  ): VideoNote["notes"][number] {
    const { content, count, contentId } = subNote;

    ContentTable.updateContent(
      db,
      contentId,
      {
        content,
        count,
      },
      win,
    );

    return {
      id: subNote.id,
      startTime: subNote.startTime,
      contentId,
      content,
      count,
    };
  }

  static getVideoNoteById(
    db: Database.Database,
    id: number | bigint,
  ): VideoNote {
    const stmt = db.prepare(`
      SELECT * FROM video_notes WHERE id = ?
    `);
    const note = stmt.get(id) as any;
    const notes = JSON.parse(note.notes);
    const newNotes = notes.map((note: any) => {
      const content = ContentTable.getContentById(db, note.contentId);
      if (!content) {
        throw new Error("Content not found");
      }
      return {
        ...note,
        content: content.content,
        count: content.count,
      };
    });
    note.notes = newNotes;
    return this.parseVideoNote(note);
  }

  static getAllVideoNotes(db: Database.Database): VideoNote[] {
    const stmt = db.prepare(`
      SELECT * FROM video_notes
    `);
    const allVideoNotes = stmt.all();
    const newVideoNotes = allVideoNotes.map((videoNote: any) => {
      const notes = JSON.parse(videoNote.notes);
      const newNotes = notes.map((note: any) => {
        const content = ContentTable.getContentById(db, note.contentId);
        if (!content) {
          throw new Error("Content not found");
        }
        return {
          ...note,
          content: content.content,
          count: content.count,
        };
      });
      videoNote.notes = newNotes;
      return this.parseVideoNote(videoNote);
    });
    return newVideoNotes;
  }

  static updateVideoNote(
    db: Database.Database,
    note: Omit<VideoNote, "createTime" | "updateTime">,
  ): VideoNote {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_notes SET notes = ?, update_time = ?, meta_info = ? WHERE id = ?
    `);
    stmt.run(
      JSON.stringify(note.notes),
      now,
      JSON.stringify(note.metaInfo),
      note.id,
    );
    Operation.insertOperation(db, "video-note", "update", note.id, Date.now());
    return this.getVideoNoteById(db, note.id);
  }

  static deleteVideoNote(db: Database.Database, id: number): number {
    const note = this.getVideoNoteById(db, id);
    const stmt = db.prepare(`
      DELETE FROM video_notes WHERE id = ?
    `);
    const result = stmt.run(id);
    Operation.insertOperation(db, "video-note", "delete", id, Date.now());
    const contentIds = note.notes.map((note: any) => note.contentId);
    contentIds.forEach((contentId) => {
      ContentTable.deleteContent(db, contentId);
    });
    return result.changes;
  }
}
