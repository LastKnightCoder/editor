import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { comparePluginVersions } from "@tau/plugins/host";
import type { LocalPluginPreferences } from "@tau/plugins/local-state";
import { discoverPlugins } from "./plugin-discovery";
import { downloadPluginRelease, fetchPluginCatalog } from "./plugin-center";
import type { PluginUpdates } from "./plugin-updates";

/** 最后升级版的固定下限；唯一用户完成升级后随旧内容转换一起删除。 */
export const LEGACY_PLUGIN_UPGRADE_VERSIONS: Readonly<Record<string, string>> = {
  "tau.abc": "0.1.11",
  "tau.asr-seed": "0.1.0",
  bilibili: "0.2.4",
  "tau.custom-block": "1.0.13",
  "tau.sync-github": "0.3.2",
  "tau.html": "0.1.10",
  "tau.image-gallery": "0.1.6",
  "tau.images-openai": "0.2.7",
  "tau.sync-oss": "0.3.2",
  "tau.publish-github": "0.1.7",
  "tau.publish-s3": "0.1.7",
  "tau.questions": "0.1.5",
  "tau.sync-s3": "0.4.2",
  "taunote.stickman": "0.1.11",
  "tau.tikz": "0.1.10",
  "tau.tts-minimax": "0.1.11",
  "tau.tts-qwen": "0.1.11",
  "tau.typst": "0.2.6",
  "tau.upload-github": "0.3.2",
  "tau.upload-oss": "0.3.2",
  "tau.upload-s3": "0.3.2",
  "tau.sync-webdav": "0.3.2",
  weread: "1.0.13",
  youtube: "0.2.4",
};
const contentPlugins = [
  "tau.abc",
  "tau.custom-block",
  "tau.html",
  "tau.image-gallery",
  "taunote.stickman",
  "tau.tikz",
  "tau.typst",
];

/** 仅在插件快照、后端和资料库启动前调用；不对已运行插件热替换。 */
export class LegacyPluginUpgrade {
  constructor(
    private readonly updates: PluginUpdates,
    private readonly preferences: LocalPluginPreferences,
    private readonly center = { catalog: fetchPluginCatalog, download: downloadPluginRelease }
  ) {}

  async run(): Promise<void> {
    await this.updates.initialize();
    const { entries } = await discoverPlugins(this.updates.directory, this.updates.clientVersion);
    const installed = entries.filter(entry =>
      Object.hasOwn(LEGACY_PLUGIN_UPGRADE_VERSIONS, entry.id)
    );
    const hasLibrary = (
      await readdir(path.dirname(this.updates.directory), { withFileTypes: true })
    ).some(entry => entry.isFile() && entry.name.endsWith(".db"));
    if (!installed.length && !hasLibrary) return;
    // 内容节点曾内置于宿主，旧用户可能从未安装对应插件。
    const ids = new Set([...installed.map(entry => entry.id), ...contentPlugins]);
    const pending: string[] = [];
    const maintenance = await this.updates.list();
    for (const id of ids) {
      const blocked = maintenance.find(item => item.id === id && item.blocked);
      if (blocked) throw new Error(`插件 ${id} 更新尚未恢复：${blocked.error ?? "原包已保留"}`);
      const entry = installed.find(value => value.id === id);
      if (!entry) {
        pending.push(id);
        continue;
      }
      const manifest = JSON.parse(
        await readFile(path.join(entry.directory, "manifest.json"), "utf8")
      );
      if (manifest.id !== id) throw new Error(`插件 ${id} 的安装目录与身份不一致，已保留原包`);
      if (comparePluginVersions(manifest.version, LEGACY_PLUGIN_UPGRADE_VERSIONS[id]) < 0)
        pending.push(id);
      else if (entry.error) throw new Error(`插件 ${id} 无法加载：${entry.error}`);
    }
    if (pending.length) {
      const catalog = await this.center.catalog(this.updates.clientVersion);
      for (const id of pending) {
        const release = catalog.items.find(entry => entry.pluginId === id)?.compatible;
        if (
          !release ||
          comparePluginVersions(release.version, LEGACY_PLUGIN_UPGRADE_VERSIONS[id]) < 0
        )
          throw new Error(
            `插件中心尚未提供 ${id} 所需的兼容版本 ${LEGACY_PLUGIN_UPGRADE_VERSIONS[id]}，原包和内容已保留`
          );
        const { bytes, source } = await this.center.download(
          release.releaseId,
          this.updates.clientVersion
        );
        if (
          source.pluginId !== id ||
          source.releaseId !== release.releaseId ||
          source.version !== release.version ||
          source.sha256 !== release.sha256
        )
          throw new Error(`插件 ${id} 的下载结果与选定版本不一致，已保留原包`);
        const staged = await this.updates.stageRelease(bytes, source);
        if (!(await this.updates.apply(staged.id, async () => true)))
          throw new Error(`插件 ${id} 尚未完成安装，暂不转换内容`);
      }
    }
    await this.preferences.initialize(Object.fromEntries(contentPlugins.map(id => [id, true])));
  }
}

export async function waitForLegacyPluginUpgrade(
  upgrade: Pick<LegacyPluginUpgrade, "run">,
  onFailure: (error: unknown) => void,
  wait: () => Promise<void> = () =>
    new Promise(resolve => {
      setTimeout(resolve, 60_000).unref();
    })
): Promise<void> {
  for (;;) {
    try {
      await upgrade.run();
      return;
    } catch (error) {
      onFailure(error);
      await wait();
    }
  }
}
