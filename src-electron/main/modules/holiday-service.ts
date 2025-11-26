import { Module } from "../types/module";
import log from "electron-log";
import http from "http";
import fs from "fs";
import path from "path";
import { app } from "electron";

/**
 * 节假日类型
 * 0: 工作日
 * 1: 周末
 * 2: 法定节假日
 * 3: 调休工作日
 */
export type HolidayType = 0 | 1 | 2 | 3;

interface HolidayData {
  [date: string]: HolidayType; // 格式: "YYYY-MM-DD"
}

interface YearHolidayCache {
  year: number;
  data: HolidayData;
  fetchedAt: number;
}

/**
 * 节假日服务
 * 负责获取和缓存中国法定节假日数据
 * 使用 timor.tech 免费 API: http://timor.tech/api/holiday
 */
class HolidayServiceModule implements Module {
  name: string;
  private cache: Map<number, YearHolidayCache> = new Map();
  private readonly CACHE_DIR: string;
  private readonly CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30天缓存

  constructor() {
    this.name = "holiday-service";
    const userData = app.getPath("userData");
    this.CACHE_DIR = path.join(userData, "holiday-cache");
  }

  async init(): Promise<void> {
    // 确保缓存目录存在
    if (!fs.existsSync(this.CACHE_DIR)) {
      fs.mkdirSync(this.CACHE_DIR, { recursive: true });
    }

    // 加载已有的缓存
    this.loadCacheFromDisk();

    log.info("HolidayServiceModule initialized");
  }

  /**
   * 从磁盘加载缓存
   */
  private loadCacheFromDisk(): void {
    try {
      const files = fs.readdirSync(this.CACHE_DIR);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = path.join(this.CACHE_DIR, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const cached: YearHolidayCache = JSON.parse(content);

        // 检查缓存是否过期
        const now = Date.now();
        if (now - cached.fetchedAt < this.CACHE_DURATION) {
          this.cache.set(cached.year, cached);
          log.info(`Loaded holiday cache for year ${cached.year}`);
        } else {
          // 删除过期缓存
          fs.unlinkSync(filePath);
          log.info(`Deleted expired holiday cache for year ${cached.year}`);
        }
      }
    } catch (error) {
      log.error("Failed to load holiday cache from disk:", error);
    }
  }

  /**
   * 保存缓存到磁盘
   */
  private saveCacheToDisk(year: number, cache: YearHolidayCache): void {
    try {
      const filePath = path.join(this.CACHE_DIR, `${year}.json`);
      fs.writeFileSync(filePath, JSON.stringify(cache), "utf-8");
      log.info(`Saved holiday cache for year ${year}`);
    } catch (error) {
      log.error(`Failed to save holiday cache for year ${year}:`, error);
    }
  }

  /**
   * 从 API 获取指定年份的节假日数据
   */
  private async fetchHolidayDataFromAPI(year: number): Promise<HolidayData> {
    return new Promise((resolve, reject) => {
      const url = `http://timor.tech/api/holiday/year/${year}`;

      http
        .get(url, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const response = JSON.parse(data);

              if (response.code !== 0) {
                reject(
                  new Error(`API error: ${response.msg || "Unknown error"}`),
                );
                return;
              }

              // 转换数据格式
              const holidayData: HolidayData = {};
              const holiday = response.holiday || {};

              for (const [dateKey, info] of Object.entries(holiday)) {
                const holidayInfo = info as any;
                // API 返回的类型:
                // 0: 工作日, 1: 周末, 2: 节假日, 3: 调休
                holidayData[dateKey] = holidayInfo.holiday as HolidayType;
              }

              resolve(holidayData);
            } catch (error) {
              reject(error);
            }
          });
        })
        .on("error", (error) => {
          reject(error);
        });
    });
  }

  /**
   * 获取指定年份的节假日数据（带缓存）
   */
  private async getYearHolidayData(year: number): Promise<HolidayData> {
    // 检查内存缓存
    const cached = this.cache.get(year);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < this.CACHE_DURATION) {
      return cached.data;
    }

    // 从 API 获取
    try {
      log.info(`Fetching holiday data for year ${year} from API`);
      const data = await this.fetchHolidayDataFromAPI(year);

      // 缓存到内存和磁盘
      const cacheEntry: YearHolidayCache = {
        year,
        data,
        fetchedAt: now,
      };

      this.cache.set(year, cacheEntry);
      this.saveCacheToDisk(year, cacheEntry);

      return data;
    } catch (error) {
      log.error(`Failed to fetch holiday data for year ${year}:`, error);

      // 如果有过期缓存，降级使用
      if (cached) {
        log.warn(`Using expired cache for year ${year}`);
        return cached.data;
      }

      throw error;
    }
  }

  /**
   * 判断指定日期是否为节假日
   * @param date 日期（毫秒时间戳或 Date 对象）
   * @returns true: 节假日或周末, false: 工作日
   */
  async isHoliday(date: number | Date): Promise<boolean> {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;

    try {
      const yearData = await this.getYearHolidayData(year);
      const holidayType = yearData[dateKey];

      // undefined: 普通日期（周一到周五）
      // 0: 工作日（调休导致的工作日）
      // 1: 周末
      // 2: 节假日
      // 3: 调休工作日

      if (holidayType === undefined) {
        // 未在API数据中，检查是否是周末
        const dayOfWeek = d.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6;
      }

      // 类型 1 (周末) 或 2 (节假日) 为非工作日
      return holidayType === 1 || holidayType === 2;
    } catch (error) {
      log.error(`Failed to check holiday for date ${dateKey}:`, error);
      // 降级：检查是否是周末
      const dayOfWeek = d.getDay();
      return dayOfWeek === 0 || dayOfWeek === 6;
    }
  }

  /**
   * 批量判断日期是否为节假日
   * @param dates 日期数组
   * @returns 节假日判断结果数组
   */
  async areHolidays(dates: Array<number | Date>): Promise<boolean[]> {
    // 按年份分组
    const datesByYear = new Map<number, Array<{ date: Date; index: number }>>();

    dates.forEach((date, index) => {
      const d = new Date(date);
      const year = d.getFullYear();

      if (!datesByYear.has(year)) {
        datesByYear.set(year, []);
      }

      datesByYear.get(year)!.push({ date: d, index });
    });

    // 预加载所有需要的年份数据
    const yearDataPromises = Array.from(datesByYear.keys()).map((year) =>
      this.getYearHolidayData(year).catch(() => null),
    );

    await Promise.all(yearDataPromises);

    // 批量判断
    const results: boolean[] = new Array(dates.length);

    for (const [year, dateList] of datesByYear.entries()) {
      const yearData = this.cache.get(year)?.data || {};

      for (const { date, index } of dateList) {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const dateKey = `${year}-${month}-${day}`;
        const holidayType = yearData[dateKey];

        if (holidayType === undefined) {
          const dayOfWeek = date.getDay();
          results[index] = dayOfWeek === 0 || dayOfWeek === 6;
        } else {
          results[index] = holidayType === 1 || holidayType === 2;
        }
      }
    }

    return results;
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear();

    try {
      const files = fs.readdirSync(this.CACHE_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          fs.unlinkSync(path.join(this.CACHE_DIR, file));
        }
      }
      log.info("Cleared all holiday cache");
    } catch (error) {
      log.error("Failed to clear holiday cache:", error);
    }
  }

  destroy(): void {
    this.cache.clear();
  }
}

export default new HolidayServiceModule();
