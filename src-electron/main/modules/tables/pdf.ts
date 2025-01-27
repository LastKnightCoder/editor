import Database from 'better-sqlite3';
import { Pdf, PdfHighlight } from '@/types';
import Operation from './operation';

export default class PdfTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pdfs (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        is_local INTEGER NOT NULL,
        category TEXT DEFAULT 'default',
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        remote_url TEXT
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS pdf_highlights (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        pdf_id INTEGER NOT NULL,
        color TEXT NOT NULL,
        highlight_type TEXT NOT NULL,
        rects TEXT NOT NULL,
        bounding_client_rect TEXT NOT NULL,
        highlight_text_style TEXT NOT NULL,
        page_num INTEGER NOT NULL,
        content TEXT,
        image TEXT,
        notes TEXT NOT NULL,
        FOREIGN KEY(pdf_id) REFERENCES pdfs(id)
      )
    `);
  }

  static getListenEvents() {
    return {
      'create-pdf': this.createPdf.bind(this),
      'get-pdf-by-id': this.getPdfById.bind(this),
      'get-pdf-list': this.getPdfList.bind(this),
      'update-pdf': this.updatePdf.bind(this),
      'delete-pdf': this.removePdf.bind(this),
      'add-pdf-highlight': this.addPdfHighlight.bind(this),
      'update-pdf-highlight': this.updatePdfHighlight.bind(this),
      'get-pdf-highlight-by-id': this.getPdfHighlightById.bind(this),
      'get-pdf-highlights': this.getPdfHighlights.bind(this),
      'delete-pdf-highlight': this.removePdfHighlight.bind(this),
    }
  }

  static parsePdf(pdf: any): Pdf {
    return {
      ...pdf,
      tags: JSON.parse(pdf.tags || '[]'),
      isLocal: Boolean(pdf.is_local),
      createTime: pdf.create_time,
      updateTime: pdf.update_time,
      fileName: pdf.file_name,
      filePath: pdf.file_path,
      remoteUrl: pdf.remote_url
    };
  }

  static parsePdfHighlight(highlight: any): PdfHighlight {
    return {
      ...highlight,
      rects: JSON.parse(highlight.rects),
      boundingClientRect: JSON.parse(highlight.bounding_client_rect),
      notes: JSON.parse(highlight.notes),
      createTime: highlight.create_time,
      updateTime: highlight.update_time,
      pdfId: highlight.pdf_id,
      highlightType: highlight.highlight_type,
      highlightTextStyle: highlight.highlight_text_style,
      pageNum: highlight.page_num
    };
  }

  static async createPdf(db: Database.Database, pdf: Omit<Pdf, 'id' | 'createTime' | 'updateTime'>): Promise<Pdf> {
    const stmt = db.prepare(`
      INSERT INTO pdfs 
      (tags, is_local, category, file_name, file_path, remote_url, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      JSON.stringify(pdf.tags),
      Number(pdf.isLocal),
      pdf.category,
      pdf.fileName,
      pdf.filePath,
      pdf.remoteUrl,
      now,
      now
    );

    Operation.insertOperation(db, 'pdf', 'insert', res.lastInsertRowid, now);

    return this.getPdfById(db, Number(res.lastInsertRowid));
  }

  static async updatePdf(db: Database.Database, pdf: Pdf): Promise<Pdf> {
    const stmt = db.prepare(`
      UPDATE pdfs SET
        tags = ?,
        is_local = ?,
        category = ?,
        file_name = ?,
        file_path = ?,
        remote_url = ?,
        update_time = ?
      WHERE id = ?
    `);
    stmt.run(
      JSON.stringify(pdf.tags),
      Number(pdf.isLocal),
      pdf.category,
      pdf.fileName,
      pdf.filePath,
      pdf.remoteUrl,
      Date.now(),
      pdf.id
    );

    Operation.insertOperation(db, 'pdf', 'update', pdf.id, Date.now());

    return this.getPdfById(db, pdf.id);
  }

  static async getPdfById(db: Database.Database, id: number): Promise<Pdf> {
    const stmt = db.prepare('SELECT * FROM pdfs WHERE id = ?');
    const pdf = stmt.get(id);
    return this.parsePdf(pdf);
  }

  static async getPdfList(db: Database.Database): Promise<Pdf[]> {
    const stmt = db.prepare('SELECT * FROM pdfs');
    const pdfs = stmt.all();
    return pdfs.map(pdf => this.parsePdf(pdf));
  }

  static async removePdf(db: Database.Database, id: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM pdfs WHERE id = ?');
    Operation.insertOperation(db, 'pdf', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  static async addPdfHighlight(db: Database.Database, highlight: Omit<PdfHighlight, 'id' | 'createTime' | 'updateTime'>): Promise<PdfHighlight> {
    const stmt = db.prepare(`
      INSERT INTO pdf_highlights
      (pdf_id, color, highlight_type, rects, bounding_client_rect, 
       highlight_text_style, page_num, content, image, notes, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      highlight.pdfId,
      highlight.color,
      highlight.highlightType,
      JSON.stringify(highlight.rects),
      JSON.stringify(highlight.boundingClientRect),
      highlight.highlightTextStyle,
      highlight.pageNum,
      highlight.content,
      highlight.image,
      JSON.stringify(highlight.notes),
      now,
      now
    );

    Operation.insertOperation(db, 'highlight', 'insert', res.lastInsertRowid, now)

    return this.getPdfHighlightById(db, Number(res.lastInsertRowid));
  }

  static async updatePdfHighlight(db: Database.Database, highlight: PdfHighlight): Promise<PdfHighlight> {
    const stmt = db.prepare(`
      UPDATE pdf_highlights SET
        pdf_id = ?,
        color = ?,
        highlight_type = ?,
        rects = ?,
        bounding_client_rect = ?,
        highlight_text_style = ?,
        page_num = ?,
        content = ?,
        image = ?,
        notes = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      highlight.pdfId,
      highlight.color,
      highlight.highlightType,
      JSON.stringify(highlight.rects),
      JSON.stringify(highlight.boundingClientRect),
      highlight.highlightTextStyle,
      highlight.pageNum,
      highlight.content,
      highlight.image,
      JSON.stringify(highlight.notes),
      now,
      highlight.id
    );

    Operation.insertOperation(db, 'highlight', 'update', highlight.id, now)

    return this.getPdfHighlightById(db, highlight.id);
  }

  static async getPdfHighlightById(db: Database.Database, id: number): Promise<PdfHighlight> {
    const stmt = db.prepare('SELECT * FROM pdf_highlights WHERE id = ?');
    const highlight = stmt.get(id);
    return this.parsePdfHighlight(highlight);
  }

  static async getPdfHighlights(db: Database.Database, pdfId: number): Promise<PdfHighlight[]> {
    const stmt = db.prepare('SELECT * FROM pdf_highlights WHERE pdf_id = ?');
    const highlights = stmt.all(pdfId);
    return highlights.map(highlight => this.parsePdfHighlight(highlight));
  }

  static async removePdfHighlight(db: Database.Database, id: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM pdf_highlights WHERE id = ?');
    Operation.insertOperation(db, 'highlight', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }
}