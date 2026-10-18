// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalPluginPreferences } from "@tau/plugins/local-state";

it("无窗口也可恢复编辑器启用状态，并发保存不丢另一插件的意图", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-editor-preferences-"));
  try {
    const prefs = new LocalPluginPreferences(root);
    await prefs.load();
    expect(prefs.enabled("bundle.example", true)).toBe(true);
    expect(prefs.enabled("constructor", false)).toBe(false);
    await Promise.all([prefs.set("bundle.example", false), prefs.set("external.example", true)]);
    const restarted = new LocalPluginPreferences(root);
    await restarted.load();
    expect(restarted.enabled("bundle.example", true)).toBe(false);
    expect(restarted.enabled("external.example", false)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
