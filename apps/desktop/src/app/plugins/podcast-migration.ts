/**
 * 宿主播客迁入播客插件：先确认 tau.podcast 支持 Notebook 输出，再由主进程一次性迁移。
 * 已安装的旧版本先升级；没有待迁数据、只剩残留表时直接清理，不安装或启用插件。
 * 任一步失败（如离线）旧数据原样保留，弹一条可重试的通知；下次启动也会重试。
 */

import { appNotify } from "@/features/notifications/notify";
import { comparePluginVersions } from "@tau/plugins/host";
import { fetchPluginVersions, stagePluginRelease } from "@/commands/plugin-local";
import { getPodcastMigrationStatus, runPodcastMigration } from "@/commands/podcast-migration";
import type { DesktopPluginRuntime } from "./runtime";

export const PODCAST_PLUGIN_ID = "tau.podcast";
const NOTIFY_ID = "podcast-plugin-migration";
const MIN_PLUGIN_VERSION = "0.2.0";

/** 同一库同时只跑一轮 */
const running = new Map<string, Promise<void>>();

export function migratePodcastsToPlugin(
  runtime: DesktopPluginRuntime,
  databaseName: string,
  isCancelled: () => boolean
): Promise<void> {
  const existing = running.get(databaseName);
  if (existing) return existing;
  const task = attempt(runtime, databaseName, isCancelled).finally(() =>
    running.delete(databaseName)
  );
  running.set(databaseName, task);
  return task;
}

async function attempt(
  runtime: DesktopPluginRuntime,
  databaseName: string,
  isCancelled: () => boolean
) {
  try {
    const status = await getPodcastMigrationStatus(databaseName);
    if (!status.pending || isCancelled()) return;
    if (status.requiresPlugin) await ensurePluginActive(runtime, isCancelled);
    if (isCancelled()) return;
    await runPodcastMigration(databaseName);
    appNotify.dismiss(NOTIFY_ID);
  } catch (error) {
    if (isCancelled()) return;
    console.error("播客迁移失败", error);
    appNotify({
      id: NOTIFY_ID,
      title: "播客暂时无法显示",
      body: `播客已改为插件，需要先准备支持 Notebook 输出的「播客」插件再迁入原有播客（数据不会丢失）。${reason(error)}`,
      tone: "danger",
      sticky: true,
      actions: [
        {
          label: "重试",
          primary: true,
          onClick: () => migratePodcastsToPlugin(runtime, databaseName, isCancelled),
        },
      ],
    });
  }
}

async function ensurePluginActive(runtime: DesktopPluginRuntime, isCancelled: () => boolean) {
  const local = runtime.local;
  if (!local) throw new Error("本地插件管理不可用");
  await local.refresh();
  if (isCancelled()) return;
  const installed = runtime.host.listPlugins().find(plugin => plugin.id === PODCAST_PLUGIN_ID);
  if (!installed || comparePluginVersions(installed.version, MIN_PLUGIN_VERSION) < 0) {
    const release = (await fetchPluginVersions(PODCAST_PLUGIN_ID)).find(
      item => item.compatible && comparePluginVersions(item.version, MIN_PLUGIN_VERSION) >= 0
    );
    if (!release) throw new Error("插件中心暂时没有适用于当前版本的「播客」");
    if (isCancelled()) return;
    await stagePluginRelease(release.releaseId);
    await local.refresh();
    if (!local.owns(PODCAST_PLUGIN_ID)) throw new Error("「播客」安装后将在重启应用后生效");
  }
  if (isCancelled()) return;
  if (runtime.host.getState(PODCAST_PLUGIN_ID) !== "active") await local.enable(PODCAST_PLUGIN_ID);
  if (runtime.host.getState(PODCAST_PLUGIN_ID) !== "active")
    throw new Error(local.error(PODCAST_PLUGIN_ID) ?? "「播客」没有启动成功");
  if (!runtime.findNotebookOutput(PODCAST_PLUGIN_ID, "episode"))
    throw new Error("「播客」尚未支持 Notebook 输出，请更新插件并重启应用后重试");
}

const reason = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const text = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  return text ? `\n原因：${text}` : "";
};
