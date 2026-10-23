import { refreshMobileCenterInstallations } from "../../services/pluginCenter";
import { useEffect, useState, useId, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { mobileContentPlugins, mobilePluginElementSupport } from "./content";
import { MobilePluginRuntime } from "./runtime";
import { MobilePluginsContext } from "./context";
import { subscribePluginForeground } from "./foreground";
import { disposeMobileRuntimeStyles } from "../../services/runtimeStyles";

const STARTING_KEY = "tau-portable-plugins-starting";
let cleanup: Promise<unknown> = Promise.resolve();
const restartRequired = new Set<string>();

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
  const [session, setSession] = useState<MobilePluginRuntime | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let cancelled = false;
    let runtime: MobilePluginRuntime | undefined;
    let disconnect: (() => void) | undefined;
    let stopStatusRefresh: (() => void) | undefined;
    const previous = cleanup;
    const preparation = (async () => {
      await previous;
      if (cancelled) return;
      await applyPendingMobilePlugins();
      await refreshMobileCenterInstallations().catch(() => undefined);
      const data = await client.fetchQuery({
        queryKey: [...MOBILE_PLUGIN_QUERY, "startup", database, sessionId],
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
      const safe = localStorage.getItem(STARTING_KEY) !== null;
      if (safe)
        setFailure(
          "上次插件启动未结束，本次已跳过插件。可在插件管理中停用问题插件后重新打开应用。"
        );
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
      await runtime.start(safe ? [] : data.packages, mobileSharedPluginModules, registry => {
        getMobileContentKit().extend({ extensions: registry.extensions });
        assertUniqueEditorCodecs([...mobileCodecComposition, ...registry.codecs]);
      });
      if (cancelled) return;
      mobileContentPlugins.install(runtime.content.list());
      mobilePluginElementSupport.clear();
      runtime.elementSupport.forEach((value, key) => mobilePluginElementSupport.set(key, value));
      localStorage.removeItem(STARTING_KEY);
      setSession(runtime);
      let checking = false;
      const activeRuntime = runtime;
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
      if (data.packages.some(item => item.centerSource))
        stopStatusRefresh = subscribePluginForeground(onVisible);
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
        if (!cancelled) setFailure(String(error));
      })
      .finally(() => {
        if (cancelled) localStorage.removeItem(STARTING_KEY);
      });
    return () => {
      cancelled = true;
      disposeMobileRuntimeStyles();
      disconnect?.();
      stopStatusRefresh?.();
      const disposal = runtime?.dispose();
      cleanup = Promise.allSettled([previous, preparation, disposal]).then(results => {
        for (const result of results)
          if (result.status === "rejected") console.error("插件会话清理失败", result.reason);
        mobileContentPlugins.install([]);
        mobilePluginElementSupport.clear();
      });
    };
  }, [client, database, navigator, sessionId]);
  if (!session && !failure) return <p className="text-ink-2 p-6">正在准备插件…</p>;
  const body = (
    <MobilePluginsContext.Provider value={session}>
      {failure && (
        <p role="alert" className="text-warn p-3">
          {failure}
        </p>
      )}
      {children}
    </MobilePluginsContext.Provider>
  );
  return session ? (
    <PluginEnvironmentProvider source={session.environment}>{body}</PluginEnvironmentProvider>
  ) : (
    body
  );
}
