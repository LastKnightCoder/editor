import log from "electron-log";
import { createHash } from "node:crypto";
import { installDesktopPluginMetrics } from "../../../shared/content-metrics";
import { portableDevelopmentArtifacts } from "../services/plugin-portable-development";
import {
  assertDesktopPackageSource,
  type DesktopPluginPackage as DevelopmentPluginPackage,
} from "../../../shared/plugin-package";
import { isContentPlugin } from "@tau/plugins/package";
import { copyJson } from "@tau/plugins/host";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PathUtil from "../utils/PathUtil";
import { discoverPlugins } from "../services/plugin-discovery";
import { getPluginRegistry } from "../services/plugin-workspaces";
import {
  stopPluginBackend,
  activatePluginBackends,
  protectPluginBackendChange,
} from "./plugin-backend";
import { PluginUpdates } from "../services/plugin-updates";
import {
  isSkillPackage,
  isTemplatePackage,
  readPluginPackage,
  setPluginPackageIntegrityCache,
} from "../services/plugin-package";
import { PluginPackageIntegrityCache } from "../services/plugin-package-integrity-cache";
import { PluginContentStartup } from "../services/plugin-content-startup";
import type {
  ContentPluginInspection,
  ContentPluginInspectionBatch,
} from "../services/plugin-content-startup";
import {
  PluginContentInspectionCache,
  type PluginCacheCryptor,
} from "../services/plugin-content-inspection-cache";
import {
  appendContentPluginArtifact,
  getContentPluginArtifacts,
} from "../services/plugin-content-artifacts";
import { contentExecutor } from "../services/content-execution";
import { LocalPluginPreferences } from "@tau/plugins/local-state";
import {
  pluginSyncSessions,
  acceptSyncRendererReply,
  releaseSyncRenderer,
} from "../services/plugin-sync";
import userSetting from "./user-setting";
import { getPluginPermissionStore } from "./plugin-permissions";
import { getMainWindows } from "../windows/main-window";
import { pluginUploadRelay } from "../services/plugin-upload";
import { pluginTTSRelay } from "../services/plugin-tts";
import { pluginImagesRelay } from "../services/plugin-images";
import { pluginEmbeddingsRelay } from "../services/plugin-embeddings";
import { pluginVideoRelay } from "../services/plugin-video";
import {
  pluginPublishSessions,
  acceptPublishRendererReply,
  releasePublishRenderer,
} from "../services/plugin-publish-provider";
import type { ImagesRendererRequest, ImagesRendererReply } from "../../../shared/images-renderer";
import type {
  EmbeddingsProviderInfo,
  EmbeddingsRendererReply,
} from "../../../shared/embeddings-renderer";
import type {
  VideoProvidersState,
  VideoRendererReply,
  VideoRendererRequest,
} from "../../../shared/video-renderer";
import type { TTSRendererRequest, TTSRendererReply } from "../../../shared/tts-renderer";
import type { UploadRequest, UploadRendererReply } from "../../../shared/upload-renderer";
import {
  downloadPluginRelease,
  fetchPluginCatalog,
  fetchPluginRelease,
  fetchPluginVersions,
  fetchPluginCommunity,
  setPluginLiked,
  addPluginComment,
  deletePluginComment,
  API_ORIGIN,
} from "../services/plugin-center";
import { recordStage } from "./perf-record";
import type { LocalPluginSource, LocalPluginUpdate } from "@/types/plugin-local";

const directory = () => path.join(PathUtil.getAppDir(), "plugins");
const protectPluginTasks = <T>(id: string, action: () => Promise<T>) =>
  pluginPublishSessions.protect(id, () => pluginSyncSessions.protect(id, action));

