/**
 * 插件对象动作在宿主菜单里的条目（PS-046 2.9a）：卡片、文章、项目文档的「⋯」菜单把
 * 插件动作排在内置项之后、删除之前。只在主窗口有插件运行时；独立编辑窗口没有，自然不列。
 */

import type { ReactNode } from "react";
import { Plug } from "lucide-react";
import { Menu } from "@tau/ui";
import type { PluginActionTarget } from "@tau/plugins";
import { appNotify } from "@/features/notifications/notify";
import { useDesktopPlugins } from "./context";
import type { RegisteredPluginAction } from "./runtime";

export function usePluginActions(target: PluginActionTarget | null): {
  actions: RegisteredPluginAction[];
  run(action: RegisteredPluginAction): void;
} {
  const runtime = useDesktopPlugins();
  const actions = target && runtime ? runtime.listActions(target.kind) : [];
  const run = (action: RegisteredPluginAction) => {
    if (!runtime || !target) return;
    void runtime.runAction(action, target).catch(error =>
      appNotify({
        title: "插件操作失败",
        body: error instanceof Error ? error.message : String(error),
        tone: "danger",
      })
    );
  };
  return { actions, run };
}

export function pluginActionIcon(action: RegisteredPluginAction): ReactNode {
  const Icon = action.definition.icon ?? Plug;
  return (
    <Icon className="size-[15px] shrink-0" size="15px" strokeWidth={1.75} aria-hidden="true" />
  );
}

/** 前面自带分隔线；没有可用的动作时什么也不渲染 */
export function PluginActionMenuItems({ target }: { target: PluginActionTarget | null }) {
  const { actions, run } = usePluginActions(target);
  if (!actions.length) return null;
  return (
    <>
      <Menu.Separator />
      {actions.map(action => (
        <Menu.Item key={action.id} icon={pluginActionIcon(action)} onSelect={() => run(action)}>
          {action.definition.title}
        </Menu.Item>
      ))}
    </>
  );
}
