import { PanelLeft } from "lucide-react";
import { IconButton, Tooltip } from "@tau/ui";
import { useWhiteboardDockStore } from "@/features/shared/whiteboard/dockStore";

export function OutlineToggle() {
  const open = useWhiteboardDockStore(s => s.panel === "outline");
  const toggle = useWhiteboardDockStore(s => s.toggle);
  const label = open ? "收起元素树" : "展开元素树";
  return (
    <Tooltip content={label} placement="bottom">
      <IconButton
        className="shrink-0"
        onClick={() => toggle("outline")}
        aria-label={label}
        aria-expanded={open}
      >
        <PanelLeft size={17} strokeWidth={1.75} />
      </IconButton>
    </Tooltip>
  );
}
