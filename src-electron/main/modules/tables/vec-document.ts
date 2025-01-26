import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { VecDocument } from '@/types';

export default class VecDocumentTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vec_documents (
          id INTEGER PRIMARY KEY,
          create_time INTEGER,
          update_time INTEGER,
          ref_type TEXT,
          ref_id INTEGER,
          ref_update_time INTEGER,
          contents TEXT,
          contents_embedding blob check(vec_length(contents_embedding) == 3072)
      ) strict
    `);
  }

  initHandlers() {
    ipcMain.handle('create-vec-document', async (_event, params: {
      refType: string,
      refId: number,
      refUpdateTime: number,
      contents: string,
      contentsEmbedding: number[]
    }) => {
      return await this.createVecDocument(params);
    });

    ipcMain.handle('update-vec-document', async (_event, params: {
      id: number,
      refType: string,
      refId: number,
      refUpdateTime: number,
      contents: string,
      contentsEmbedding: number[]
    }) => {
      return await this.updateVecDocument(params);
    });

    ipcMain.handle('delete-vec-document', async (_event, id: number) => {
      return await this.deleteVecDocument(id);
    });

    ipcMain.handle('get-vec-document', async (_event, id: number) => {
      return await this.getVecDocument(id);
    });

    ipcMain.handle('get-vec-documents-by-ref', async (_event, refId: number, refType: string) => {
      return await this.getVecDocumentsByRef(refId, refType);
    });

    ipcMain.handle('delete-vec-documents-by-ref', async (_event, refId: number, refType: string) => {
      return await this.deleteVecDocumentsByRef(refId, refType);
    })

    ipcMain.handle('get-vec-documents-by-ref-type', async (_event, refType: string) => {
      return await this.getVecDocumentsByRefType(refType);
    });

    ipcMain.handle('get-all-vec-documents', async () => {
      return await this.getAllVecDocuments();
    });

    ipcMain.handle('search-vec-documents', async (_event, queryEmbedding: number[], topK: number) => {
      console.log('search-vec-documents', queryEmbedding, topK);
      return await this.searchVecDocuments(queryEmbedding, topK);
    });
  }

  parseVecDocument(document: any): VecDocument {
    return {
      ...document,
      contentsEmbedding: JSON.parse(document.contents_embedding_json),
      createTime: document.create_time,
      updateTime: document.update_time,
      refType: document.ref_type,
      refId: document.ref_id,
      refUpdateTime: document.ref_update_time
    };
  }

  async createVecDocument(params: {
    refType: string,
    refId: number,
    refUpdateTime: number,
    contents: string,
    contentsEmbedding: number[]
  }): Promise<VecDocument> {
    const stmt = this.db.prepare(`
      INSERT INTO vec_documents
      (create_time, update_time, ref_type, ref_id, ref_update_time, contents, contents_embedding)
      VALUES (?, ?, ?, ?, ?, ?, vec_f32(?))
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      params.refType,
      params.refId,
      params.refUpdateTime,
      params.contents,
      JSON.stringify(params.contentsEmbedding)
    );

    return this.getVecDocument(Number(res.lastInsertRowid));
  }

  async updateVecDocument(params: {
    id: number,
    refType: string,
    refId: number,
    refUpdateTime: number,
    contents: string,
    contentsEmbedding: number[]
  }): Promise<VecDocument> {
    const stmt = this.db.prepare(`
      UPDATE vec_documents SET
        update_time = ?,
        ref_type = ?,
        ref_id = ?,
        ref_update_time = ?,
        contents = ?,
        contents_embedding = vec_f32(?)
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      params.refType,
      params.refId,
      params.refUpdateTime,
      params.contents,
      JSON.stringify(params.contentsEmbedding),
      params.id
    );

    return this.getVecDocument(params.id);
  }

  async deleteVecDocument(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM vec_documents WHERE id = ?');
    return stmt.run(id).changes;
  }

  async getVecDocument(id: number): Promise<VecDocument> {
    const stmt = this.db.prepare('SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents WHERE id = ?');
    const document = stmt.get(id);
    return this.parseVecDocument(document);
  }

  async getVecDocumentsByRef(refId: number, refType: string): Promise<VecDocument[]> {
    const stmt = this.db.prepare(`
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents 
      WHERE ref_type = ? AND ref_id = ?
    `);
    const documents = stmt.all(refType, refId);
    return documents.map(doc => this.parseVecDocument(doc));
  }

  async deleteVecDocumentsByRef(refId: number, refType: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM vec_documents 
      WHERE ref_type = ? AND ref_id = ?
    `);
    stmt.run(refType, refId);
  }

  async getVecDocumentsByRefType(refType: string): Promise<VecDocument[]> {
    const stmt = this.db.prepare(`
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents 
      WHERE ref_type = ?
    `);
    const documents = stmt.all(refType);
    return documents.map(doc => this.parseVecDocument(doc));
  }

  async getAllVecDocuments(): Promise<VecDocument[]> {
    const stmt = this.db.prepare('SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents');
    const documents = stmt.all();
    return documents.map(doc => this.parseVecDocument(doc));
  }

  async searchVecDocuments(queryEmbedding: number[], topK: number): Promise<Array<[document: VecDocument, distance: number]>> {
    const searchStmt = this.db.prepare("SELECT id, vec_distance_cosine(?, contents_embedding) AS distance FROM vec_documents WHERE distance < 0.6 ORDER BY distance LIMIT ?");
    const searchRes = searchStmt.all(JSON.stringify(queryEmbedding), topK) as Array<{ id: number, distance: number }>;
    const res: Array<[document: VecDocument, distance: number]> = [];
    for (const row of searchRes) {
      const doc = await this.getVecDocument(row.id);
      res.push([doc, row.distance]);
    }
    return res;
  }
}