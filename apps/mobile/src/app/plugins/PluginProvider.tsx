import { PluginAppActionHost } from "../../features/plugins/PluginAppActionHost";
import { listen } from "@tauri-apps/api/event";
import { PluginPermissionPrompt } from "../../features/plugins/PluginPermissionPrompt";
import type { PluginPermissionBroker } from "@tau/plugins/permission-host";
import { refreshMobileCenterInstallations } from "../../services/pluginCenter";
import {
  useCallback,
  useEffect,
  useState,
  useId,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PluginEntityPicker } from "../../features/plugins/PluginEntityPicker";
import type { MobileAppAdapter } from "./app";
import { useQueryClient } from "@tanstack/react-query";
import type { PluginEnvironment } from "@tau/plugins";
import {
  createBrowserPluginEnvironment,
  PluginEnvironmentProvider,
} from "@tau/plugins/environment-host";
import { useNavigator } from "../../router";
import {
  MOBILE_PLUGIN_QUERY,
  readMobilePlugins,
  applyPendingMobilePlugins,
  mobilePluginStorage,
} from "../../services/plugins";
import { toast } from "../../components/toast";
import { mobileContentPlugins, mobilePluginElementSupport, mobilePluginState } from "./content";
import { MobilePluginRuntime } from "./runtime";
import { connectMobilePluginTransport } from "./transport";
import { MobilePluginReloadContext, MobilePluginsContext } from "./context";
import { subscribePluginForeground } from "./foreground";
import { getMobileCenterInstallStore } from "./center-install";
import { disposeMobileRuntimeStyles } from "../../services/runtimeStyles";
import { installMobileEntityHost } from "../../services/pluginEntities";

const STARTING_KEY = "tau-portable-plugins-starting";
const SAFE_MESSAGE = "上次插件启动未结束，本次已跳过插件。可在插件中心停用问题插件后重新加载。";
// 会话就绪前没有插件组件消费环境，占位快照只为让环境 Provider 常驻、切换时不重挂应用子树
const PENDING_ENVIRONMENT: PluginEnvironment = {
  platform: "web",
  input: { coarsePointer: true, finePointer: false },
};
let cleanup: Promise<unknown> = Promise.resolve();
const restartRequired = new Set<string>();

function MobilePluginAppHost({ app }: { app: MobileAppAdapter }) {
  const request = useSyncExternalStore(app.subscribe, app.getSnapshot);
  return (
    <>
      <PluginEntityPicker request={request} />
      {app.actions && <PluginAppActionHost actions={app.actions} />}
    </>
  );
}

/**
 * 插件会话随数据库作用域挂载，children 立即渲染、不等待插件；
 * 启动阶段经 mobilePluginState 广播，消费方（编辑器、插件页、插件中心）各自按需等待。
 */
