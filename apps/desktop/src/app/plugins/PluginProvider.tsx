import { useEffect, useState, type ReactNode } from "react";
import { createBrowserStorage } from "@tau/plugins/host";
import { desktopPluginEnvironment } from "./environment";
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
import { createDatabaseStorage } from "./kv-storage";
import {
  desktopPluginSecrets,
  clearPluginSecrets,
  listPluginSecretsSummary,
} from "@/commands/plugin-secrets";
import { clearPluginKv, listPluginKvSummary } from "@/commands/plugin-kv";
import { grantPluginRefs } from "@/commands/plugin-data";
import { bindDatabaseCommands } from "@/services/command-context";
import { invalidatePluginEntityAppearance } from "@/services/plugin-entity-kinds";
import type {
  PluginSecretCount,
  PluginWorkspaceDataSummary,
  RetainedPluginData,
} from "@/types/plugin-retained-data";
import { DesktopPermissionBroker } from "./permissions";
import { createDesktopFlashcards } from "./flashcards";
import { desktopPluginServices } from "./services";
import { connectSyncRenderer } from "./sync-bridge";
import { connectUploadRenderer } from "./upload-bridge";
import { connectCollaborationImageStorage } from "@/services/collaboration-image-storage";
import { connectTTSRenderer } from "./tts-bridge";
import { connectImagesRenderer } from "./images-bridge";
import { connectEmbeddingsRenderer } from "./embeddings-bridge";
import { connectVideoRenderer, rendererVideoRegistry } from "./video-bridge";
import { connectPublishRenderer } from "./publish-bridge";
import { registerPluginMCP } from "@/tools/pluginMCP";
import { declareContentPluginResources } from "./element-resources";
import { bindPackageWindows } from "./package-loader";
import { connectPluginWindowEnvironment } from "./windows";

const restartRequired = new Set<string>();
let pendingCleanup: Promise<void> = Promise.resolve();

function mergeRetainedData(
  workspace: readonly PluginWorkspaceDataSummary[],
  secrets: readonly PluginSecretCount[]
): RetainedPluginData[] {
  const byPlugin = new Map<string, RetainedPluginData>();
  for (const item of workspace) {
    byPlugin.set(item.pluginId, { ...item, secrets: 0 });
  }
  for (const secret of secrets) {
    if (!secret.pluginId || secret.count <= 0) continue;
    const existing = byPlugin.get(secret.pluginId);
    if (existing) {
      existing.secrets += secret.count;
    } else {
      byPlugin.set(secret.pluginId, {
        pluginId: secret.pluginId,
        entities: 0,
        entityKinds: [],
        records: 0,
        kv: 0,
        other: 0,
        updatedAt: null,
        secrets: secret.count,
      });
    }
  }
  return [...byPlugin.values()].sort((a, b) => {
    if (a.updatedAt !== null && b.updatedAt !== null && a.updatedAt !== b.updatedAt)
      return b.updatedAt - a.updatedAt;
    if (a.updatedAt !== null) return -1;
    if (b.updatedAt !== null) return 1;
    return a.pluginId.localeCompare(b.pluginId);
  });
}

export function DesktopPluginProvider({ children }: { children: ReactNode }) {
  useEffect(connectSyncRenderer, []);
  useEffect(connectPluginWindowEnvironment, []);
  useEffect(connectUploadRenderer, []);
  useEffect(connectCollaborationImageStorage, []);
  useEffect(connectTTSRenderer, []);
  useEffect(connectImagesRenderer, []);
  useEffect(connectEmbeddingsRenderer, []);
  useEffect(connectVideoRenderer, []);
  useEffect(connectPublishRenderer, []);
  const { navigator } = usePage();
  const workspaceId = useSettingStore(state => state.setting.database.active);
  const [session, setSession] = useState<{
    workspaceId: string;
    runtime: DesktopPluginRuntime;
  } | null>(null);
  const runtime = session && session.workspaceId === workspaceId ? session.runtime : null;
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
    const preparation = Promise.resolve()
      .then(async () => {
        await previousCleanup;
        if (cancelled) return;
        const persistentWorkspaceId = isElectron
          ? await getPluginWorkspace(workspaceId)
          : workspaceId;
        if (cancelled) return;
        const permissions = isElectron
          ? new DesktopPermissionBroker(persistentWorkspaceId)
          : undefined;
        current = new DesktopPluginRuntime({
          workspaceId: persistentWorkspaceId,
          workspaceName: workspaceId,
          environmentSource: desktopPluginEnvironment,
          navigator,
          storage: isElectron
            ? createDatabaseStorage(workspaceId)
            : createBrowserStorage(window.localStorage),
          secrets: isElectron ? desktopPluginSecrets : undefined,
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
                grantRefs: async (pluginId, refs) => {
                  await grantPluginRefs(workspaceId, pluginId, refs);
                },
                listRetainedData: async () => {
                  const bound = bindDatabaseCommands(
                    { listPluginKvSummary },
                    { databaseName: workspaceId }
                  );
                  const [workspaceData, secretCounts] = await Promise.all([
                    bound.listPluginKvSummary(workspaceId),
                    listPluginSecretsSummary(persistentWorkspaceId),
                  ]);
                  return mergeRetainedData(workspaceData, secretCounts);
                },
                purgeStorage: async (pluginId: string) => {
                  const bound = bindDatabaseCommands(
                    { clearPluginKv },
                    { databaseName: workspaceId }
                  );
                  await clearPluginSecrets(persistentWorkspaceId, pluginId);
                  await bound.clearPluginKv(workspaceId, pluginId);
                  invalidatePluginEntityAppearance();
                },
              }
            : {}),
          ...(permissions ? { permissions } : {}),
          flashcards: createDesktopFlashcards(workspaceId),
          restartRequired,
          openSettings: key =>
            navigator.push(PLUGIN_DETAIL_KEY, {
              pluginId: key.split(":")[1],
              tab: "settings",
              section: key,
            }),
        });
        if (import.meta.env.DEV) {
          const { portableDevelopmentDefinitions } = await import("./portable-development");
          if (cancelled) return;
          for (const { definition, artifact } of portableDevelopmentDefinitions) {
            current.host.registerTrusted(definition, bindPackageWindows(artifact));
            await current.host.enable(definition.id);
          }
        }
        const local = isElectron ? current.attachLocal(window.localStorage) : undefined;
        setSession({ workspaceId, runtime: current });
        if (local) {
          void local
            .refresh()
            .catch(() => undefined)
            .finally(() => rendererVideoRegistry.markReady());
        } else rendererVideoRegistry.markReady();
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
