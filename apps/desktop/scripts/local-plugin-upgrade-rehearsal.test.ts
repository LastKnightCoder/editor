// @vitest-environment node
import { expect, it, vi } from "vitest";
const isolation = vi.hoisted(() => ({
  root: process.env.TAU_PLUGIN_UPGRADE_CASE ?? "",
  requests: [] as string[],
}));
vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: () => isolation.root },
  net: {
    fetch: (url: string, init?: RequestInit) => {
      if (new URL(url).origin !== "https://plugins-api.taunote.app")
        throw new Error("验证只允许固定插件中心");
      isolation.requests.push(new URL(url).pathname);
      return fetch(url, init);
    },
  },
}));
it.skipIf(!process.env.TAU_PLUGIN_UPGRADE_CASE)(
  "旧插件副本从正式中心自动更新，重复启动不再联网",
  async () => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { join, resolve } = await import("node:path");
    const { PluginUpdates } = await import("../src-electron/main/services/plugin-updates");
    const { LegacyPluginUpgrade } =
      await import("../src-electron/main/services/legacy-plugin-upgrade");
    const { LocalPluginPreferences } = await import("@tau/plugins/local-state");
    const { discoverPlugins } = await import("../src-electron/main/services/plugin-discovery");
    const client = await import("../package.json");
    const root = resolve(isolation.root);
    expect(root).not.toBe(resolve(process.env.HOME ?? "", ".editor"));
    expect(JSON.parse(await readFile(join(root, "rehearsal-marker.json"), "utf8")).isolated).toBe(
      true
    );
    const directory = join(root, "plugins"),
      preferences = new LocalPluginPreferences(directory);
    await preferences.load();
    const before = await discoverPlugins(directory, client.version);
    const flags = Object.fromEntries(
      before.entries.map(entry => [entry.id, preferences.enabled(entry.id, false)])
    );
    const updates = new PluginUpdates(directory, client.version, {
      portableCenterOrigin: "https://plugins-api.taunote.app",
    });
    const upgrade = new LegacyPluginUpgrade(updates, preferences);
    await upgrade.run();
    const requests = [...isolation.requests];
    isolation.requests.length = 0;
    await upgrade.run();
    expect(isolation.requests).toEqual([]);
    const after = await discoverPlugins(directory, client.version);
    for (const [id, enabled] of Object.entries(flags))
      expect(preferences.enabled(id, !enabled)).toBe(enabled);
    expect(after.entries.filter(entry => entry.error)).toEqual([]);
    expect(preferences.enabled("tau.image-gallery", false)).toBe(true);
    const report = {
      before: before.entries.map(entry => ({
        id: entry.id,
        version: entry.artifact?.manifest.version,
      })),
      after: after.entries.map(entry => ({
        id: entry.id,
        version: entry.artifact?.manifest.version,
      })),
      maintenance: await updates.list(),
      requests,
      secondRunRequests: isolation.requests,
      preservedFlags: true,
    };
    await writeFile(join(root, "plugin-upgrade-report.json"), JSON.stringify(report, null, 2));
    console.log(
      "PLUGIN_UPGRADE_VERIFIED",
      JSON.stringify({
        plugins: after.entries.length,
        requests: requests.length,
        secondRunRequests: isolation.requests.length,
      })
    );
  },
  180_000
);
