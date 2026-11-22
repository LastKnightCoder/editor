import { useLayoutEffect, useMemo } from "react";
import type { PluginPageParams, PluginPagePlacement } from "@tau/plugins";
import { normalizePageParams } from "@tau/plugins/host";
import { registerPluginDockGuard, PLUGIN_DOCK_ID } from "@/app/pluginDock";
import { useShellStore } from "@/app/shellStore";
import { Button, Panel, UiProvider, UiHostProvider, PortalScope } from "@tau/ui";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { useDesktopPlugins } from "@/app/plugins/context";
import {
  PLUGIN_PAGE_KEY,
  PLUGIN_WORKBENCH_KEY,
  type RegisteredPluginPage,
} from "@/app/plugins/runtime";
import { createPluginPageContext } from "@/services/plugin-page-context";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import { PluginComponentScope } from "@/app/plugins/content-components";

export function PluginPageView() {
  const runtime = useDesktopPlugins();
  const { navigator } = usePage();
  const params = usePageParams<{
    pluginId: string;
    pageId: string;
    instanceId: string;
    params: string;
  }>();
  const page = runtime?.getPage(params.pluginId, params.pageId);
  usePageBreadcrumb(PLUGIN_PAGE_KEY, page?.definition.title ?? "插件页面不可用");
  if (!page)
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Panel>
          <h1 className="text-tau-title text-ink-1">插件页面暂不可用</h1>
          <p className="text-tau-body text-ink-2 my-3">
            插件可能已停用。重新启用后，可以恢复访问此页面。
          </p>
          <div className="flex gap-2">
            <Button disabled={!navigator.canBack()} onClick={() => navigator.back()}>
              返回上一页
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigator.push(import.meta.env.DEV ? PLUGIN_WORKBENCH_KEY : "home")}
            >
              {import.meta.env.DEV ? "打开插件开发台" : "回到今日"}
            </Button>
          </div>
        </Panel>
      </div>
    );
  return <PluginPageSurface page={page} route={params} placement="page" />;
}

interface SurfaceProps {
  page: RegisteredPluginPage;
  route: Readonly<Record<string, unknown>>;
  placement: PluginPagePlacement;
  dockParams?: Readonly<PluginPageParams>;
}

export function PluginPageSurface(props: SurfaceProps) {
  const { page, route } = props;
  const { registerOverlayDismiss } = usePage();
  return (
    <RecoverableBoundary
      key={page.mountId}
      resetKeys={[route.params]}
      fallback={({ error, reset }) => (
        <ErrorState
          error={error}
          title="插件页面渲染失败"
          description="可以重试此页面，或停用后重新启用插件。"
          actions={[{ label: "重试", onClick: reset }]}
        />
      )}
    >
      <PortalScope>
        <UiHostProvider registerDismiss={registerOverlayDismiss}>
          <UiProvider className="contents">
            <PluginComponentScope context={page.context}>
              <PluginPageContent {...props} />
            </PluginComponentScope>
          </UiProvider>
        </UiHostProvider>
      </PortalScope>
    </RecoverableBoundary>
  );
}

function PluginPageContent({ page, route, placement, dockParams }: SurfaceProps) {
  const runtime = useDesktopPlugins();
  const { registerOverlayDismiss, registerLeaveGuard } = usePage();
  const scope = useMemo(
    () =>
      createPluginPageContext({
        params: route,
        placement,
        signal: page.context.signal,
        isAvailable: () => {
          if (runtime?.getPage(page.context.pluginId, page.definition.id) !== page) return false;
          if (placement === "page") return true;
          const { assistView, pluginDock } = useShellStore.getState();
          return (
            assistView === PLUGIN_DOCK_ID &&
            pluginDock?.mountId === page.mountId &&
            pluginDock.instanceId === route.instanceId
          );
        },
        registerOverlayDismiss,
        registerLeaveGuard: placement === "dock" ? registerPluginDockGuard : registerLeaveGuard,
      }),
    [page, runtime, route, placement, registerOverlayDismiss, registerLeaveGuard]
  );
  useLayoutEffect(() => scope.mount(), [scope]);
  const Component = page.definition.component;
  const clean =
    dockParams ?? Object.freeze(normalizePageParams(JSON.parse(route.params as string)));
  return (
    <Component
      placement={placement}
      context={page.context}
      params={clean}
      pageContext={scope.pageContext}
    />
  );
}