export function MobilePluginProvider({
  database,
  children,
}: {
  database: string;
  children: ReactNode;
}) {
  const navigator = useNavigator();
  const client = useQueryClient();
  const sessionId = useId();
  const [generation, setGeneration] = useState(0);
  const [permissions, setPermissions] = useState<PluginPermissionBroker | null>(null);
  const [app, setApp] = useState<MobileAppAdapter | null>(null);
  const [session, setSession] = useState<MobilePluginRuntime | null>(null);
  const reload = useCallback(() => setGeneration(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let runtime: MobilePluginRuntime | undefined;
    let disconnect: (() => void) | undefined;
    let disconnectTransport: (() => void) | undefined;
    let disconnectEntities: (() => void) | undefined;
    let stopStatusRefresh: (() => void) | undefined;
    const previous = cleanup;
    setSession(null);
    mobilePluginState.set({ phase: "starting", message: "" });
    const preparation = (async () => {
      await previous;
      if (cancelled) return;
      await applyPendingMobilePlugins();
      const data = await client.fetchQuery({
        queryKey: [...MOBILE_PLUGIN_QUERY, "startup", database, sessionId, generation],
        queryFn: readMobilePlugins,
        staleTime: 0,
        gcTime: 0,
      });
      if (cancelled) return;
      const environment = createBrowserPluginEnvironment(data.platform, window);
      disconnect = environment.connect();
      runtime = new MobilePluginRuntime(
        environment,
        mobilePluginStorage(database),
        database,
        navigator,
        data.appVersion,
        restartRequired
      );
      disconnectTransport = await connectMobilePluginTransport(runtime);
      if (cancelled) {
        disconnectTransport();
        return;
      }
      setPermissions(runtime.permissions ?? null);
      setApp(runtime.app ?? null);
      disconnectEntities = installMobileEntityHost(runtime);
      const safe = localStorage.getItem(STARTING_KEY) !== null;
      localStorage.setItem(STARTING_KEY, "1");
      const { mobileSharedPluginModules } = await import("./shared-modules");
      await import("@tau/plugins/source-editor-host");
      if (cancelled) return;
      const [{ getMobileContentKit }, { mobileCodecComposition }, { assertUniqueEditorCodecs }] =
        await Promise.all([
          import("../../services/editorKit"),
          import("../../services/editorMarkdown"),
          import("@tau/plugins/rendering"),
        ]);
      await runtime.start(
        safe ? [] : data.packages,
        mobileSharedPluginModules,
        registry => {
          getMobileContentKit().extend({ extensions: registry.extensions });
          assertUniqueEditorCodecs([...mobileCodecComposition, ...registry.codecs]);
        },
        () => {
          if (!runtime || cancelled) return;
          mobileContentPlugins.install(runtime.content.list());
          mobilePluginElementSupport.clear();
          runtime.elementSupport.forEach((value, key) =>
            mobilePluginElementSupport.set(key, value)
          );
        },
        { safeMode: safe }
      );
      if (cancelled) return;
      localStorage.removeItem(STARTING_KEY);
      setSession(runtime);
      mobilePluginState.set(
        safe ? { phase: "safe", message: SAFE_MESSAGE } : { phase: "ready", message: "" }
      );
      const openInstalled = () => navigator.push("plugins", { tab: "installed" });
      if (safe) {
        console.warn("[plugins] 上次启动未结束，本次进入安全模式跳过全部插件");
        toast({
          type: "warning",
          text: SAFE_MESSAGE,
          duration: 8000,
          action: { label: "管理插件", onClick: openInstalled },
        });
      }
      const failed = data.packages
        .filter(item => runtime?.errors.has(item.id))
        .map(item => `「${item.name ?? item.artifact?.manifest.name ?? item.id}」`);
      if (failed.length) {
        console.warn(`[plugins] 会话就绪，${failed.length} 个插件启动失败：${failed.join("")}`);
        toast({
          type: "warning",
          text: `${failed.join("")}启动失败`,
          action: { label: "查看", onClick: openInstalled },
        });
      } else {
        console.info(`[plugins] 会话就绪，已加载 ${runtime.host.listPlugins().length} 个插件`);
      }
      let checking = false;
      const activeRuntime = runtime;
      // 撤回状态先用本地缓存启动，联网核验放在会话就绪之后，命中撤回再按 blockFromCenter 停用
      const refreshStatus = async () => {
        if (document.visibilityState === "hidden" || checking || cancelled) return;
        checking = true;
        try {
          await refreshMobileCenterInstallations().catch(() => undefined);
          const inventory = await readMobilePlugins();
          if (cancelled || !activeRuntime.isAvailable) return;
          for (const item of inventory.packages.filter(item => item.blocked)) {
            const disposal = activeRuntime.blockFromCenter(item.id);
            activeRuntime.elementSupport.forEach((value, type) =>
              mobilePluginElementSupport.set(type, value)
            );
            await disposal;
          }
          await client.invalidateQueries({ queryKey: MOBILE_PLUGIN_QUERY });
        } finally {
          checking = false;
        }
      };
      const onVisible = () => {
        void refreshStatus().catch(() => undefined);
      };
      if (data.packages.some(item => item.centerSource)) {
        stopStatusRefresh = subscribePluginForeground(onVisible);
        onVisible();
      }
      if (import.meta.env.MODE === "plugin-validation") {
        const activeRuntime = runtime;
        window.setTimeout(() => {
          if (!cancelled)
            void import("@validation/host/run").then(module => {
              if (!cancelled) return module.validateMobileHost(activeRuntime, navigator, database);
            });
        }, 1000);
      }
      if (import.meta.env.MODE === "plugin-center-validation") {
        window.setTimeout(() => {
          if (!cancelled)
            void import("@validation/host/center").then(module => {
              if (!cancelled)
                return module.validateMobileCenter(activeRuntime, navigator, database, client);
            });
        }, 1000);
      }
    })()
      .catch(error => {
        if (cancelled) return;
        console.error("[plugins] 插件会话启动失败", error);
        mobilePluginState.set({ phase: "failed", message: String(error) });
        toast({
          type: "error",
          text: `插件启动失败：${String(error)}`,
          action: { label: "重试", onClick: reload },
        });
      })
      .finally(() => {
        if (cancelled) localStorage.removeItem(STARTING_KEY);
      });
    return () => {
      cancelled = true;
      setPermissions(null);
      setApp(null);
      disconnectEntities?.();
      disposeMobileRuntimeStyles();
      disconnect?.();
      disconnectTransport?.();
      stopStatusRefresh?.();
      const disposal = runtime?.dispose();
      cleanup = Promise.allSettled([previous, preparation, disposal]).then(results => {
        for (const result of results)
          if (result.status === "rejected") console.error("插件会话清理失败", result.reason);
        mobileContentPlugins.install([]);
        mobilePluginElementSupport.clear();
      });
    };
  }, [client, database, navigator, sessionId, generation, reload]);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void listen<string>("plugin-workspace-reset", ({ payload }) => {
      if (!cancelled && payload === database) reload();
    })
      .then(dispose => {
        if (cancelled) dispose();
        else stop = dispose;
      })
      .catch(error => console.warn("插件工作区事件订阅失败", error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [database, reload]);

  // 安装队列清空后重建一次会话，让新装与更新的插件直接生效；安全模式下不自动加载插件
  useEffect(() => {
    const store = getMobileCenterInstallStore(client);
    let previous = store.getSnapshot();
    let finished = new Set<string>();
    let cancelled = false;
    const stop = store.subscribe(() => {
      const snapshot = store.getSnapshot();
      for (const task of snapshot.values())
        if (task.status === "success" && previous.get(task.pluginId) !== task)
          finished.add(task.pluginId);
      previous = snapshot;
      if (!finished.size || [...snapshot.values()].some(task => task.status === "pending")) return;
      const ids = finished;
      finished = new Set();
      if (mobilePluginState.get().phase === "safe") return;
      void readMobilePlugins()
        .then(inventory => {
          if (
            !cancelled &&
            mobilePluginState.get().phase !== "safe" &&
            inventory.packages.some(item => ids.has(item.id))
          )
            reload();
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [client, reload]);

  return (
    <MobilePluginReloadContext.Provider value={reload}>
      <MobilePluginsContext.Provider value={session}>
        {app && <MobilePluginAppHost app={app} />}
        {permissions && <PluginPermissionPrompt broker={permissions} />}
        {session ? (
          <PluginEnvironmentProvider source={session.environment}>
            {children}
          </PluginEnvironmentProvider>
        ) : (
          <PluginEnvironmentProvider value={PENDING_ENVIRONMENT}>
            {children}
          </PluginEnvironmentProvider>
        )}
      </MobilePluginsContext.Provider>
    </MobilePluginReloadContext.Provider>
  );
}
