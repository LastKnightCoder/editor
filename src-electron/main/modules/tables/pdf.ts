import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { Pdf, PdfHighlight } from '@/types';

export default class PdfTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
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

    this.db.exec(`
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

  initHandlers() {
    ipcMain.handle('create-pdf', async (_event, pdf: Omit<Pdf, 'id' | 'createTime' | 'updateTime'>) => {
      return await this.createPdf(pdf);
    });

    ipcMain.handle('update-pdf', async (_event, pdf: Pdf) => {
      return await this.updatePdf(pdf);
    });

    ipcMain.handle('get-pdf-by-id', async (_event, id: number) => {
      return await this.getPdfById(id);
    });

    ipcMain.handle('get-pdf-list', async () => {
      return await this.getPdfList();
    });

    ipcMain.handle('remove-pdf', async (_event, id: number) => {
      return await this.removePdf(id);
    });

    ipcMain.handle('add-pdf-highlight', async (_event, highlight: Omit<PdfHighlight, 'id' | 'createTime' | 'updateTime'>) => {
      return await this.addPdfHighlight(highlight);
    });

    ipcMain.handle('update-pdf-highlight', async (_event, highlight: PdfHighlight) => {
      return await this.updatePdfHighlight(highlight);
    });

    ipcMain.handle('get-pdf-highlight-by-id', async (_event, id: number) => {
      return await this.getPdfHighlightById(id);
    });

    ipcMain.handle('get-pdf-highlights', async (_event, pdfId: number) => {
      return await this.getPdfHighlights(pdfId);
    });

    ipcMain.handle('remove-pdf-highlight', async (_event, id: number) => {
      return await this.removePdfHighlight(id);
    });
  }

  parsePdf(pdf: any): Pdf {
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

  parsePdfHighlight(highlight: any): PdfHighlight {
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

  async createPdf(pdf: Omit<Pdf, 'id' | 'createTime' | 'updateTime'>): Promise<Pdf> {
    const stmt = this.db.prepare(`
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

    return this.getPdfById(Number(res.lastInsertRowid));
  }

  async updatePdf(pdf: Pdf): Promise<Pdf> {
    const stmt = this.db.prepare(`
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

    return this.getPdfById(pdf.id);
  }

  async getPdfById(id: number): Promise<Pdf> {
    const stmt = this.db.prepare('SELECT * FROM pdfs WHERE id = ?');
    const pdf = stmt.get(id);
    return this.parsePdf(pdf);
  }

  async getPdfList(): Promise<Pdf[]> {
    const stmt = this.db.prepare('SELECT * FROM pdfs');
    const pdfs = stmt.all();
    return pdfs.map(pdf => this.parsePdf(pdf));
  }

  async removePdf(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM pdfs WHERE id = ?');
    return stmt.run(id).changes;
  }

  async addPdfHighlight(highlight: Omit<PdfHighlight, 'id' | 'createTime' | 'updateTime'>): Promise<PdfHighlight> {
    const stmt = this.db.prepare(`
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

    return this.getPdfHighlightById(Number(res.lastInsertRowid));
  }

  async updatePdfHighlight(highlight: PdfHighlight): Promise<PdfHighlight> {
    const stmt = this.db.prepare(`
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
      Date.now(),
      highlight.id
    );

    return this.getPdfHighlightById(highlight.id);
  }

  async getPdfHighlightById(id: number): Promise<PdfHighlight> {
    const stmt = this.db.prepare('SELECT * FROM pdf_highlights WHERE id = ?');
    const highlight = stmt.get(id);
    return this.parsePdfHighlight(highlight);
  }

  async getPdfHighlights(pdfId: number): Promise<PdfHighlight[]> {
    const stmt = this.db.prepare('SELECT * FROM pdf_highlights WHERE pdf_id = ?');
    const highlights = stmt.all(pdfId);
    return highlights.map(highlight => this.parsePdfHighlight(highlight));
  }

  async removePdfHighlight(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM pdf_highlights WHERE id = ?');
    return stmt.run(id).changes;
  }
}