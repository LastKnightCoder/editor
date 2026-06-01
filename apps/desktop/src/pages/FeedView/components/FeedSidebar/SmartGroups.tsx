import { useEffect } from "react";
import { motion } from "motion/react";
import {
  InboxOutlined,
  StarOutlined,
  ReadOutlined,
  BookOutlined,
} from "@ant-design/icons";
import useRssStore from "@/stores/useRssStore";
import useReadLaterStore from "@/stores/useReadLaterStore";
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
  const starredCount = useRssStore((s) => s.starredCount);
  const readLaterCount = useReadLaterStore((s) => s.totalCount);
  const loadReadLaterCount = useReadLaterStore((s) => s.loadCount);
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  useEffect(() => {
    loadReadLaterCount();
  }, []);

  const getCount = (group: string): number => {
    switch (group) {
      case "all":
        return totalUnread;
      case "unread":
        return totalUnread;
      case "starred":
        return starredCount;
      case "readlater":
        return readLaterCount;
      default:
        return 0;
    }
  };

  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      {GROUPS.map(({ group, label, icon: Icon }, index) => {
        const isActive =
          selection.kind === "smart" && selection.group === group;
        const count = getCount(group);

        return (
          <motion.button
            key={group}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: index * 0.05,
              duration: 0.25,
              ease: "easeOut",
            }}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] border-none cursor-pointer transition-all duration-200 w-full text-left ${
              isActive
                ? `${themeColors.activeClass} shadow-sm`
                : `bg-transparent hover:translate-x-0.5 ${themeColors.hoverClass}`
            }`}
            onClick={() => onSelect({ kind: "smart", group })}
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 text-sm ${
                isActive
                  ? `${themeColors.iconBgClass} ${themeColors.activeTextClass}`
                  : themeColors.iconBgClass
              }`}
            >
              <Icon />
            </div>
            <span className="flex-1 font-medium">{label}</span>
            {count > 0 && (
              <span
                className={`text-[11px] min-w-[20px] text-center rounded-full px-2 py-0.5 font-medium shadow-sm ${themeColors.badgeBgClass} ${themeColors.badgeTextClass}`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
