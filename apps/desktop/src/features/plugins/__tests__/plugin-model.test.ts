import { expect, it } from "vitest";
import type { PluginInfo } from "@tau/plugins/host";
import type { PluginCatalogEntry, PluginCatalogVersion } from "@/types/plugin-center";
import { installState, pluginTone, type InstalledPlugin } from "../model";

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

it("图标配色按 ID 稳定落在五档数据色内", () => {
  expect(pluginTone("a.b")).toBe(pluginTone("a.b"));
  for (const id of ["x", "lastknight.water-checkin", "weread"])
    expect(pluginTone(id)).toBeGreaterThanOrEqual(1);
});
