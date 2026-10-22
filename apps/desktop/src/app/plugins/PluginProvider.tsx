import { useEffect, useState, type ReactNode } from "react";
import { createBrowserStorage } from "@tau/plugins/host";
import { usePage } from "@/page/PageProvider";
import useSettingStore from "@/stores/useSettingStore";
import { DesktopPluginRuntime, PLUGIN_DETAIL_KEY } from "./runtime";
import { PluginRuntimeContext, PluginRuntimeErrorContext } from "./context";
import { desktopFetch } from "@/commands/fetch";
import { isElectron, on, off } from "@/electron";
import { getPluginWorkspace } from "@/commands/plugin-local";
import { createDesktopExcerpts } from "./excerpts";
import { createDesktopData } from "./data";
import { createDesktopEvents } from "./events";
import { createDesktopApp } from "./app";
import { createDesktopEntities } from "./entities";
import { createDesktopRecords } from "./records";
import { createDesktopLinks } from "./links";
import { createDesktopTransaction } from "./transaction";
import {
  createDatabaseStorage,
  migrateLegacyPluginStorage,
  migratePluginPreferences,
} from "./kv-storage";
import { clearPluginKv } from "@/commands/plugin-kv";
import { clearPluginRefGrants, grantPluginRefs } from "@/commands/plugin-data";
import { DesktopPermissionBroker } from "./permissions";
import { createDesktopFlashcards } from "./flashcards";
import { desktopPluginServices } from "./services";
import { useSettingsStore } from "@/app/settingsStore";
import { connectSyncRenderer } from "./sync-bridge";
import { connectUploadRenderer } from "./upload-bridge";
import { connectTTSRenderer } from "./tts-bridge";
import { connectImagesRenderer } from "./images-bridge";
import { connectVideoRenderer, rendererVideoRegistry } from "./video-bridge";
import { connectPublishRenderer } from "./publish-bridge";
import { registerPluginMCP } from "@/tools/pluginMCP";
import { declareContentPluginResources } from "./element-resources";

const restartRequired = new Set<string>();
let pendingCleanup: Promise<void> = Promise.resolve();

export function DesktopPluginProvider({ children }: { children: ReactNode }) {
  useEffect(connectSyncRenderer, []);
  useEffect(connectUploadRenderer, []);
  useEffect(connectTTSRenderer, []);
  useEffect(connectImagesRenderer, []);
  useEffect(connectVideoRenderer, []);
  useEffect(connectPublishRenderer, []);
  const { navigator } = usePage();
  const workspaceId = useSettingStore(state => state.setting.database.active);
  const [runtime, setRuntime] = useState<DesktopPluginRuntime | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isElectron) return;
    declareContentPluginResources(workspaceId).catch(error =>
      console.warn("插件节点的资源声明未保存", error)
    );
  }, [workspaceId]);
  useEffect(() => {
    let current: DesktopPluginRuntime | undefined;
    let cancelled = false;
    const onLocalState = () => {
      void current?.local?.refresh().catch(() => undefined);
    };
    if (isElectron) on("plugin-local:state-changed", onLocalState);
    const previousCleanup = pendingCleanup;
    const preparation = (
      import.meta.env.DEV ? import("./editorComposition") : Promise.resolve(null)
    )
      .then(async modules => {
        await previousCleanup;
        if (cancelled) return;
        const composePluginEditor = modules?.composePluginEditor;
        const persistentWorkspaceId = isElectron
          ? await getPluginWorkspace(workspaceId)
          : workspaceId;
        if (cancelled) return;
        if (isElectron) {
          migratePluginPreferences(window.localStorage, workspaceId, persistentWorkspaceId);
          // 私有存储迁入主库：失败即中止插件初始化，旧数据保留，下次启动重试
          await migrateLegacyPluginStorage(window.localStorage, persistentWorkspaceId, workspaceId);
          if (cancelled) return;
        }
        const permissions = isElectron
          ? new DesktopPermissionBroker(persistentWorkspaceId)
          : undefined;
        current = new DesktopPluginRuntime({
          workspaceId: persistentWorkspaceId,
          navigator,
          storage: isElectron
            ? createDatabaseStorage(workspaceId)
            : createBrowserStorage(window.localStorage),
          plugins: [],
          fetch: desktopFetch,
          services: desktopPluginServices,
          mcp: {
            register: (context, definition, owner) =>
              registerPluginMCP(context, definition, owner, workspaceId),
          },
          ...createDesktopExcerpts(workspaceId),
          data: createDesktopData(workspaceId),
          events: createDesktopEvents(workspaceId),
          app: createDesktopApp(workspaceId),
          entities: createDesktopEntities(workspaceId),
          records: createDesktopRecords(workspaceId),
          links: createDesktopLinks(workspaceId),
          transaction: createDesktopTransaction(workspaceId),
          ...(isElectron
            ? {
                // 私有存储与用户为它选择过的引用一并清除；插件内容、记录与关联按卸载宽限另行回收
                grantRefs: async (pluginId, refs) => {
                  await grantPluginRefs(workspaceId, pluginId, refs);
                },
                purgeStorage: async (pluginId: string) => {
                  await clearPluginKv(workspaceId, pluginId);
                  await clearPluginRefGrants(workspaceId, pluginId);
                },
              }
            : {}),
          ...(permissions ? { permissions } : {}),
          flashcards: createDesktopFlashcards(workspaceId),
          restartRequired,
          validateEditor: composePluginEditor,
          openSettings: (key, target) =>
            target === "sync"
              ? useSettingsStore.getState().openSettings("sync")
              : target === "upload"
                ? useSettingsStore.getState().openSettings("imageBed")
                : target === "tts"
                  ? useSettingsStore.getState().openTTSSettings()
                  : target === "images"
                    ? useSettingsStore.getState().openSettings("imageGeneration")
                    : target === "video"
                      ? useSettingsStore.getState().openSettings("integration")
                      : target === "publish"
                        ? navigator.push("publish")
                        : navigator.push(PLUGIN_DETAIL_KEY, {
                            pluginId: key.split(":")[1],
                            tab: "settings",
                            section: key,
                          }),
        });
        const local = isElectron ? current.attachLocal(window.localStorage) : undefined;
        setRuntime(current);
        if (local)
          void local
            .refresh()
            .catch(() => undefined)
            .finally(() => rendererVideoRegistry.markReady());
        else rendererVideoRegistry.markReady();
      })
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : "插件初始化失败");
      });
    return () => {
      cancelled = true;
      if (isElectron) off("plugin-local:state-changed", onLocalState);
      pendingCleanup = Promise.allSettled([
        previousCleanup,
        current ? current.dispose() : preparation,
      ]).then(results => {
        for (const result of results) {
          if (result.status === "rejected") console.error("插件运行时清理失败", result.reason);
        }
      });
    };
  }, [workspaceId, navigator]);
  return (
    <PluginRuntimeContext.Provider value={runtime}>
      <PluginRuntimeErrorContext.Provider value={error}>
        {children}
      </PluginRuntimeErrorContext.Provider>
    </PluginRuntimeContext.Provider>
  );
}
