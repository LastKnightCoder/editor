/**
 * 插件首页面板（PS-046 2.8b）：宿主画面板外框与标题（含「⋯」），插件组件只渲染正文；
 * 正文为空时整块不显示（HomePanels 按 [data-home-panel-body]:empty 隐藏外层）。
 * 渲染出错只影响这一块，可重试。
 */

import { Button, EmptyNote, Panel, PanelTitle, UiProvider } from "@tau/ui";
import { RecoverableBoundary } from "@/components/ErrorState";
import { PluginComponentScope } from "@/app/plugins/content-components";
import type { RegisteredPluginHomePanel } from "@/app/plugins/runtime";
import type { HomePanelDefinition } from "../layout";
import { HomePanelMenu } from "./HomePanels";

function PluginHomePanel({ panel }: { panel: RegisteredPluginHomePanel }) {
  const Component = panel.definition.component;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle className="mb-2.5">
        <span className="min-w-0 truncate">{panel.definition.title}</span>
        <HomePanelMenu />
      </PanelTitle>
      <RecoverableBoundary
        key={panel.mountId}
        fallback={({ error, reset }) => (
          <div className="flex items-center gap-3">
            <EmptyNote className="min-w-0 flex-1">
              面板出错了：{error instanceof Error ? error.message : String(error)}
            </EmptyNote>
            <Button size="sm" variant="ghost" onClick={reset}>
              重试
            </Button>
          </div>
        )}
      >
        <UiProvider className="contents">
          <PluginComponentScope context={panel.context}>
            {/* 标记放在 UiProvider 里面：它自己会渲染一层 div */}
            <div data-home-panel-body className="min-w-0">
              <Component context={panel.context} />
            </div>
          </PluginComponentScope>
        </UiProvider>
      </RecoverableBoundary>
    </Panel>
  );
}

// 同一次注册复用同一个包装组件，首页重渲染时插件面板不会重新挂载
const definitions = new WeakMap<RegisteredPluginHomePanel, HomePanelDefinition>();

export function pluginHomePanel(panel: RegisteredPluginHomePanel): HomePanelDefinition {
  let definition = definitions.get(panel);
  if (!definition) {
    const component = () => <PluginHomePanel panel={panel} />;
    component.displayName = `PluginHomePanel(${panel.id})`;
    definition = {
      id: panel.id,
      title: panel.definition.title,
      size: panel.definition.size,
      component,
    };
    definitions.set(panel, definition);
  }
  return definition;
}
