import { useCallback, useMemo, useRef, useEffect, type ReactNode } from "react";
import { normalizePageParams } from "@tau/plugins/host";
import type { PluginPageContext } from "@tau/plugins";
import { Button, ErrorBoundary, PortalScope, UiHostProvider, UiProvider } from "@tau/ui";
import { usePage } from "../../router";
import { usePageInstanceContext, usePageGuard } from "../../router/pageLifecycle";
import { useMobilePlugins } from "../../app/plugins/context";

export function PluginPageShell({ title, children }: { title: string; children: ReactNode }) {
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
    <div className="mobile-kb-screen bg-page fixed inset-0 flex flex-col px-4 pt-[var(--mobile-safe-top)]">
      <header className="flex items-center gap-3 py-3">
        <Button variant="ghost" onClick={() => void navigator.goBack("ui")}>
          返回
        </Button>
        <h1 className="text-ink-1 text-lg font-semibold">{title}</h1>
      </header>
      <div className="mobile-kb-scroll min-h-0 flex-1 overflow-auto pb-[var(--mobile-safe-bottom)]">
        <PortalScope>
          <UiHostProvider registerDismiss={registerDismiss}>
            <UiProvider className="contents">{children}</UiProvider>
          </UiHostProvider>
        </PortalScope>
      </div>
    </div>
  );
}

export function PluginPageView() {
  const runtime = useMobilePlugins();
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
    <PluginPageShell title={available ? page.definition.title : "插件页面不可用"}>
      {available && !cleanParams ? (
        <p role="alert">页面参数无效，请返回后重新打开。</p>
      ) : available && Component && cleanParams ? (
        <ErrorBoundary key={page.generation}>
          <Component context={page.context} params={cleanParams} pageContext={pageContext} />
        </ErrorBoundary>
      ) : (
        <p>插件已停用或无法加载，请返回插件管理。</p>
      )}
    </PluginPageShell>
  );
}

export function PluginSettingsView() {
  const runtime = useMobilePlugins();
  const { params } = usePage<{ id: string }>();
  const setting = runtime?.settings.get(params.id);
  const Component = setting?.definition.component;
  return (
    <PluginPageShell title={setting?.definition.title ?? "插件设置"}>
      {setting && Component && runtime?.active(setting.context) ? (
        <ErrorBoundary>
          <Component context={setting.context} />
        </ErrorBoundary>
      ) : (
        <p>启用插件并重新打开应用后可查看设置。</p>
      )}
    </PluginPageShell>
  );
}
