// 资源文件状态推导：只看本轮账本，失败优先于待同步，运行中只给「停止」。
import { describe, expect, it } from "vitest";
import type { ResourceSyncProgress, ResourceSyncStatusFile } from "../../../../types";
import {
  countResources,
  defaultResourceFilter,
  deriveResourceHero,
  filterResources,
  resourceBadge,
} from "../resourceState";

const idle: ResourceSyncProgress = {
  totalFiles: 0,
  processedFiles: 0,
  currentFile: null,
  status: "idle",
  uploadCount: 0,
  downloadCount: 0,
  skippedCount: 0,
  errorCount: 0,
  startTime: null,
};

function ledger(
  files: Record<string, ["upload" | "download", "pending" | "synced" | "error"]>
): ResourceSyncStatusFile {
  return {
    provider: "s3",
    config: {},
    lastSyncTime: null,
    files: Object.fromEntries(
      Object.entries(files).map(([path, [direction, syncStatus]]) => [
        path,
        {
          syncStatus,
          syncDirection: direction,
          fileSize: 1,
          lastSyncTime: null,
          errorMessage: syncStatus === "error" ? "网络超时" : null,
          retryCount: 0,
        },
      ])
    ),
  };
}

const base = { errorMessage: null, configMissing: false, lastSyncText: null };

describe("resourceState", () => {
  const file = ledger({
    "b.webp": ["upload", "pending"],
    "a.webp": ["download", "pending"],
    "c.pdf": ["upload", "error"],
    "d.webp": ["upload", "synced"],
  });

  it("计数与筛选互斥：失败的文件不再算作待同步", () => {
    expect(countResources(file)).toEqual({ total: 4, upload: 1, download: 1, error: 1 });
    expect(filterResources(file, "upload").map(([path]) => path)).toEqual(["b.webp"]);
    expect(filterResources(file, "all").map(([path]) => path)).toEqual([
      "a.webp",
      "b.webp",
      "c.pdf",
      "d.webp",
    ]);
    expect(defaultResourceFilter(countResources(file))).toBe("error");
  });

  it("有失败时主按钮重试失败文件，徽标显示失败数", () => {
    const counts = countResources(file);
    const hero = deriveResourceHero({ ...base, progress: idle, counts });
    expect(hero).toMatchObject({ title: "1 个文件同步失败", primaryAction: "retry" });
    expect(resourceBadge(idle, counts)).toEqual({ tone: "danger", text: "1 个失败" });
  });

  it("只有待同步时说明两个方向的数量", () => {
    const counts = countResources(ledger({ a: ["upload", "pending"], b: ["download", "pending"] }));
    const hero = deriveResourceHero({ ...base, progress: idle, counts });
    expect(hero.title).toBe("有 2 个文件待同步");
    expect(hero.description).toBe("本机新增 1 个 · 云端新增 1 个");
    expect(hero.primaryAction).toBe("start");
  });

  it("运行中只给停止；未配置同步时引导去设置", () => {
    const counts = countResources(file);
    const running = { ...idle, status: "syncing" as const, totalFiles: 4, processedFiles: 1 };
    expect(deriveResourceHero({ ...base, progress: running, counts })).toMatchObject({
      title: "正在同步 25%",
      primaryAction: "cancel",
    });
    expect(resourceBadge(running, counts)?.text).toBe("同步中");
    expect(
      deriveResourceHero({ ...base, configMissing: true, progress: idle, counts }).primaryAction
    ).toBe("configure");
  });

  it("全部同步后降为次按钮，没有文件时只提供检查", () => {
    const synced = countResources(ledger({ a: ["upload", "synced"] }));
    expect(deriveResourceHero({ ...base, progress: idle, counts: synced })).toMatchObject({
      title: "已同步",
      primaryEmphasis: false,
    });
    expect(resourceBadge(idle, synced)).toBeNull();
    const empty = countResources(null);
    expect(deriveResourceHero({ ...base, progress: idle, counts: empty }).primaryAction).toBe(
      "refresh"
    );
  });
});
