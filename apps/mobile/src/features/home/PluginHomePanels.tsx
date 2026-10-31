// 今天页的插件卡片：宿主画外框、标题与标题行右侧的入口，插件组件只渲染正文。
// compact 两个一行，wide 占整行；正文返回 null 时整块不显示，渲染出错只影响这一块。

import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { ErrorBoundary, PortalScope, UiHostProvider, UiProvider, cn } from "@tau/ui";
import { useMobilePlugins } from "../../app/plugins/context";
import { PluginPageComponentScope } from "../../app/plugins/component-page-scope";
import type { MobilePluginHomePanel } from "../../app/plugins/runtime";
import { toast } from "../../components/toast";
import { usePage } from "../../router";
import { usePageInstanceContext } from "../../router/pageLifecycle";

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
  const { component: Component, action, title } = panel.definition;
  return (
    <section
      aria-label={title}
      data-home-panel={panel.id}
      className={cn(
        "bg-surface shadow-card flex min-w-0 flex-col rounded-[18px] px-3 pt-2.5 pb-2.5",
        // 正文为空（组件返回 null）时整块收起，不留空卡
        "has-[[data-home-panel-body]:empty]:hidden",
        fullRow && "col-span-2"
      )}
    >
      <header className="text-ink-2 flex h-6 items-center gap-1 text-[12.5px] font-semibold">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {action ? (
          <button
            type="button"
            onClick={() => runAction(action.run)}
            className="text-ink-3 active:text-ink-1 -mr-1 flex h-6 max-w-[60%] items-center gap-0.5 rounded-lg px-1 text-[12px] font-medium"
          >
            <span className="truncate">{action.title}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <ErrorBoundary
        key={panel.mountId}
        fallback={<p className="text-ink-3 py-2 text-[12.5px]">卡片出错了</p>}
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

/** 插件浮层（底部面板等）挂在今天页里，系统返回先关浮层 */
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
  const registerBack = useHomeDismiss();
  const registerDismiss = useCallback(
    (dismiss: () => void) => ({ dispose: registerBack(dismiss) }),
    [registerBack]
  );
  const panels = [...(runtime?.homePanels.values() ?? [])].filter(panel =>
    runtime?.active(panel.context)
  );
  if (!panels.length) return null;
  // compact 两个一行；wide 与紧接 wide 之前落单的 compact 占满一行
  let column = 0;
  const layout = panels.map((panel, index) => {
    const wide = panel.definition.size === "wide";
    const next = panels[index + 1];
    const alone = !wide && column === 0 && (!next || next.definition.size === "wide");
    column = wide || alone ? 0 : (column + 1) % 2;
    return { panel, fullRow: wide || alone };
  });
  return (
    <PortalScope>
      <UiHostProvider registerDismiss={registerBack}>
        <div className="mt-3 grid grid-cols-2 gap-2.5 px-4">
          {layout.map(({ panel, fullRow }) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              fullRow={fullRow}
              registerDismiss={registerDismiss}
            />
          ))}
        </div>
      </UiHostProvider>
    </PortalScope>
  );
}
