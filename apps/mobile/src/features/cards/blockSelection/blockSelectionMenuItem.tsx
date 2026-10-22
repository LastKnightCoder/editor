import { SquareDashed } from "lucide-react";
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
