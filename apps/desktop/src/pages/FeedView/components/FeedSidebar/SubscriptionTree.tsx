import { useState } from "react";
import { FolderOutlined } from "@ant-design/icons";
import useRssStore from "@/stores/useRssStore";
import useThemeColors from "@/hooks/useThemeColors";
import type { SidebarSelection } from "../../types";

interface SubscriptionTreeProps {
  selection: SidebarSelection;
  onSelect: (sel: SidebarSelection) => void;
}

export default function SubscriptionTree({
  selection,
  onSelect,
}: SubscriptionTreeProps) {
  const themeColors = useThemeColors();
  const feeds = useRssStore((s) => s.feeds);
  const subscriptions = useRssStore((s) => s.subscriptions);
  const unreadCounts = useRssStore((s) => s.unreadCounts);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  const grouped: Record<string, typeof subscriptions> = {};
  for (const sub of subscriptions) {
    const cat = sub.category || "";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(sub);
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (subscriptions.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1">
      {Object.entries(grouped).map(([category, subs]) => (
        <div key={category || "__uncategorized"}>
          {category && (
            <button
              className={`flex items-center gap-1.5 w-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide border-none cursor-pointer bg-transparent ${themeColors.secondaryTextClass} ${themeColors.hoverClass} rounded`}
              onClick={() => toggleCategory(category)}
            >
              <FolderOutlined className="text-[10px]" />
              <span className="flex-1 text-left truncate">{category}</span>
              <svg
                className={`w-3 h-3 transition-transform duration-150 ${collapsedCategories.has(category) ? "-rotate-90" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {!collapsedCategories.has(category) &&
            subs.map((sub) => {
              const feed = feeds.find((f) => f.id === sub.feedId);
              const unread = unreadCounts[sub.feedId] || 0;
              const isActive =
                selection.kind === "subscription" &&
                selection.subscriptionId === sub.id;

              return (
                <button
                  key={sub.id}
                  className={`flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-[13px] border-none cursor-pointer transition-colors duration-150 text-left ${category ? "pl-6" : ""} ${
                    isActive
                      ? themeColors.activeClass
                      : `bg-transparent ${themeColors.hoverClass}`
                  }`}
                  onClick={() =>
                    onSelect({
                      kind: "subscription",
                      subscriptionId: sub.id,
                      feedId: sub.feedId,
                    })
                  }
                >
                  <span className="flex-1 truncate">
                    {sub.title || feed?.title || "未命名"}
                  </span>
                  {unread > 0 && (
                    <span
                      className={`text-[11px] min-w-[18px] text-center rounded-full px-1.5 py-px ${themeColors.tagBgClass} ${themeColors.tagTextClass}`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
