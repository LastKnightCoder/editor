/**
 * 卡片、文章、项目文档上的播客迁入播客插件：插件运行时就绪后，库里还有挂在原文上的播客时，
 * 先从插件中心安装并启用 tau.podcast（已装的直接启用），等它激活完成，再由主进程一次性迁移。
 * 任一步失败（如离线）旧数据原样保留，弹一条可重试的通知；下次启动也会重试。
 */

import { appNotify } from "@/features/notifications/notify";
import { fetchPluginVersions, stagePluginRelease } from "@/commands/plugin-local";
import { hasPendingPodcastMigration, runPodcastMigration } from "@/commands/podcast-migration";
import type { DesktopPluginRuntime } from "./runtime";

export const PODCAST_PLUGIN_ID = "tau.podcast";
const NOTIFY_ID = "podcast-plugin-migration";

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
    if (!(await hasPendingPodcastMigration(databaseName)) || isCancelled()) return;
    await ensurePluginActive(runtime, isCancelled);
    if (isCancelled()) return;
    await runPodcastMigration(databaseName);
    appNotify.dismiss(NOTIFY_ID);
  } catch (error) {
    if (isCancelled()) return;
    console.error("播客迁移失败", error);
    appNotify({
      id: NOTIFY_ID,
      title: "播客暂时无法显示",
      body: `播客已改为插件，需要先安装「播客」插件再迁入卡片、文章与项目文档上原有的播客（数据不会丢失）。${reason(error)}`,
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
  if (!local.owns(PODCAST_PLUGIN_ID)) {
    const release = (await fetchPluginVersions(PODCAST_PLUGIN_ID)).find(item => item.compatible);
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
}

const reason = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const text = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  return text ? `\n原因：${text}` : "";
};
