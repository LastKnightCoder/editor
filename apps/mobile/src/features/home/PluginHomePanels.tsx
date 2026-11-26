import { useMobileHomeI18n } from "./i18n";
// 今天页的插件卡片：宿主画外框、标题与标题行右侧的入口，插件组件只渲染正文。
// compact 按宽度排（手机两个一行，宽屏每格至少 300），wide 与落单的 compact 占满一行；
// 正文返回 null 时整块不显示，渲染出错只影响这一块。

import { Activity, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { ErrorBoundary, UiHostProvider, UiProvider, cn } from "@tau/ui";
import { useMobilePlugins } from "../../app/plugins/context";
import { PluginPageComponentScope } from "../../app/plugins/component-page-scope";
import type { MobilePluginHomePanel } from "../../app/plugins/runtime";
import { toast } from "../../components/toast";
import { usePage } from "../../router";
import { usePageInstanceContext } from "../../router/pageLifecycle";
import { PageResourceScope } from "../../router/PageResourceScope";

function runAction(run: () => unknown) {
  const report = (error: unknown) =>
    toast({ type: "error", text: error instanceof Error ? error.message : String(error) });
  try {
    void Promise.resolve(run()).catch(report);
  } catch (error) {
    report(error);
  }
}

function PanelCard({
  panel,
  fullRow,
  registerDismiss,
}: {
  panel: MobilePluginHomePanel;
  fullRow: boolean;
  registerDismiss: (dismiss: () => void) => { dispose(): void };
}) {
  const { t } = useMobileHomeI18n();
  const { component: Component, action, title } = panel.definition;
  return (
    <section
      aria-label={title}
      data-home-panel={panel.id}
      onClick={action ? () => runAction(action.run) : undefined}
      className={cn(
        "bg-surface shadow-card flex min-w-0 flex-col rounded-[18px] px-3 pt-2.5 pb-2.5",
        // 正文为空（组件返回 null）时整块收起，不留空卡
        "has-[[data-home-panel-body]:empty]:hidden",
        action && "cursor-pointer",
        // flex 换行：落单的 compact 自动撑满一行，与 wide 同宽
        fullRow ? "basis-full" : "min-w-0 flex-[1_1_calc(50%-5px)] @min-[640px]:basis-[300px]"
      )}
    >
      <header className="text-ink-2 flex h-6 items-center gap-1 text-[12.5px] font-semibold">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {action ? (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              runAction(action.run);
            }}
            className="text-ink-3 active:text-ink-1 -mr-1 flex h-6 max-w-[60%] items-center gap-0.5 rounded-lg px-1 text-[12px] font-medium"
          >
            <span className="truncate">{action.title}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <ErrorBoundary
        key={panel.mountId}
        fallback={<p className="text-ink-3 py-2 text-[12.5px]">{t("plugin.error")}</p>}
      >
        <UiProvider className="contents">
          <PluginPageComponentScope context={panel.context}>
            <div data-home-panel-body className="flex min-w-0 flex-1 flex-col">
              <Component context={panel.context} registerDismiss={registerDismiss} />
            </div>
          </PluginPageComponentScope>
        </UiProvider>
      </ErrorBoundary>
    </section>
  );
}

/** 首页插件浮层的系统返回先关闭浮层。 */
function useHomeDismiss() {
  const { navigator, entryId } = usePage();
  const { phase } = usePageInstanceContext();
  return useCallback(
    (dismiss: () => void) => {
      if (phase !== "active") return () => undefined;
      return navigator.registerBackHandler(
        entryId,
        () => {
          dismiss();
          return true;
        },
        { blockEdgeBack: true }
      );
    },
    [navigator, entryId, phase]
  );
}

export function PluginHomePanels() {
  const runtime = useMobilePlugins();
  const { phase } = usePageInstanceContext();
  const registerBack = useHomeDismiss();
  const registerDismiss = useCallback(
    (dismiss: () => void) => ({ dispose: registerBack(dismiss) }),
    [registerBack]
  );
  const panels = [...(runtime?.homePanels.values() ?? [])].filter(panel =>
    runtime?.active(panel.context)
  );
  if (!panels.length) return null;
  return (
    // 浮层挂到全局容器以覆盖底部导航；首页退到后台时连同卡片一起隐藏并保留状态。
    <PageResourceScope visible={phase === "active"}>
      <Activity mode={phase === "active" ? "visible" : "hidden"}>
        <UiHostProvider registerDismiss={registerBack}>
          <div className="@container mt-3 flex flex-wrap gap-2.5 px-4">
            {panels.map(panel => (
              <PanelCard
                key={panel.id}
                panel={panel}
                fullRow={panel.definition.size === "wide"}
                registerDismiss={registerDismiss}
              />
            ))}
          </div>
        </UiHostProvider>
      </Activity>
    </PageResourceScope>
  );
}
