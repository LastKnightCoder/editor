import { afterEach, describe, expect, it } from "vitest";
import {
  deriveSyncHero,
  formatRelativeTime,
  overwriteAvailability,
  readLastSyncTime,
  writeLastSyncTime,
} from "../syncState";

const versions = (localVersion: number, remoteVersion: number) => ({
  databaseName: "data.db",
  localVersion,
  remoteVersion,
});

const base = { versions: null, syncing: false, checking: false, errorMessage: null };

describe("deriveSyncHero", () => {
  it("按版本对比给出用户语言与主按钮方向", () => {
    expect(deriveSyncHero({ ...base, versions: versions(7, 9) })).toMatchObject({
      title: "云端有更新",
      primaryLabel: "下载更新",
      primaryAction: "download",
    });
    expect(deriveSyncHero({ ...base, versions: versions(9, 7) })).toMatchObject({
      title: "本机版本更新",
      primaryAction: "upload",
    });
    expect(deriveSyncHero({ ...base, versions: versions(0, 0) })).toMatchObject({
      title: "尚未同步",
      primaryAction: "upload",
    });
  });

  it("版本一致时仍可立即同步，但主按钮降为次级", () => {
    expect(deriveSyncHero({ ...base, versions: versions(5, 5) })).toMatchObject({
      tone: "ok",
      title: "已是最新",
      primaryAction: "smart",
      primaryEmphasis: false,
    });
  });

  it("同步中与出错优先于版本状态", () => {
    expect(deriveSyncHero({ ...base, versions: versions(5, 5), syncing: true }).tone).toBe("run");
    expect(
      deriveSyncHero({ ...base, versions: versions(5, 5), errorMessage: "403 拒绝访问" })
    ).toMatchObject({ tone: "error", description: "403 拒绝访问", primaryAction: "check" });
  });

  it("未检查过版本时引导检查云端", () => {
    expect(deriveSyncHero(base)).toMatchObject({ title: "尚未检查", primaryAction: "check" });
    expect(deriveSyncHero({ ...base, checking: true }).title).toBe("正在检查云端…");
  });
});

describe("overwriteAvailability", () => {
  it("不允许低版本覆盖高版本", () => {
    expect(overwriteAvailability(versions(3, 5), "upload")).toEqual({
      enabled: false,
      reason: "云端版本更新，需先下载",
    });
    expect(overwriteAvailability(versions(5, 3), "download").enabled).toBe(false);
    expect(overwriteAvailability(versions(5, 5), "upload").enabled).toBe(true);
    expect(overwriteAvailability(versions(5, 5), "download").enabled).toBe(true);
  });

  it("未检查或云端为空时不可下载", () => {
    expect(overwriteAvailability(null, "upload").enabled).toBe(false);
    expect(overwriteAvailability(versions(0, 0), "download").reason).toBe("云端还没有数据");
  });
});

describe("上次同步时间", () => {
  afterEach(() => window.localStorage.clear());

  it("按数据库名记录与读取", () => {
    expect(readLastSyncTime("data.db")).toBeNull();
    writeLastSyncTime("data.db", 1000);
    writeLastSyncTime("work.db", 2000);
    expect(readLastSyncTime("data.db")).toBe(1000);
    expect(readLastSyncTime("work.db")).toBe(2000);
  });

  it("相对时间文案", () => {
    const now = new Date(2026, 9, 23, 12, 0).getTime();
    expect(formatRelativeTime(now - 10_000, now)).toBe("刚刚");
    expect(formatRelativeTime(now - 3 * 60_000, now)).toBe("3 分钟前");
    expect(formatRelativeTime(new Date(2026, 9, 23, 8, 5).getTime(), now)).toBe("今天 08:05");
    expect(formatRelativeTime(new Date(2026, 9, 22, 22, 14).getTime(), now)).toBe("昨天 22:14");
    expect(formatRelativeTime(new Date(2026, 8, 30, 9, 0).getTime(), now)).toBe("9 月 30 日 09:00");
  });
});
