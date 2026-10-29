import { Plug } from "lucide-react";
import type { ActionSheetItem } from "../../components/ActionSheet";
import { toast } from "../../components/toast";
import { useMobilePlugins } from "./context";
import type { MobileActionTarget } from "./runtime";

export function useMobilePluginActionItems(
  target: (MobileActionTarget & { createTime: number }) | null
): ActionSheetItem[] {
  const runtime = useMobilePlugins();
  if (!runtime || !target) return [];
  const ref = { kind: target.kind, id: target.id };
  const identity = String(target.createTime);
  return runtime.listActions(target.kind).map(action => {
    const Icon = action.definition.icon ?? Plug;
    return {
      key: action.id,
      label: action.definition.title,
      desc: runtime.host.listPlugins().find(plugin => plugin.id === action.context.pluginId)?.name,
      icon: <Icon size={18} aria-hidden="true" />,
      tone: "lilac",
      onClick: () => {
        void runtime.runAction(action, ref, identity).catch(error => {
          if (!runtime.active(action.context)) return;
          toast({
            type: "warning",
            text: `插件操作失败：${error instanceof Error ? error.message : String(error)}`,
          });
        });
      },
    };
  });
}
