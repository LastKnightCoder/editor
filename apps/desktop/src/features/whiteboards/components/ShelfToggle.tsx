import { LibraryBig } from "lucide-react";
import { IconButton, Tooltip } from "@tau/ui";
import { useWhiteboardDockStore } from "@/features/shared/whiteboard/dockStore";

export function ShelfToggle() {
  const open = useWhiteboardDockStore(s => s.panel === "shelf");
  const toggle = useWhiteboardDockStore(s => s.toggle);
  const label = open ? "收起素材架" : "展开素材架";
  return (
    <Tooltip content={label} placement="bottom">
      <IconButton
        className="shrink-0"
        onClick={() => toggle("shelf")}
        aria-label={label}
        aria-expanded={open}
      >
        <LibraryBig size={17} strokeWidth={1.75} />
      </IconButton>
    </Tooltip>
  );
}
