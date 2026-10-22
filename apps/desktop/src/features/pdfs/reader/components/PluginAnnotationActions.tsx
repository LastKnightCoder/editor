/**
 * PDF 标注上的插件对象动作（目标为材料 pdf-annotation:<id>）：工具条与左侧标注列表各自给触发器样式。
 */

import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@tau/ui";
import { PluginActionsMenu } from "@/app/plugins/action-menu";
import { TOOLBAR_ICON_BUTTON } from "./FloatToolbar";

const target = (recordId: number) => ({
  kind: "material" as const,
  id: `pdf-annotation:${recordId}`,
});

/** 浮动工具条里的「⋯」 */
export function ToolbarPluginActions({ recordId }: { recordId: number | undefined }) {
  if (recordId === undefined) return null;
  return (
    <PluginActionsMenu
      target={target(recordId)}
      trigger={
        <button
          type="button"
          title="更多操作"
          aria-label="更多操作"
          className={TOOLBAR_ICON_BUTTON}
        >
          <MoreHorizontal size={15} strokeWidth={1.75} />
        </button>
      }
    />
  );
}

/** 左侧标注列表悬停时的「⋯」 */
export function ListPluginActions({ recordId }: { recordId: number }) {
  return (
    <PluginActionsMenu
      target={target(recordId)}
      trigger={
        <IconButton
          title="更多操作"
          aria-label="更多操作"
          className="bg-surface shadow-lift size-[24px] rounded-[7px]"
        >
          <MoreHorizontal className="size-[12px]" strokeWidth={1.75} />
        </IconButton>
      }
    />
  );
}
