import Database from "better-sqlite3";
import dayjs from "dayjs";
import { StatisticData } from "@/types";

import CardTable from "./card";
import ArticleTable from "./article";
import ProjectTable from "./project";
import DocumentTable from "./document";
import log from "electron-log";

// 统计覆盖的内容类型，与首页趋势图 TREND_TYPES 对应
const STATISTIC_TYPES = [
  "card",
  "article",
  "project-item",
  "document-item",
] as const;

export default class StatisticTable {
  static upgradeTable(db: Database.Database) {
    // 在 upgradeTable 中执行统计，确保所有表的字段都已升级完毕
    this.doStatistic(db);
  }

  static parseStatistic(statistic: any): StatisticData {
    return {
      id: statistic.id,
      date: statistic.date,
      statisticType: statistic.statistic_type,
      content: JSON.parse(statistic.content),
    };
  }

  static getListenEvents() {
    return {
      "get-statistic-by-date": this.getStatisticByDate.bind(this),
      "get-statistic-by-type": this.getStatisticByType.bind(this),
      "get-statistic-by-date-and-type":
        this.getStatisticByDateAndType.bind(this),
      "get-statistic-by-date-range": this.getStatisticByDateRange.bind(this),
      "get-statistic-by-date-range-and-type":
        this.getStatisticByDateRangeAndType.bind(this),
      "get-all-statistic": this.getAllStatistic.bind(this),
    };
  }

  static doStatistic(db: Database.Database) {
    try {
      STATISTIC_TYPES.forEach((type) => this.doStatisticByType(db, type));
    } catch (error) {
      log.error("统计失败", error);
    }

    // 定时任务统计，防止 APP 不关闭，到了凌晨自动统计
    // 计算距离明天零点的时间
    const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
    setTimeout(() => {
      this.doStatistic(db);
    }, dayjs(tomorrow).diff(dayjs()));
  }

  // 实时计算某类型的当前全量快照（count + wordsCount）
  // 归档写入与查询时补算今日均复用此逻辑，保证口径一致
  static computeSnapshot(
    db: Database.Database,
    type: string,
  ): { count: number; wordsCount: number } {
    if (type === "card") {
      const cards = CardTable.getAllCards(db);
      return {
        count: cards.length,
        wordsCount: cards.reduce((acc, card) => acc + card.count, 0),
      };
    }
    if (type === "article") {
      const articles = ArticleTable.getAllArticles(db);
      return {
        count: articles.length,
        wordsCount: articles.reduce((acc, article) => acc + article.count, 0),
      };
    }
    if (type === "project-item") {
      const projectItems = ProjectTable.getAllProjectItems(db);
      return {
        count: projectItems.length,
        wordsCount: projectItems.reduce((acc, item) => acc + item.count, 0),
      };
    }
    if (type === "document-item") {
      const documentItems = DocumentTable.getAllDocumentItems(db);
      return {
        count: documentItems.length,
        wordsCount: documentItems.reduce((acc, item) => acc + item.count, 0),
      };
    }
    return { count: 0, wordsCount: 0 };
  }

  static doStatisticByType(db: Database.Database, type: string) {
    // 获取昨天的日期
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    // 看昨天的记录是否存在
    const exist = db
      .prepare(`SELECT * FROM statistic WHERE date = ? AND statistic_type = ?`)
      .get(yesterday, type);
    if (exist) {
      return;
    }
    const content = this.computeSnapshot(db, type);
    db.prepare(
      `INSERT INTO statistic (date, statistic_type, content) VALUES (?, ?, ?)`,
    ).run(yesterday, type, JSON.stringify(content));
  }

  static getStatisticByDate(db: Database.Database, date: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE date = ?`);
    return this.parseStatistic(stmt.get(date));
  }

  static getStatisticByType(db: Database.Database, type: string) {
    const stmt = db.prepare(`SELECT * FROM statistic WHERE statistic_type = ?`);
    return this.parseStatistic(stmt.get(type));
  }

  static getStatisticByDateAndType(
    db: Database.Database,
    date: string,
    type: string,
  ) {
    const stmt = db.prepare(
      `SELECT * FROM statistic WHERE date = ? AND statistic_type = ?`,
    );
    return this.parseStatistic(stmt.get(date, type));
  }

  static getStatisticByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string,
  ) {
    const stmt = db.prepare(
      `SELECT * FROM statistic WHERE date >= ? AND date <= ?`,
    );
    return stmt.all(startDate, endDate).map(this.parseStatistic);
  }

  static getStatisticByDateRangeAndType(
    db: Database.Database,
    startDate: string,
    endDate: string,
    type: string,
  ) {
    const stmt = db.prepare(
      `SELECT * FROM statistic WHERE date >= ? AND date <= ? AND statistic_type = ?`,
    );
    return stmt.all(startDate, endDate, type).map(this.parseStatistic);
  }

  static getAllStatistic(db: Database.Database): StatisticData[] {
    const archived = db
      .prepare(`SELECT * FROM statistic`)
      .all()
      .map(this.parseStatistic);
    // 归档快照仅在凌晨/App 启动时写入，白天 CRUD 不会刷新今天的记录。
    // 这里对今天实时补算 4 类快照并覆盖归档值，使首页趋势图当天可见。
    const today = dayjs().format("YYYY-MM-DD");
    const merged = new Map<string, StatisticData>();
    archived.forEach((s) => merged.set(`${s.date}:${s.statisticType}`, s));
    STATISTIC_TYPES.forEach((type) => {
      merged.set(`${today}:${type}`, {
        id: 0,
        date: today,
        statisticType: type,
        content: this.computeSnapshot(db, type),
      });
    });
    return Array.from(merged.values());
  }

  static groupByStatisticType(
    statistics: StatisticData[],
  ): Record<string, StatisticData[]> {
    return statistics.reduce(
      (acc, statistic) => {
        if (!acc[statistic.statisticType]) {
          acc[statistic.statisticType] = [];
        }
        acc[statistic.statisticType].push(statistic);
        return acc;
      },
      {} as Record<string, StatisticData[]>,
    );
  }
}
