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
    <div
      className={`flex h-full flex-col ${themeColors.glassPanelBg} backdrop-blur-xl`}
    >
      <div className="px-5 pt-4 pb-3">
        <span
          className={`text-[15px] font-bold tracking-tight ${themeColors.textClass}`}
        >
          信息流
        </span>
        <div
          className={`mt-2.5 h-[2px] w-8 rounded-full ${themeColors.gradientClass}`}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <SmartGroups selection={selection} onSelect={onSelect} />
        <div
          className={`mx-4 my-2 h-px opacity-40 ${themeColors.divideClass}`}
        />
        <SubscriptionTree selection={selection} onSelect={onSelect} />
      </div>

      <SidebarFooter onAddClick={onAddClick} />
    </div>
  );
}
