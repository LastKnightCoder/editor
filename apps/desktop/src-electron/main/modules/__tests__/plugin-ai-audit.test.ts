import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { ModelUsageStore } from "../model-usage/store";
import { buildLlmUsage } from "../model-usage/trackers";
import { exportSegment, importSegment } from "../model-usage/segments";

const deviceId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const event = (id: string) => ({
  ...buildLlmUsage(
    null,
    {
      providerId: "provider",
      modelId: "model",
      feature: "plugin:test.ai:summary",
      pluginId: "test.ai",
      pluginName: "文章助手",
      pluginFeatureName: "摘要",
      scope: "plugin",
      sessionId: null,
      entityId: null,
      library: null,
    },
    { startedAt: Date.UTC(2026, 9, 17), firstTokenAt: null, endedAt: Date.UTC(2026, 9, 17) + 100 }
  ),
  eventId: id,
  deviceId,
  providerName: "服务商",
  library: null,
});

it("插件字段、统一筛选和跨设备分段保留来源；更新审计不重复计数", () => {
  const db = new Database(":memory:");
  const targetDb = new Database(":memory:");
  try {
    const store = new ModelUsageStore(db);
    store.insertMany([
      event("one"),
      {
        ...event("two"),
        feature: "chat",
        pluginId: null,
        pluginName: null,
        pluginFeatureName: null,
      },
    ]);
    store.replace({ ...event("one"), status: "ok", usageKnown: true, totalTokens: 15 });
    expect(store.summary({}).calls).toBe(2);
    expect(store.summary({ pluginId: "test.ai" })).toMatchObject({ calls: 1, totalTokens: 15 });
    expect(store.breakdown({ pluginId: "test.ai", groupBy: "feature" })[0].label).toBe(
      "文章助手 / 摘要"
    );
    expect(store.pluginSources()).toEqual([{ id: "test.ai", name: "文章助手" }]);
    const segment = exportSegment(store, deviceId, "2026-10");
    store.insertMany([{ ...event("running"), status: "running" }]);
    expect(exportSegment(store, deviceId, "2026-10").info.hash).toBe(segment.info.hash);
    const target = new ModelUsageStore(targetDb);
    importSegment(
      target,
      { deviceId, month: "2026-10", hash: segment.info.hash, data: segment.data },
      "01ARZ3NDEKTSV4RRFFQ69G5FAW"
    );
    expect(target.list({ pluginId: "test.ai" }).items[0]).toMatchObject({
      pluginName: "文章助手",
      pluginFeatureName: "摘要",
      usageKnown: true,
    });
  } finally {
    db.close();
    targetDb.close();
  }
});

it("已有审计库原位补列并保留历史；进程中断记录恢复为未知用量", () => {
  const db = new Database(":memory:");
  try {
    const original = new ModelUsageStore(db);
    original.insertMany([event("old")]);
    db.exec("DROP INDEX idx_mue_plugin_ts");
    for (const column of ["plugin_id", "plugin_name", "plugin_feature_name", "usage_known"])
      db.exec(`ALTER TABLE model_usage_event DROP COLUMN ${column}`);
    original.setMeta("schema_version", "1");
    const upgraded = new ModelUsageStore(db);
    expect(upgraded.list().items[0]).toMatchObject({
      eventId: "old",
      pluginId: null,
      usageKnown: null,
    });
    upgraded.insertMany([{ ...event("pending"), status: "running" }]);
    upgraded.recoverInterruptedPluginCalls();
    expect(upgraded.list({ pluginId: "test.ai" }).items[0]).toMatchObject({
      status: "aborted",
      usageKnown: false,
    });
  } finally {
    db.close();
  }
});