export default {
  name: "plugin-local",
  async init() {
    let cacheCryptor: PluginCacheCryptor | undefined;
    try {
      if (
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== "linux" ||
          !["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend()))
      )
        cacheCryptor = {
          encrypt: value => safeStorage.encryptString(value),
          decrypt: value => safeStorage.decryptString(value),
        };
    } catch (error) {
      log.warn("[plugin-local] 插件缓存加密不可用", error);
    }
    const packageIntegrityCache = await measureStartup("package-integrity-cache", () =>
      PluginPackageIntegrityCache.load(
        path.join(PathUtil.getAppDir(), "plugin-package-integrity-cache.bin"),
        cacheCryptor
      )
    );
    setPluginPackageIntegrityCache(packageIntegrityCache);
    const updates = new PluginUpdates(directory(), app.getVersion(), {
      ...(app.isPackaged ? { portableCenterOrigin: API_ORIGIN } : {}),
    });
    await measureStartup("update-recovery", () => updates.initialize());
    const preferences = new LocalPluginPreferences(directory());
    await measureStartup("settings-load", () => userSetting.getSettingSnapshot());
    await measureStartup("preferences-load", () => preferences.load());
    const readManagedPackage = async (id: string, updateState?: readonly LocalPluginUpdate[]) => {
      const maintenance = updateState ?? (await updates.list());
      if (maintenance.some(item => item.id === id && item.blocked))
        throw new Error("插件更新尚未恢复");
      const artifact = await readPluginPackage(
        path.join(directory(), id),
        app.getVersion(),
        packageIntegrityCache
      );
      if (artifact.manifest.formatVersion === 3 && app.isPackaged) {
        const source = (await updates.sources([id]))[id];
        assertDesktopPackageSource(artifact.manifest, source, API_ORIGIN, app.isPackaged);
      }
      return artifact;
    };
    const initial = await measureStartup(
      "package-discovery",
      () => discoverPlugins(directory(), app.getVersion(), packageIntegrityCache),
      result => result.entries.length
    );
    await packageIntegrityCache.save().catch(error => {
      log.warn("[plugin-local] 插件完整性缓存写入失败", error);
    });
    const updateState = await measureStartup("update-state", () => updates.list());
    const initialSources: Record<string, LocalPluginSource> = await measureStartup(
      "source-records",
      () => updates.sources(initial.entries.map(entry => entry.id)),
      result => Object.keys(result).length
    );
    const initialArtifacts = new Map(
      initial.entries.flatMap(entry =>
        entry.artifact ? [[entry.id, entry.artifact] as const] : []
      )
    );
    const contentPluginEntries = initial.entries.filter(
      entry =>
        entry.artifact &&
        (entry.artifact.manifest.formatVersion === 3 || isContentPlugin(entry.artifact.manifest))
    );
    const contentPluginIds = contentPluginEntries
      .filter(entry => preferences.enabled(entry.id, false))
      .map(entry => entry.id);
    const contentSnapshotKey = createHash("sha256")
      .update(
        JSON.stringify({
          appVersion: app.getVersion(),
          electronVersion: process.versions.electron,
          plugins: contentPluginIds.map(id => initialArtifacts.get(id)?.manifest),
        })
      )
      .digest("hex");
    const contentInspectionCryptor = cacheCryptor;
    const contentInspectionCache = await measureStartup("content-inspection-cache", () =>
      PluginContentInspectionCache.load(
        path.join(PathUtil.getAppDir(), "plugin-content-inspection-cache.bin"),
        contentSnapshotKey,
        contentInspectionCryptor
      )
    );
    const contentInspectionResults = new Map<string, ContentPluginInspection>();
    const contentStartup = new PluginContentStartup(
      async id => {
        if (updateState.some(item => item.id === id && item.blocked))
          throw new Error("插件更新尚未恢复");
        const artifact = initialArtifacts.get(id);
        if (!artifact || artifact.manifest.id !== id) throw new Error("内容插件身份或声明无效");
        if (artifact.manifest.formatVersion === 3 && app.isPackaged) {
          const source = initialSources[id];
          assertDesktopPackageSource(artifact.manifest, source, API_ORIGIN, app.isPackaged);
        }
        return artifact;
      },
      async artifacts => {
        const results: Record<string, ContentPluginInspection> = Object.create(null);
        const errors: Record<string, string> = Object.create(null);
        const missing = artifacts.filter(artifact => {
          const cached = contentInspectionCache.get(artifact.manifest.id);
          if (!cached) return true;
          results[artifact.manifest.id] = cached;
          return false;
        });
        if (results && artifacts.length > missing.length)
          recordStage(
            "plugin-local:content-plugin-cache-hit",
            0,
            artifacts.length - missing.length
          );

        if (missing.length) {
          try {
            const inspected = await measureStartup("content-plugin-inspect-batch", () =>
              contentExecutor.execute<Record<string, ContentPluginInspection>>(
                { operation: "inspect-many", ids: missing.map(artifact => artifact.manifest.id) },
                undefined,
                [...getContentPluginArtifacts(), ...artifacts]
              )
            );
            for (const artifact of missing) {
              const id = artifact.manifest.id;
              const result = inspected[id];
              if (!result) {
                errors[id] = "内容插件未返回检查结果";
                continue;
              }
              results[id] = result;
              contentInspectionCache.set(id, result);
            }
          } catch {
            const accepted: DevelopmentPluginPackage[] = [];
            for (const id of Object.keys(results)) delete results[id];
            for (const artifact of artifacts) {
              const id = artifact.manifest.id;
              try {
                const result = await contentExecutor.execute<ContentPluginInspection>(
                  { operation: "inspect", id },
                  undefined,
                  [...getContentPluginArtifacts(), ...accepted, artifact]
                );
                results[id] = result;
                if (result.editor || result.whiteboard) accepted.push(artifact);
              } catch (error) {
                errors[id] = error instanceof Error ? error.message : String(error);
              }
            }
          }
        }
        for (const [id, result] of Object.entries(results))
          contentInspectionResults.set(id, result);
        return { results, errors } satisfies ContentPluginInspectionBatch;
      }
    );
    const snapshot = await measureStartup(
      "content-plugin-inspection",
      () => contentStartup.get(contentPluginIds),
      result => result.artifacts.length
    );
    for (const artifact of snapshot.artifacts) appendContentPluginArtifact(artifact);
    installDesktopPluginMetrics(
      snapshot.artifacts.flatMap(
        artifact => contentInspectionResults.get(artifact.manifest.id)?.metrics ?? []
      )
    );
    await contentInspectionCache.save().catch(error => {
      log.warn("[plugin-local] 内容插件检查缓存写入失败", error);
    });
    const validContentPluginEntries = contentPluginEntries.filter(entry => {
      if (!entry.artifact || updateState.some(item => item.id === entry.id && item.blocked))
        return false;
      try {
        assertDesktopPackageSource(
          entry.artifact.manifest,
          initialSources[entry.id],
          API_ORIGIN,
          app.isPackaged
        );
        return true;
      } catch {
        return false;
      }
    });
    const startupSnapshot = {
      ...snapshot,
      intents: Object.fromEntries(
        validContentPluginEntries.map(entry => [entry.id, preferences.enabled(entry.id, false)])
      ),
    };
    ipcMain.handle("plugin-local:content-startup", () => startupSnapshot);
    if (!app.isPackaged)
      ipcMain.handle("plugin-local:portable-development", () => portableDevelopmentArtifacts());
    const broadcast = (channel: string) => {
      for (const window of BrowserWindow.getAllWindows()) {
        try {
          if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
          window.webContents.send(channel);
        } catch (error) {
          log.warn(`插件状态通知失败：${channel}`, error);
        }
      }
    };
    const stateChanged = () => broadcast("plugin-local:state-changed");
    /** 首次安装：插件中心来源直接启用，本地 ZIP 默认停用；更新保留原启用意图。 */
    const applyInstalled = async (
      installed: { id: string; version: string },
      enableOnInstall = false
    ) => {
      let fresh = false;
      const applied = await pluginPublishSessions.protect(installed.id, () =>
        protectPluginBackendChange(installed.id, () =>
          updates.apply(installed.id, async (artifact, replacing) => {
            if (await contentStartup.uses(installed.id)) return false;
            // 模板与 Skill 包不参与启停，安装后立即可用。
            fresh = !replacing && !isTemplatePackage(artifact) && !isSkillPackage(artifact);
            if (!replacing) await preferences.set(installed.id, false);
            const deferred =
              !isTemplatePackage(artifact) &&
              !isSkillPackage(artifact) &&
              artifact.manifest.formatVersion !== 3 &&
              isContentPlugin(artifact.manifest) &&
              preferences.enabled(installed.id, false);
            if (!deferred) await stopPluginBackend(installed.id);
            return !deferred;
          })
        )
      );
      // 内容插件的启动快照不含新包，先以停用落盘，再写入启用意图，由重启加载。
      if (applied && fresh && enableOnInstall) {
        await protectPluginTasks(installed.id, () => preferences.set(installed.id, true));
        void activatePluginBackends().catch(() => undefined);
      }
      stateChanged();
      return installed;
    };
    const imagesChanged = () => broadcast("plugin-images:changed");
    pluginImagesRelay.onChange = imagesChanged;
    ipcMain.handle(
      "plugin-local:images-config",
      async (
        _event,
        instanceId: string,
        pluginId: string,
        config: import("@tau/plugins").JsonValue,
        modelId: string
      ) => {
        const artifact = await readPluginPackage(
          path.join(directory(), pluginId),
          app.getVersion()
        );
        if (artifact.manifest.id !== pluginId) throw new Error("插件身份无效");
        await userSetting.updateImagePlugin(instanceId, pluginId, copyJson(config), modelId);
      }
    );
    ipcMain.handle("plugin-local:images-connect", (event, session: string) => {
      if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
        throw new Error("图片插件只能由主窗口执行");
      pluginImagesRelay.connect(event.sender, session);
    });
    ipcMain.handle("plugin-local:images-release", (event, session: string) =>
      pluginImagesRelay.release(event.sender.id, session)
    );
    ipcMain.handle("plugin-local:images-changed", (event, session: string) => {
      if (pluginImagesRelay.hasHost(event.sender.id, session)) imagesChanged();
    });
    ipcMain.handle(
      "plugin-local:images-closed",
      (event, message: { session: string; hostSession: string }) =>
        pluginImagesRelay.rendererClosed(event.sender.id, message.hostSession, message.session)
    );
    ipcMain.handle(
      "plugin-local:images-request",
      (event, id: string, request: ImagesRendererRequest) =>
        pluginImagesRelay.request(event.sender, id, request)
    );
    ipcMain.handle("plugin-local:images-reply", (event, reply: ImagesRendererReply) =>
      pluginImagesRelay.reply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:images-cancel", (event, id: string) =>
      pluginImagesRelay.cancel(event.sender.id, id)
    );
    ipcMain.handle(
      "plugin-local:embeddings-config",
      async (_event, pluginId: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(
          path.join(directory(), pluginId),
          app.getVersion()
        );
        if (artifact.manifest.id !== pluginId) throw new Error("插件身份无效");
        await userSetting.updateEmbeddingPlugin(pluginId, copyJson(config));
      }
    );
    ipcMain.handle(
      "plugin-local:embeddings-connect",
      (event, session: string, providers: EmbeddingsProviderInfo[]) => {
        if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
          throw new Error("嵌入插件只能由主窗口执行");
        pluginEmbeddingsRelay.connect(event.sender, session, providers);
      }
    );
    ipcMain.handle(
      "plugin-local:embeddings-changed",
      (event, session: string, providers: EmbeddingsProviderInfo[]) => {
        if (pluginEmbeddingsRelay.hasHost(event.sender.id, session))
          pluginEmbeddingsRelay.update(event.sender.id, session, providers);
      }
    );
    ipcMain.handle("plugin-local:embeddings-release", (event, session: string) =>
      pluginEmbeddingsRelay.release(event.sender.id, session)
    );
    ipcMain.handle("plugin-local:embeddings-reply", (event, reply: EmbeddingsRendererReply) =>
      pluginEmbeddingsRelay.reply(event.sender.id, reply)
    );
    ipcMain.handle(
      "plugin-local:video-config",
      async (_event, pluginId: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(
          path.join(directory(), pluginId),
          app.getVersion()
        );
        if (artifact.manifest.id !== pluginId) throw new Error("插件身份无效");
        await userSetting.updateVideoPlugin(pluginId, copyJson(config));
      }
    );
    ipcMain.handle("plugin-local:video-connect", (event, session: string) => {
      if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
        throw new Error("视频插件只能由主窗口执行");
      pluginVideoRelay.connect(event.sender, session);
    });
    ipcMain.handle("plugin-local:video-release", (event, session: string) =>
      pluginVideoRelay.release(event.sender.id, session)
    );
    ipcMain.handle(
      "plugin-local:video-publish",
      (event, session: string, state: VideoProvidersState) =>
        pluginVideoRelay.publish(event.sender.id, session, state)
    );
    ipcMain.handle("plugin-local:video-providers", () => pluginVideoRelay.providers());
    ipcMain.handle(
      "plugin-local:video-request",
      (event, id: string, request: VideoRendererRequest) =>
        pluginVideoRelay.request(event.sender, id, request)
    );
    ipcMain.handle("plugin-local:video-reply", (event, reply: VideoRendererReply) =>
      pluginVideoRelay.reply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:video-cancel", (event, id: string) =>
      pluginVideoRelay.cancel(event.sender.id, id)
    );
    ipcMain.handle(
      "plugin-local:tts-config",
      async (
        _event,
        instanceId: string,
        pluginId: string,
        config: import("@tau/plugins").JsonValue,
        models: readonly { id: string; label?: string }[]
      ) => {
        const artifact = await readPluginPackage(
          path.join(directory(), pluginId),
          app.getVersion()
        );
        if (artifact.manifest.id !== pluginId) throw new Error("插件身份无效");
        await userSetting.updateTTSPlugin(instanceId, pluginId, copyJson(config), models);
      }
    );
    ipcMain.handle("plugin-local:tts-connect", (event, session: string) => {
      if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
        throw new Error("语音插件只能由主窗口执行");
      pluginTTSRelay.connect(event.sender, session);
    });
    ipcMain.handle("plugin-local:tts-release", (event, session: string) =>
      pluginTTSRelay.release(event.sender.id, session)
    );
    ipcMain.handle(
      "plugin-local:tts-closed",
      (event, message: { session: string; hostSession: string }) =>
        pluginTTSRelay.rendererClosed(event.sender.id, message.hostSession, message.session)
    );
    ipcMain.handle("plugin-local:tts-request", (event, id: string, request: TTSRendererRequest) =>
      pluginTTSRelay.request(event.sender, id, request)
    );
    ipcMain.handle("plugin-local:tts-reply", (event, reply: TTSRendererReply) =>
      pluginTTSRelay.reply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:tts-cancel", (event, id: string) =>
      pluginTTSRelay.cancel(event.sender.id, id)
    );
    ipcMain.handle("plugin-local:upload-connect", (event, session: string) => {
      if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
        throw new Error("上传插件只能由主窗口执行");
      pluginUploadRelay.connect(event.sender, session);
    });
    ipcMain.handle("plugin-local:upload-release", (event, session: string) =>
      pluginUploadRelay.release(event.sender.id, session)
    );
    ipcMain.handle("plugin-local:upload-reply", (event, reply: UploadRendererReply) =>
      pluginUploadRelay.reply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:upload", (event, request: UploadRequest, requestId?: string) =>
      pluginUploadRelay.upload(event.sender, request, requestId)
    );
    ipcMain.handle("plugin-local:upload-cancel", (event, requestId: string) =>
      pluginUploadRelay.cancel(event.sender.id, requestId)
    );
    ipcMain.handle("plugin-local:set-enabled", async (_event, id: string, enabled: boolean) => {
      const artifact = enabled
        ? await readManagedPackage(id)
        : await readPluginPackage(path.join(directory(), id), app.getVersion());
      if (artifact.manifest.id !== id) throw new Error("插件身份无效");
      await protectPluginTasks(id, () => preferences.set(id, enabled));
      if (!enabled) await stopPluginBackend(id);
      else void activatePluginBackends().catch(() => undefined);
      stateChanged();
    });
    ipcMain.handle(
      "plugin-local:workspace",
      async (_event, name: string) => (await getPluginRegistry().open(name)).id
    );
    ipcMain.handle("plugin-local:scan", async () => {
      const maintenance = await updates.list();
      const result = await discoverPlugins(directory(), app.getVersion(), packageIntegrityCache);
      await packageIntegrityCache.save().catch(error => {
        log.warn("[plugin-local] 插件完整性缓存写入失败", error);
      });
      const sources = await updates.sources(result.entries.map(entry => entry.id));
      return {
        ...result,
        clientVersion: app.getVersion(),
        updates: maintenance,
        entries: result.entries.map(entry => {
          const blocked = maintenance.find(item => item.id === entry.id && item.blocked);
          const sourced = {
            ...entry,
            source: sources[entry.id],
            enabled: preferences.enabled(entry.id, false),
          };
          if (entry.artifact) {
            try {
              assertDesktopPackageSource(
                entry.artifact.manifest,
                sources[entry.id],
                API_ORIGIN,
                app.isPackaged
              );
            } catch (error) {
              return {
                ...sourced,
                artifact: undefined,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }
          return blocked
            ? { ...sourced, artifact: undefined, error: blocked.error ?? "更新尚未恢复，暂不加载" }
            : sourced;
        }),
      };
    });
    ipcMain.handle("plugin-local:stage-zip", async event => {
      if (app.isPackaged) throw new Error("请从插件中心安装插件");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("安装插件需要应用窗口");
      const selected = await dialog.showOpenDialog(window, {
        title: "安装或更新插件",
        properties: ["openFile"],
        filters: [{ name: "插件 ZIP", extensions: ["zip"] }],
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      return applyInstalled(await updates.stageZip(selected.filePaths[0]));
    });
    ipcMain.handle(
      "plugin-local:sync-begin",
      (event, id: string, config: import("@tau/plugins").JsonValue) =>
        pluginSyncSessions.begin(event.sender.id, id, copyJson(config))
    );
    ipcMain.handle("plugin-local:publish-reply", (event, reply) =>
      acceptPublishRendererReply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:publish-release-window", event =>
      releasePublishRenderer(event.sender.id)
    );
    ipcMain.handle(
      "plugin-local:publish-config",
      async (_event, id: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
        if (artifact.manifest.id !== id) throw new Error("插件身份无效");
        await userSetting.updatePublishPlugin(id, copyJson(config));
      }
    );
    ipcMain.handle(
      "plugin-local:sync-reply",
      (event, reply: import("../../../shared/sync-renderer").SyncRendererReply) =>
        acceptSyncRendererReply(event.sender.id, reply)
    );
    ipcMain.handle("plugin-local:sync-release-window", event =>
      releaseSyncRenderer(event.sender.id)
    );
    ipcMain.handle("plugin-local:sync-end", (event, session: string) =>
      pluginSyncSessions.end(event.sender.id, session)
    );
    ipcMain.handle(
      "plugin-local:sync-config",
      async (_event, id: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
        if (artifact.manifest.id !== id) throw new Error("插件身份无效");
        await userSetting.updateProviderPlugin("sync", id, copyJson(config));
      }
    );
    ipcMain.handle(
      "plugin-local:upload-config",
      async (_event, id: string, config: import("@tau/plugins").JsonValue) => {
        const artifact = await readPluginPackage(path.join(directory(), id), app.getVersion());
        if (artifact.manifest.id !== id) throw new Error("插件身份无效");
        await userSetting.updateProviderPlugin("imageBed", id, copyJson(config));
      }
    );
    ipcMain.handle(
      "plugin-local:catalog",
      (_event, query?: string, sort?: import("@/types/plugin-center").PluginCatalogSort) =>
        fetchPluginCatalog(app.getVersion(), query, sort)
    );
    ipcMain.handle("plugin-local:release", (_event, id: string) => fetchPluginRelease(id));
    ipcMain.handle("plugin-local:community", (_event, id: string, cursor: string | null) =>
      fetchPluginCommunity(id, cursor)
    );
    ipcMain.handle("plugin-local:like", (_event, id: string, liked: boolean) =>
      setPluginLiked(id, liked)
    );
    ipcMain.handle(
      "plugin-local:comment",
      (_event, id: string, message: string, requestId: string) =>
        addPluginComment(id, message, requestId)
    );
    ipcMain.handle("plugin-local:delete-comment", (_event, id: string, commentId: string) =>
      deletePluginComment(id, commentId)
    );
    ipcMain.handle("plugin-local:versions", (_event, pluginId: string) =>
      fetchPluginVersions(app.getVersion(), pluginId)
    );
    ipcMain.handle("plugin-local:stage-release", async (_event, id: string) => {
      const { bytes, source } = await downloadPluginRelease(id, app.getVersion());
      return applyInstalled(await updates.stageRelease(bytes, source), true);
    });
    // 走正常退出流程，窗口的关闭守卫仍生效；用户取消退出时重启在下次退出后执行。
    ipcMain.handle("plugin-local:relaunch", async () => {
      if (await pluginSyncSessions.hasTasks()) throw new Error("同步任务正在进行，请完成后重启");
      if (pluginPublishSessions.busy) throw new Error("发布任务正在进行，请完成后重启");
      app.relaunch();
      app.quit();
    });
    ipcMain.handle("plugin-local:uninstall", async (_event, id: string) => {
      if (await contentStartup.uses(id)) throw new Error("请先停用内容插件并重启应用，再卸载");
      await protectPluginTasks(id, () =>
        protectPluginBackendChange(
          id,
          async () => {
            await stopPluginBackend(id);
            await updates.uninstall(id);
            await preferences.forget(id);
            await getPluginPermissionStore().forget(id);
          },
          true
        )
      );
      stateChanged();
    });
    ipcMain.handle("plugin-local:restore", async (_event, id: string) =>
      applyInstalled(await protectPluginTasks(id, () => updates.restore(id)))
    );
    ipcMain.handle("plugin-local:cancel-update", (_event, id: string) => updates.cancel(id));
    ipcMain.handle("plugin-local:open-directory", async () => {
      const root = directory();
      await mkdir(root, { recursive: true });
      const error = await shell.openPath(root);
      if (error) throw new Error(error);
    });
  },
};

async function measureStartup<T>(
  label: string,
  run: () => Promise<T>,
  count?: (value: T) => number
): Promise<T> {
  const startedAt = performance.now();
  const value = await run();
  recordStage(`plugin-local:${label}`, performance.now() - startedAt, count?.(value));
  return value;
}
