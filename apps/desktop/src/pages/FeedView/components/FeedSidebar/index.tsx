import useThemeColors from "@/hooks/useThemeColors";
import type { SidebarSelection } from "../../types";
import SmartGroups from "./SmartGroups";
import SubscriptionTree from "./SubscriptionTree";
import SidebarFooter from "./SidebarFooter";

interface FeedSidebarProps {
  selection: SidebarSelection;
  onSelect: (sel: SidebarSelection) => void;
  onAddClick: () => void;
}

export default function FeedSidebar({
  selection,
  onSelect,
  onAddClick,
}: FeedSidebarProps) {
  const themeColors = useThemeColors();

  return (
    <div className="flex h-full flex-col">
      <div
        className={`flex items-center px-4 py-2.5 border-b ${themeColors.borderClass}`}
      >
        <span className="text-sm font-semibold">信息流</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SmartGroups selection={selection} onSelect={onSelect} />
        <div className={`mx-3 my-1 h-px ${themeColors.divideClass}`} />
        <SubscriptionTree selection={selection} onSelect={onSelect} />
      </div>

      <SidebarFooter onAddClick={onAddClick} />
    </div>
  );
}
