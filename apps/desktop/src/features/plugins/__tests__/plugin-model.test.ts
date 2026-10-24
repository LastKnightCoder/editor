import { expect, it } from "vitest";
import type { PluginInfo } from "@tau/plugins/host";
import type { PluginCatalogEntry, PluginCatalogVersion } from "@/types/plugin-center";
import { pluginTone } from "@tau/plugins/center";
import { installState, versionRows, type InstalledPlugin } from "../model";

const version = (value: string, minAppVersion = "0.58.0"): PluginCatalogVersion => ({
  releaseId: `r-${value}`,
  version: value,
  minAppVersion,
  publishedAt: "2026-10-17T00:00:00.000Z",
  size: 1,
  sha256: "a".repeat(64),
  downloadUrl: "",
});
const entry = (
  latest: PluginCatalogVersion,
  compatible: PluginCatalogVersion | null = latest
): PluginCatalogEntry => ({
  pluginId: "test.center",
  downloadsTotal: 0,
  downloads7d: 0,
  name: "中心插件",
  description: "",
  publisher: { login: "author", avatarUrl: "" },
  repository: "",
  latest,
  compatible,
});
const installed = (source: InstalledPlugin["source"], current = "1.0.0"): InstalledPlugin => ({
  info: { id: "test.center", name: "中心插件", version: current, state: "active" } as PluginInfo,
  source,
  enabled: true,
});

it("安装按钮按兼容版本、来源与暂存状态切换", () => {
  expect(installState(entry(version("1.1.0")), undefined, undefined)).toEqual({
    kind: "available",
    releaseId: "r-1.1.0",
    version: "1.1.0",
  });
  expect(installState(entry(version("2.0.0", "0.60.0"), null), undefined, undefined)).toEqual({
    kind: "incompatible",
    minAppVersion: "0.60.0",
  });
  // 最新版不兼容时仍可装兼容版本，不回退成最新版
  expect(
    installState(
      entry(version("2.0.0", "0.60.0"), version("1.1.0")),
      installed("center"),
      undefined
    )
  ).toMatchObject({ kind: "update", version: "1.1.0" });
  expect(installState(entry(version("1.0.0")), installed("center"), undefined).kind).toBe(
    "installed"
  );
  expect(installState(entry(version("1.1.0")), installed("zip"), undefined).kind).toBe("local");
  expect(
    installState(entry(version("1.1.0")), installed("center"), {
      id: "test.center",
      pending: true,
      pendingVersion: "1.1.0",
    })
  ).toEqual({ kind: "staged", version: "1.1.0" });
});

it("版本页合并中心全部版本与本机状态，新版在前", () => {
  const published = (value: string, compatible = true) => ({
    releaseId: `r-${value}`,
    version: value,
    minAppVersion: compatible ? "0.59.0" : "0.60.0",
    publishedAt: `2026-10-1${value.at(-1)}T00:00:00.000Z`,
    compatible,
  });
  const current = installed("zip", "1.0.1");
  const rows = versionRows(
    current,
    [published("1.0.1"), published("1.0.3", false), published("1.0.2")],
    undefined
  );
  expect(rows.map(row => [row.version, row.notes.join(" · ")])).toEqual([
    ["1.0.3", "最新 · 需要客户端 ≥ 0.60.0 · 2026-10-13 发布"],
    ["1.0.2", "2026-10-12 发布"],
    ["1.0.1", "当前使用 · 2026-10-11 发布"],
  ]);

  const staged = {
    ...installed("center", "1.0.2"),
    update: { id: "test.center", pending: true, pendingVersion: "1.0.3", previousVersion: "1.0.0" },
  };
  expect(
    versionRows(staged, [published("1.0.3"), published("1.0.2")], undefined).map(row => [
      row.version,
      row.notes[0],
      row.action,
    ])
  ).toEqual([
    ["1.0.3", "已下载，重启后生效", "cancel-update"],
    ["1.0.2", "当前使用", undefined],
    ["1.0.0", "上一版备份", "restore-previous"],
  ]);

  // 中心版本未读到时只显示目录里的最新版
  expect(versionRows(undefined, undefined, entry(version("2.0.0"))).map(row => row.notes)).toEqual([
    ["最新", "2026-10-17 发布"],
  ]);
});

it("图标配色按 ID 稳定落在五档数据色内", () => {
  expect(pluginTone("a.b")).toBe(pluginTone("a.b"));
  for (const id of ["x", "lastknight.water-checkin", "weread"])
    expect(pluginTone(id)).toBeGreaterThanOrEqual(1);
});
