/** 标题栏面包屑里的素材架开关：紧挨元素树开关，状态全局记住（useWhiteboardShelfStore）。 */

import { LibraryBig } from "lucide-react";
import { IconButton, Tooltip } from "@tau/ui";
import { useWhiteboardShelfStore } from "@/features/shared/whiteboard/shelfStore";

export function ShelfToggle() {
  const open = useWhiteboardShelfStore(s => s.open);
  const toggle = useWhiteboardShelfStore(s => s.toggle);
  const label = open ? "收起素材架" : "展开素材架";
  return (
    <Tooltip content={label} placement="bottom">
      <IconButton className="shrink-0" onClick={toggle} aria-label={label} aria-pressed={open}>
        <LibraryBig size={17} strokeWidth={1.75} />
      </IconButton>
    </Tooltip>
  );
}
