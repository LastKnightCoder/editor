import { useCallback, useMemo, useRef, useEffect, type ReactNode } from "react";
import { normalizePageParams } from "@tau/plugins/host";
import type { PluginPageContext } from "@tau/plugins";
import { Button, ErrorBoundary, Loading, PortalScope, UiHostProvider, UiProvider } from "@tau/ui";
import { PageHeader } from "../../components/PageHeader";
import { usePage } from "../../router";
import { usePageInstanceContext, usePageGuard } from "../../router/pageLifecycle";
import { useMobilePlugins, useMobilePluginStatus } from "../../app/plugins/context";

/** 插件域页面外壳：全站 PageHeader 顶栏；header 传入时整体替换顶栏内容（如搜索展开态）。 */
export function PluginPageShell({
  title,
  actions,
  header,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  const { navigator, entryId } = usePage();
  const { phase } = usePageInstanceContext();
  const registerDismiss = useCallback(
    (dismiss: () => void) => {
      if (phase !== "active") return () => undefined;
      return navigator.registerBackHandler(entryId, () => {
        dismiss();
        return true;
      });
    },
    [navigator, entryId, phase]
  );
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 flex flex-col">
      <PageHeader title={title} onBack={() => void navigator.goBack("ui")} actions={actions}>
        {header}
      </PageHeader>
      <div className="mobile-page-scroll min-h-0 flex-1 overflow-auto px-4">
        <PortalScope>
          <UiHostProvider registerDismiss={registerDismiss}>
            <UiProvider className="contents">{children}</UiProvider>
          </UiHostProvider>
        </PortalScope>
      </div>
    </div>
  );
}

const PLUGIN_STARTING = <Loading minHeight={240} label="插件加载中…" />;

export function PluginPageView() {
  const runtime = useMobilePlugins();
  const { phase } = useMobilePluginStatus();
  const { params, navigator, entryId } = usePage<{ id: string; params: string }>();
  const lifecycle = usePageInstanceContext();
  const page = runtime?.pages.get(params.id);
  const guards = useRef(new Set<() => boolean | Promise<boolean>>());
  usePageGuard(async () => {
    if (!page || !runtime?.active(page.context)) return true;
    for (const guard of guards.current) if (!(await guard())) return false;
    return true;
  });
  useEffect(
    () => () => {
      runtime?.pageStates.delete(entryId);
    },
    [runtime, entryId]
  );
  const current = useRef({ phase: lifecycle.phase, page });
  current.current = { phase: lifecycle.phase, page };
  const pageContext = useMemo<PluginPageContext>(
    () => ({
      isActive: () =>
        current.current.phase === "active" &&
        !!page &&
        current.current.page === page &&
        !!runtime?.active(page.context),
      register: provider => {
        if (typeof provider !== "function") throw new Error("上下文提供器必须是函数");
        if (!page || !runtime?.active(page.context)) throw new Error("插件页面不可用");
        if (runtime.pageStates.has(entryId)) throw new Error("页面上下文已注册");
        runtime.pageStates.set(entryId, provider);
        return {
          dispose() {
            if (runtime.pageStates.get(entryId) === provider) runtime.pageStates.delete(entryId);
          },
        };
      },
      registerLeaveGuard: guard => {
        const entry = () => guard();
        guards.current.add(entry);
        return {
          dispose: () => {
            guards.current.delete(entry);
          },
        };
      },
      registerDismiss: dismiss => ({
        dispose: navigator.registerBackHandler(entryId, () => {
          if (!page || !runtime?.active(page.context)) return false;
          dismiss();
          return true;
        }),
      }),
    }),
    [page, runtime, navigator, entryId]
  );
  const cleanParams = useMemo(() => {
    try {
      return Object.freeze(normalizePageParams(JSON.parse(params.params)));
    } catch {
      return null;
    }
  }, [params.params]);
  const available = page && runtime?.active(page.context);
  const Component = page?.definition.component;
  return (
    <PluginPageShell
      title={available ? page.definition.title : phase === "starting" ? "" : "插件页面不可用"}
    >
      {!available && phase === "starting" ? (
        PLUGIN_STARTING
      ) : available && !cleanParams ? (
        <p role="alert">页面参数无效，请返回后重新打开。</p>
      ) : available && Component && cleanParams ? (
        <ErrorBoundary key={page.generation}>
          <Component context={page.context} params={cleanParams} pageContext={pageContext} />
        </ErrorBoundary>
      ) : (
        <p className="text-ink-2 py-6 text-[14px]">插件已停用或无法加载，请返回插件中心查看。</p>
      )}
    </PluginPageShell>
  );
}

export function PluginSettingsView() {
  const runtime = useMobilePlugins();
  const { phase } = useMobilePluginStatus();
  const { params, navigator } = usePage<{ id: string }>();
  const registered = runtime?.settings.get(params.id);
  const setting = registered?.definition.target === "asr" ? undefined : registered;
  const Component = setting?.definition.component;
  return (
    <PluginPageShell title={setting?.definition.title ?? "插件设置"}>
      {setting && Component && runtime?.active(setting.context) ? (
        <ErrorBoundary>
          {setting.definition.target === "tts" ? (
            <Button onClick={() => navigator.push("settingsModule", { module: "voice" })}>
              打开语音配置
            </Button>
          ) : (
            <Component context={setting.context} />
          )}
        </ErrorBoundary>
      ) : phase === "starting" ? (
        PLUGIN_STARTING
      ) : (
        <p className="text-ink-2 py-6 text-[14px]">启用插件并生效后可查看设置。</p>
      )}
    </PluginPageShell>
  );
}
