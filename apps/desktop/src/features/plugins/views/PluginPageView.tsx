import { useLayoutEffect, useMemo } from "react";
import { normalizePageParams } from "@tau/plugins/host";
import { Button, Panel, UiProvider } from "@tau/ui";
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
  return (
    <RecoverableBoundary
      key={page.mountId}
      resetKeys={[params.params]}
      fallback={({ error, reset }) => (
        <ErrorState
          error={error}
          title="插件页面渲染失败"
          description="可以重试此页面，或停用后重新启用插件。"
          actions={[{ label: "重试", onClick: reset }]}
        />
      )}
    >
      <UiProvider className="contents">
        <PluginComponentScope context={page.context}>
          <PluginPageContent page={page} />
        </PluginComponentScope>
      </UiProvider>
    </RecoverableBoundary>
  );
}

function PluginPageContent({ page }: { page: RegisteredPluginPage }) {
  const runtime = useDesktopPlugins();
  const params = usePageParams();
  const { registerOverlayDismiss } = usePage();
  const scope = useMemo(
    () =>
      createPluginPageContext({
        params,
        signal: page.context.signal,
        isAvailable: () => runtime?.getPage(page.context.pluginId, page.definition.id) === page,
        registerOverlayDismiss,
      }),
    [page, runtime, params, registerOverlayDismiss]
  );
  useLayoutEffect(() => scope.mount(), [scope]);
  const Component = page.definition.component;
  const clean = Object.freeze(normalizePageParams(JSON.parse(params.params as string)));
  return <Component context={page.context} params={clean} pageContext={scope.pageContext} />;
}
