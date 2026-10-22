/**
 * 插件详情区块（PS-046 2.10）：卡片、文章、项目文档详情的正文上方（洞见报告之后）。
 * 插件组件只收到对象引用，读内容仍按现有权限；组件返回 null 时不占位，出错只影响这一块。
 * 只在主窗口有插件运行时；独立编辑窗口没有，自然不显示。
 */

import { Button, EmptyNote, UiProvider, cn } from "@tau/ui";
import type { PluginEntityPanelTarget } from "@tau/plugins";
import { RecoverableBoundary } from "@/components/ErrorState";
import { useDesktopPlugins } from "./context";
import { PluginComponentScope } from "./content-components";
import type { RegisteredPluginEntityPanel } from "./runtime";

function EntityPanel({
  panel,
  target,
  className,
}: {
  panel: RegisteredPluginEntityPanel;
  target: PluginEntityPanelTarget;
  className?: string;
}) {
  const Component = panel.definition.component;
  return (
    <RecoverableBoundary
      resetKeys={[target.kind, target.id]}
      fallback={({ error, reset }) => (
        <div className={cn("flex items-center gap-3", className)}>
          <EmptyNote className="mt-0 min-w-0 flex-1">
            插件区块出错了：{error instanceof Error ? error.message : String(error)}
          </EmptyNote>
          <Button size="sm" variant="ghost" onClick={reset}>
            重试
          </Button>
        </div>
      )}
    >
      <UiProvider className="contents">
        <PluginComponentScope context={panel.context}>
          {/* 标记放在 UiProvider 里面：它自己会渲染一层 div；正文为空时整块不占位 */}
          <div
            data-plugin-entity-panel={panel.id}
            className={cn("min-w-0 empty:hidden", className)}
          >
            <Component context={panel.context} target={target} />
          </div>
        </PluginComponentScope>
      </UiProvider>
    </RecoverableBoundary>
  );
}

/** className 给每块的外边距，按所在详情页与洞见报告的间距对齐 */
export function PluginEntityPanels({
  target,
  className,
}: {
  target: PluginEntityPanelTarget | null;
  className?: string;
}) {
  const runtime = useDesktopPlugins();
  if (!runtime || !target) return null;
  return runtime
    .listEntityPanels(target.kind)
    .map(panel => (
      <EntityPanel
        key={`${panel.id}:${panel.mountId}`}
        panel={panel}
        target={target}
        className={className}
      />
    ));
}
