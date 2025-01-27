import Database from 'better-sqlite3';
import { ICreateCard, IUpdateCard, ICard } from '@/types';
import Operation from './operation';

export default class CardTable {
  static getListenEvents() {
    return {
      'create-card': this.createCard.bind(this),
      'update-card': this.updateCard.bind(this),
      'delete-card-by-id': this.deleteCardById.bind(this),
      'get-tags-by-card-id': this.getTagsByCardId.bind(this),
      'get-cards-group-by-tag': this.getCardsGroupByTag.bind(this),
      'get-all-cards': this.getAllCards.bind(this),
      'get-card-by-id': this.getCardById.bind(this),
    }
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        links TEXT,
        content TEXT,
        category TEXT DEFAULT 'permanent'
      )
    `;
    db.exec(createTableSql);
  }

  static parseCard(card: any): ICard {
    return {
      id: card.id,
      create_time: card.create_time,
      update_time: card.update_time,
      tags: JSON.parse(card.tags),
      links: JSON.parse(card.links),
      content: JSON.parse(card.content),
      category: card.category,
    };
  }

  static async getAllCards(db: Database.Database) {
    const stmt = db.prepare('SELECT * FROM cards');
    const cards = stmt.all();
    return cards.map(card => this.parseCard(card));
  }

  static async getCardById(db: Database.Database, cardId: number | bigint): Promise<ICard> {
    const stmt = db.prepare('SELECT * FROM cards WHERE id = ?');
    return this.parseCard(stmt.get(cardId));
  }

  static async createCard(db: Database.Database, card: ICreateCard): Promise<ICard> {
    const { tags, links, content, category } = card;

    const stmt = db.prepare('INSERT INTO cards (create_time, update_time, tags, links, content, category) VALUES (?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), JSON.stringify(links), JSON.stringify(content), category);
    const createdCardId = res.lastInsertRowid;
    Operation.insertOperation(db, 'card', 'insert', createdCardId, now);
    return await this.getCardById(db, createdCardId);
  }

  static async updateCard(db: Database.Database, card: IUpdateCard): Promise<ICard> {
    const { tags, links, content, category, id } = card;
    const stmt = db.prepare('UPDATE cards SET update_time = ?, tags = ?, links = ?, content = ?, category = ? WHERE id = ?');
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), JSON.stringify(links), JSON.stringify(content), category, id);

    // 如果有 document-item 是 isCard 并且 cardId 等于 id 的话，更新 document-item 的 content
    const updateDocumentItemStmt = db.prepare('UPDATE document_items SET update_time = ?, content = ? WHERE is_card = 1 AND card_id = ?');
    updateDocumentItemStmt.run(now, JSON.stringify(content), id);

    // update project_item
    const updateProjectItemStmt = db.prepare("UPDATE project_item SET update_time = ?, content = ? WHERE ref_type = 'card' AND ref_id = ?");
    updateProjectItemStmt.run(now, JSON.stringify(content), id);

    Operation.insertOperation(db, 'card', 'update', card.id, now);

    return await this.getCardById(db, id);
  }

  static async deleteCardById(db: Database.Database, cardId: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM cards WHERE id = ?');
    // 设置 isCard 为 0
    const documentItemStmt = db.prepare('UPDATE document_items SET isCard = 0 WHERE isCard = 1 AND cardId = ?');
    documentItemStmt.run(cardId);

    // 设置 project_item ref_type 为 空字符串
    const projectItemStmt = db.prepare('UPDATE project_item SET ref_type = "" WHERE ref_type = "card" AND ref_id = ?');
    projectItemStmt.run(cardId);

    Operation.insertOperation(db, 'card', 'delete', cardId, Date.now());

    return stmt.run(cardId).changes;
  }

  static async getTagsByCardId(db: Database.Database, cardId: number): Promise<string[]> {
    const stmt = db.prepare('SELECT tags FROM cards WHERE id = ?');
    const result = stmt.get(cardId) as { tags: string };
    let tags = [];
    try {
      tags = JSON.parse(result.tags);
    } catch (error) {
      console.error('Error parsing tags:', error);
    }
    return tags;
  }

  // 根据 tag 中的每个 tag 对卡片进行分组，忽略大小写，返回一个 对象，tag 为 key，对应的卡片数组为 value
  // 要查询所有的卡片才能获得 tags
  static async getCardsGroupByTag(db: Database.Database) {
    const tagsGroupByTag: Record<string, ICard[]> = {};
    const cards = await this.getAllCards(db);
    for (const card of cards) {
      for (const tag of card.tags) {
        const lowerCaseTag = tag.toLowerCase();
        if (!tagsGroupByTag[lowerCaseTag]) {
          tagsGroupByTag[lowerCaseTag] = [];
        }
        tagsGroupByTag[lowerCaseTag].push(card);
      }
    }
  }
}
