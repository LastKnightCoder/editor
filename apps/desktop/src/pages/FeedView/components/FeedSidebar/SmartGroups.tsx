import {
  InboxOutlined,
  StarOutlined,
  ReadOutlined,
  BookOutlined,
} from "@ant-design/icons";
import useRssStore from "@/stores/useRssStore";
import useThemeColors from "@/hooks/useThemeColors";
import type { SidebarSelection } from "../../types";

interface SmartGroupsProps {
  selection: SidebarSelection;
  onSelect: (sel: SidebarSelection) => void;
}

const GROUPS = [
  { group: "all" as const, label: "全部", icon: InboxOutlined },
  { group: "unread" as const, label: "未读", icon: ReadOutlined },
  { group: "starred" as const, label: "收藏", icon: StarOutlined },
  { group: "readlater" as const, label: "稍后读", icon: BookOutlined },
];

export default function SmartGroups({ selection, onSelect }: SmartGroupsProps) {
  const themeColors = useThemeColors();
  const unreadCounts = useRssStore((s) => s.unreadCounts);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-0.5 px-2 py-2">
      {GROUPS.map(({ group, label, icon: Icon }) => {
        const isActive =
          selection.kind === "smart" && selection.group === group;
        const count = group === "unread" ? totalUnread : 0;

        return (
          <button
            key={group}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] border-none cursor-pointer transition-colors duration-150 w-full text-left ${
              isActive
                ? themeColors.activeClass
                : `bg-transparent ${themeColors.hoverClass}`
            }`}
            onClick={() => onSelect({ kind: "smart", group })}
          >
            <Icon className="text-sm opacity-60" />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span
                className={`text-[11px] min-w-[18px] text-center rounded-full px-1.5 py-px ${themeColors.tagBgClass} ${themeColors.tagTextClass}`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
