import { ListTree, SquareDashed } from "lucide-react";
import type { ActionSheetItem } from "../../../components/ActionSheet";

/** 编辑页「⋯」菜单的「选择块」项：进入块选择（选中 0 个，再点块选择） */
export function blockSelectionMenuItem(onEnter: () => void): ActionSheetItem {
  return {
    label: "选择块",
    icon: <SquareDashed size={18} />,
    tone: "sky",
    onClick: onEnter,
  };
}

/** 编辑页「⋯」菜单的「整理结构」项：打开大纲重排 Sheet */
export function outlineMenuItem(onOpen: () => void): ActionSheetItem {
  return {
    label: "整理结构",
    icon: <ListTree size={18} />,
    tone: "sky",
    onClick: onOpen,
  };
}
