/**
 * 标题栏面包屑里的元素树开关（同项目详情的文档树开关）：钉在面包屑最前，
 * 收起 / 展开只换提示，不随停靠栏移动。状态全局记住（useWhiteboardOutlineStore）。
 */

import { PanelLeft } from "lucide-react";
import { IconButton, Tooltip } from "@tau/ui";
import { useWhiteboardOutlineStore } from "@/components/WhiteBoard/components/Sidebar/outlineStore";

export function OutlineToggle() {
  const open = useWhiteboardOutlineStore(s => s.open);
  const toggle = useWhiteboardOutlineStore(s => s.toggle);
  const label = open ? "收起元素树" : "展开元素树";
  return (
    <Tooltip content={label} placement="bottom">
      <IconButton className="shrink-0" onClick={toggle} aria-label={label} aria-expanded={open}>
        <PanelLeft size={17} strokeWidth={1.75} />
      </IconButton>
    </Tooltip>
  );
}
