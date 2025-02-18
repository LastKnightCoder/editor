import Database from 'better-sqlite3';
import dayjs from 'dayjs';
import { StatisticData } from '@/types';

import CardTable from './card';
import ArticleTable from './article';
import ProjectTable from './project';
import DocumentTable from './document';

export default class StatisticTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS statistic (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        statistic_type TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `);

    this.doStatistic(db);
  }

  static upgradeTable(_db: Database.Database) {
    // 暂无升级
  }

  static parseStatistic(statistic: any): StatisticData {
    return {
      id: statistic.id,
      date: statistic.date,
      statisticType: statistic.statistic_type,
      content: JSON.parse(statistic.content),
    }
  }

  static getListenEvents() {
    return {
      'get-statistic-by-date': this.getStatisticByDate.bind(this),
      'get-statistic-by-type': this.getStatisticByType.bind(this),
      'get-statistic-by-date-and-type': this.getStatisticByDateAndType.bind(this),
      'get-statistic-by-date-range': this.getStatisticByDateRange.bind(this),
      'get-statistic-by-date-range-and-type': this.getStatisticByDateRangeAndType.bind(this),
      'get-all-statistic': this.getAllStatistic.bind(this),
    }
  }

  static doStatistic(db: Database.Database) {
    this.doStatisticByType(db, 'card');
    this.doStatisticByType(db, 'article');
    this.doStatisticByType(db, 'project-item');
    this.doStatisticByType(db, 'document-item');
    // 定时任务统计，防止 APP 不关闭，到了凌晨自动统计
    // 计算距离明天零点的时间
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    setTimeout(() => {
      this.doStatistic(db);
    }, dayjs(tomorrow).diff(dayjs()));
  }

  static doStatisticByType(db: Database.Database, type: string) {
    // 获取昨天的日期
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    // 看昨天的记录是否存在
    const exist = db.prepare(`SELECT * FROM statistic WHERE date = ? AND statistic_type = ?`).get(yesterday, type);
    if (exist) {
      return;
    }
    if (type === 'card') {
      const cards = CardTable.getAllCards(db);
      const wordsCount = cards.reduce((acc, card) => {
        return acc + card.count;
      }, 0);
      const content = {
        count: cards.length,
        wordsCount
      }
      const stmt = db.prepare(`INSERT INTO statistic (date, statistic_type, content) VALUES (?, ?, ?)`);
      stmt.run(yesterday, type, JSON.stringify(content))
    } else if (type === 'article') {
      const articles = ArticleTable.getAllArticles(db);
      const wordsCount = articles.reduce((acc, article) => {
        return acc + article.count;
      }, 0);
      const content = {
        count: articles.length,
        wordsCount
      }
      const stmt = db.prepare(`INSERT INTO statistic (date, statistic_type, content) VALUES (?, ?, ?)`);
      stmt.run(yesterday, type, JSON.stringify(content))
    } else if (type === 'project-item') {
      const projectItems = ProjectTable.getAllProjectItems(db);
      const wordsCount = projectItems.reduce((acc, projectItem) => {
        return acc + projectItem.count;
      }, 0);
      const content = {
        count: projectItems.length,
        wordsCount
      }
      const stmt = db.prepare(`INSERT INTO statistic (date, statistic_type, content) VALUES (?, ?, ?)`);
      stmt.run(yesterday, type, JSON.stringify(content))
    } else if (type === 'document-item') {
      const documentItems = DocumentTable.getAllDocumentItems(db);
      const wordsCount = documentItems.reduce((acc, documentItem) => {
        return acc + documentItem.count;
      }, 0);
      const content = {
        count: documentItems.length,
        wordsCount
      }
      const stmt = db.prepare(`INSERT INTO statistic (date, statistic_type, content) VALUES (?, ?, ?)`);
      stmt.run(yesterday, type, JSON.stringify(content))
    }
  }

  static getStatisticByDate(db: Database.Database, date: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE date = ?`);
    return this.parseStatistic(stmt.get(date));
  }

  static getStatisticByType(db: Database.Database, type: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE statistic_type = ?`);
    return this.parseStatistic(stmt.get(type));
  }

  static getStatisticByDateAndType(db: Database.Database, date: string, type: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE date = ? AND statistic_type = ?`);
    return this.parseStatistic(stmt.get(date, type));
  }

  static getStatisticByDateRange(db: Database.Database, startDate: string, endDate: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE date >= ? AND date <= ?`);
    return stmt.all(startDate, endDate).map(this.parseStatistic);
  }

  static getStatisticByDateRangeAndType(db: Database.Database, startDate: string, endDate: string, type: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE date >= ? AND date <= ? AND statistic_type = ?`);
    return stmt.all(startDate, endDate, type).map(this.parseStatistic);
  }

  static getAllStatistic(db: Database.Database): StatisticData[] {
    const stmt = db.prepare(`SELECT * FROM statistic`);
    return stmt.all().map(this.parseStatistic);
  }

  static groupByStatisticType(statistics: StatisticData[]): Record<string, StatisticData[]> {
    return statistics.reduce((acc, statistic) => {
      if (!acc[statistic.statisticType]) {
        acc[statistic.statisticType] = [];
      }
      acc[statistic.statisticType].push(statistic);
      return acc;
    }, {} as Record<string, StatisticData[]>);
  }
}
