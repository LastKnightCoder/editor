import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { ICreateCard, IUpdateCard, ICard } from '@/types';

export default class CardTable {
  // @ts-ignore
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;

    this.initTable();

    console.log(`init card table`)

    ipcMain.handle('get-all-cards', async () => {
      return await this.getAllCards();
    });

    ipcMain.handle('get-card-by-id', async (_event, cardId) => {
      return await this.getCardById(cardId);
    });

    ipcMain.handle('create-card', async (_event, params) => {
      return await this.createCard(params);
    });

    ipcMain.handle('update-card', async (_event, params) => {
      return await this.updateCard(params);
    });

    ipcMain.handle('delete-card-by-id', async (_event, cardId) => {
      return await this.deleteCardById(cardId);
    });

    ipcMain.handle('get-tags-by-card-id', async (_event, cardId) => {
      return await this.getTagsByCardId(cardId);
    });

    ipcMain.handle('get-cards-group-by-tag', async () => {
      return await this.getCardsGroupByTag();
    });
  }

  initTable() {
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
    this.db.exec(createTableSql);
  }

  parseCard(card: any): ICard {
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

  async getAllCards() {
    const stmt = this.db.prepare('SELECT * FROM cards');
    const cards = stmt.all();
    return cards.map(card => this.parseCard(card));
  }

  async getCardById(cardId: number | bigint): Promise<ICard> {
    const stmt = this.db.prepare('SELECT * FROM cards WHERE id = ?');
    return this.parseCard(stmt.get(cardId));
  }

  async createCard(card: ICreateCard): Promise<ICard> {
    const { tags, links, content, category } = card;

    const stmt = this.db.prepare('INSERT INTO cards (create_time, update_time, tags, links, content, category) VALUES (?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), JSON.stringify(links), JSON.stringify(content), category);
    const createdCardId = res.lastInsertRowid;
    return await this.getCardById(createdCardId);
  }

  async updateCard(card: IUpdateCard): Promise<ICard> {
    const { tags, links, content, category, id } = card;
    const stmt = this.db.prepare('UPDATE cards SET update_time = ?, tags = ?, links = ?, content = ?, category = ? WHERE id = ?');
    const now = Date.now();
    stmt.run(now, JSON.stringify(tags), JSON.stringify(links), JSON.stringify(content), category, id);
    return await this.getCardById(id);
  }

  async deleteCardById(cardId: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM cards WHERE id = ?');
    return stmt.run(cardId).changes;
  }

  async getTagsByCardId(cardId: number): Promise<string[]> {
    const stmt = this.db.prepare('SELECT tags FROM cards WHERE id = ?');
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
  async getCardsGroupByTag() {
    const tagsGroupByTag: Record<string, ICard[]> = {};
    const cards = await this.getAllCards();
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
