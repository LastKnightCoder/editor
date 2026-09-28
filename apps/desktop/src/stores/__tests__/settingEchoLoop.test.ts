/**
 * 多窗口设置回灌（事故修复）：多个窗口共用一份 setting.json，任一窗口改动由主进程广播给其余窗口。
 * 收到广播的窗口若再把它发回主进程，一次用户改动就被放大成 N 次保存，窗口间任何细微差异
 * 都会变成永不收敛的来回写（实测 220 次发送放大成 3463 次保存并写坏 setting.json）。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPersistedSettingSnapshot,
  isRemoteAppliedSnapshot,
  markRemoteSettingApplied,
  mergeSettingWithDefaults,
} from "../useSettingStore";
import type { ISetting } from "../useSettingStore";

const settingWith = (providerNames: string[]): ISetting =>
  mergeSettingWithDefaults({
    llmProviders: providerNames.map((name, index) => ({
      id: `p${index}`,
      name,
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      api: "openai-completions" as const,
      models: [],
    })),
  });

const snapshotJson = (setting: ISetting) => JSON.stringify(buildPersistedSettingSnapshot(setting));

describe("设置广播不回灌", () => {
  beforeEach(() => {
    markRemoteSettingApplied(mergeSettingWithDefaults({}));
  });

  it("刚从远端应用的快照被识别，不再发回主进程", () => {
    const remote = settingWith(["A", "B"]);
    markRemoteSettingApplied(remote);
    expect(isRemoteAppliedSnapshot(snapshotJson(remote))).toBe(true);
  });

  it("本地自己改出来的快照仍要发送", () => {
    const remote = settingWith(["A", "B"]);
    markRemoteSettingApplied(remote);
    // 用户随后在本窗口删掉一个服务商：这是本地改动，必须发出去
    const local = settingWith(["A"]);
    expect(isRemoteAppliedSnapshot(snapshotJson(local))).toBe(false);
  });

  it("只认最近一次远端快照：旧的远端快照不再被豁免（否则会吞掉回退操作）", () => {
    const first = settingWith(["A", "B"]);
    markRemoteSettingApplied(first);
    const second = settingWith(["A"]);
    markRemoteSettingApplied(second);
    expect(isRemoteAppliedSnapshot(snapshotJson(second))).toBe(true);
    expect(isRemoteAppliedSnapshot(snapshotJson(first))).toBe(false);
  });

  it("合并对持久化快照是幂等的——否则窗口间会无休止地互相改写", () => {
    const once = mergeSettingWithDefaults(settingWith(["A", "B"]));
    const first = snapshotJson(once);
    const twice = mergeSettingWithDefaults(JSON.parse(first));
    expect(snapshotJson(twice)).toBe(first);
  });
});
