import Database from 'better-sqlite3';
import { VecDocument } from '@/types';

export default class VecDocumentTable {

  static initTable(db: Database.Database) {
    db.exec(`
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

  static upgradeTable(_db: Database.Database) {
    // TODO 暂无升级
  }

  static getListenEvents() {
    return {
      'create-vec-document': this.createVecDocument.bind(this),
      'update-vec-document': this.updateVecDocument.bind(this),
      'delete-vec-document': this.deleteVecDocument.bind(this),
      'delete-vec-documents-by-ref': this.deleteVecDocumentsByRef.bind(this),
      'get-vec-document': this.getVecDocument.bind(this),
      'get-vec-documents-by-ref': this.getVecDocumentsByRef.bind(this),
      'get-vec-documents-by-ref-type': this.getVecDocumentsByRefType.bind(this),
      'get-all-vec-documents': this.getAllVecDocuments.bind(this),
      'search-vec-documents': this.searchVecDocuments.bind(this),
    }
  }

  static parseVecDocument(document: any): VecDocument {
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

  static createVecDocument(db: Database.Database, params: {
    refType: string,
    refId: number,
    refUpdateTime: number,
    contents: string,
    contentsEmbedding: number[]
  }): VecDocument {
    const stmt = db.prepare(`
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

    return this.getVecDocument(db, Number(res.lastInsertRowid));
  }

  static updateVecDocument(db: Database.Database, params: {
    id: number,
    refType: string,
    refId: number,
    refUpdateTime: number,
    contents: string,
    contentsEmbedding: number[]
  }): VecDocument {
    const stmt = db.prepare(`
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

    return this.getVecDocument(db, params.id);
  }

  static deleteVecDocument(db: Database.Database, id: number): number {
    const stmt = db.prepare('DELETE FROM vec_documents WHERE id = ?');
    return stmt.run(id).changes;
  }

  static getVecDocument(db: Database.Database, id: number): VecDocument {
    const stmt = db.prepare('SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents WHERE id = ?');
    const document = stmt.get(id);
    return this.parseVecDocument(document);
  }

  static getVecDocumentsByRef(db: Database.Database, refId: number, refType: string): VecDocument[] {
    const stmt = db.prepare(`
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents 
      WHERE ref_type = ? AND ref_id = ?
    `);
    const documents = stmt.all(refType, refId);
    return documents.map(doc => this.parseVecDocument(doc));
  }

  static deleteVecDocumentsByRef(db: Database.Database, refId: number, refType: string): void {
    const stmt = db.prepare(`
      DELETE FROM vec_documents 
      WHERE ref_type = ? AND ref_id = ?
    `);
    stmt.run(refType, refId);
  }

  static getVecDocumentsByRefType(db: Database.Database, refType: string): VecDocument[] {
    const stmt = db.prepare(`
      SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents 
      WHERE ref_type = ?
    `);
    const documents = stmt.all(refType);
    return documents.map(doc => this.parseVecDocument(doc));
  }

  static getAllVecDocuments(db: Database.Database,): VecDocument[] {
    const stmt = db.prepare('SELECT *, vec_to_json(contents_embedding) as contents_embedding_json FROM vec_documents ORDER BY create_time DESC');
    const documents = stmt.all();
    return documents.map(doc => this.parseVecDocument(doc));
  }

  static searchVecDocuments(db: Database.Database, queryEmbedding: number[], topK: number): Array<[document: VecDocument, distance: number]> {
    const searchStmt = db.prepare("SELECT id, vec_distance_cosine(?, contents_embedding) AS distance FROM vec_documents WHERE distance < 0.6 ORDER BY distance LIMIT ?");
    const searchRes = searchStmt.all(JSON.stringify(queryEmbedding), topK) as Array<{ id: number, distance: number }>;
    const res: Array<[document: VecDocument, distance: number]> = [];
    for (const row of searchRes) {
      const doc = this.getVecDocument(db, row.id);
      res.push([doc, row.distance]);
    }
    return res;
  }
}
