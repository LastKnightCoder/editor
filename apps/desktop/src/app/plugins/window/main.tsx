import { createRoot } from "react-dom/client";
import { Component, useLayoutEffect, type ReactNode } from "react";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { createThemeRuntime } from "@tau/themes/react";
import { IconButton, PortalScope, UiHostProvider, UiProvider } from "@tau/ui";
import { X } from "lucide-react";
import type { PluginWindowParams } from "@tau/plugins";
import { version } from "../../../../package.json";
import { evaluateDesktopPluginPackage } from "../../../../shared/plugin-rendering";
import type {
  PluginWindowCalls,
  StateSnapshot,
  WindowTransport,
} from "../../../../shared/plugin-window-protocol";
import { applyWindowFont } from "@/hooks/applyWindowFont";
import { connectWindowCommunication } from "../window-communication";
import "./window.css";

const transport = (window as Window & { tauPluginWindow?: WindowTransport<PluginWindowCalls> })
  .tauPluginWindow;
if (!transport) throw new Error("插件窗口桥未加载");
const bridge = transport;
const container = document.getElementById("root");
if (!container) throw new Error("插件窗口缺少渲染容器");
const root = createRoot(container);
const lifecycle = new AbortController();
const dismissers: Array<() => void> = [];

function close() {
  return bridge.invoke("closeSelf", undefined);
}

function registerDismiss(dismiss: () => void) {
  dismissers.push(dismiss);
  return () => {
    const index = dismissers.lastIndexOf(dismiss);
    if (index >= 0) dismissers.splice(index, 1);
  };
}

class WindowBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("插件窗口渲染失败", error);
    void bridge.invoke("failed", { phase: "mount" }).catch(() => undefined);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

async function start() {
  const runtime = createThemeRuntime({ storage: () => null });
  let params: StateSnapshot<PluginWindowParams> | undefined;
  const viewUpdate: { render?: () => void } = {};
  let shown = false;
  let readyPending = false;
  let committedRevision = 0;
  const connection = connectWindowCommunication(
    bridge,
    lifecycle.signal,
    preference => {
      const store = runtime.useThemeStore.getState();
      if (store.theme !== preference.themeId) store.setTheme(preference.themeId);
      if (store.appearance !== preference.appearance) store.setAppearance(preference.appearance);
      applyWindowFont(preference.font);
      return { ...preference, mode: runtime.useThemeStore.getState().mode };
    },
    snapshot => {
      params = snapshot;
      viewUpdate.render?.();
    }
  );
  const initial = await bridge.invoke("bootstrap", undefined);
  const stop = runtime.init({ forceMode: initial.options.theme === "dark" ? "dark" : undefined });
  const unsubscribe = runtime.useThemeStore.subscribe((state, previous) => {
    if (state.mode !== previous.mode) queueMicrotask(connection.refreshAppearance);
  });
  window.addEventListener(
    "pagehide",
    () => {
      lifecycle.abort();
      stop();
      unsubscribe();
    },
    { once: true }
  );
  connection.bind(initial.endpoint, initial.appearance);
  connection.receiveParams(initial.params);
  const definition = evaluateDesktopPluginPackage(initial.artifact, sharedPluginModules, version);
  const view = definition.windows?.find(candidate => candidate.id === initial.windowId);
  if (!view) throw new Error("插件包中缺少窗口组件");
  if (initial.artifact.css) {
    const style = document.createElement("style");
    style.textContent = initial.artifact.css;
    document.head.append(style);
  }

  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
    const dismiss = dismissers.at(-1);
    if (dismiss) {
      event.preventDefault();
      dismiss();
    } else if (initial.options.kind === "fullscreen") {
      event.preventDefault();
      void close().catch(console.error);
    }
  });

  function reportReady() {
    if (shown || readyPending || !committedRevision) return;
    const revision = committedRevision;
    readyPending = true;
    void bridge
      .invoke("ready", { revision })
      .then(result => {
        readyPending = false;
        if (result.status === "shown") {
          shown = true;
          return;
        }
        connection.receiveParams(result.latest);
        if (committedRevision > revision) reportReady();
      })
      .catch(error => {
        console.error("插件窗口就绪失败", error);
        void bridge.invoke("failed", { phase: "mount" }).catch(() => undefined);
      });
  }

  const View = view.component;
  // 独立入口由加载握手装配，Vite 热更新时重新加载窗口文档。
  // oxlint-disable-next-line react/only-export-components
  function Content({ snapshot }: { snapshot: StateSnapshot<PluginWindowParams> }) {
    useLayoutEffect(() => {
      committedRevision = snapshot.revision;
      reportReady();
    }, [snapshot.revision]);
    return (
      <View
        params={Object.freeze(snapshot.value ?? {})}
        signal={lifecycle.signal}
        close={close}
        communication={connection.communication}
      />
    );
  }
  viewUpdate.render = () => {
    if (!params) return;
    root.render(
      <WindowBoundary>
        <UiProvider className="contents">
          <PortalScope>
            <UiHostProvider registerDismiss={registerDismiss}>
              <div className="app bg-page font-tau text-tau-body text-ink-1 flex h-dvh flex-col overflow-hidden">
                {initial.options.kind !== "normal" && (
                  <div className="app-region-drag flex shrink-0 items-center justify-between gap-2 px-2">
                    <span className="truncate">{view.title}</span>
                    <IconButton
                      className="app-region-no-drag"
                      aria-label="关闭窗口"
                      onClick={() => void close().catch(console.error)}
                    >
                      <X />
                    </IconButton>
                  </div>
                )}
                <main className="min-h-0 flex-1 overflow-auto">
                  <Content snapshot={params} />
                </main>
              </div>
            </UiHostProvider>
          </PortalScope>
        </UiProvider>
      </WindowBoundary>
    );
  };
  viewUpdate.render();
}

void start().catch(error => {
  console.error("插件窗口启动失败", error);
  void bridge.invoke("failed", { phase: "evaluate" }).catch(() => undefined);
});
