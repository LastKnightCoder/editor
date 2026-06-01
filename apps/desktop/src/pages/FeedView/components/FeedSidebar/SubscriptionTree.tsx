import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FolderOutlined } from "@ant-design/icons";
import { App } from "antd";
import useRssStore from "@/stores/useRssStore";
import useThemeColors from "@/hooks/useThemeColors";
import type { SidebarSelection } from "../../types";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  subscriptionId: number;
}

interface SubscriptionTreeProps {
  selection: SidebarSelection;
  onSelect: (sel: SidebarSelection) => void;
}

export default function SubscriptionTree({
  selection,
  onSelect,
}: SubscriptionTreeProps) {
  const themeColors = useThemeColors();
  const { modal } = App.useApp();
  const feeds = useRssStore((s) => s.feeds);
  const subscriptions = useRssStore((s) => s.subscriptions);
  const unreadCounts = useRssStore((s) => s.unreadCounts);
  const unsubscribe = useRssStore((s) => s.unsubscribe);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu, closeMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, subscriptionId: number) => {
      e.preventDefault();
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        subscriptionId,
      });
    },
    [],
  );

  const handleUnsubscribe = useCallback(async () => {
    if (!contextMenu) return;
    const sub = subscriptions.find((s) => s.id === contextMenu.subscriptionId);
    const feed = sub ? feeds.find((f) => f.id === sub.feedId) : null;
    const name = sub?.title || feed?.title || "此订阅";
    closeMenu();

    modal.confirm({
      title: "取消订阅",
      content: `确定要取消订阅「${name}」吗？相关文章数据也会被删除。`,
      okText: "取消订阅",
      okButtonProps: { danger: true },
      cancelText: "保留",
      onOk: async () => {
        await unsubscribe(contextMenu.subscriptionId);
      },
    });
  }, [contextMenu, subscriptions, feeds, unsubscribe, closeMenu, modal]);

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
      {Object.entries(grouped).map(([category, subs]) => {
        const isCategoryExpanded = !collapsedCategories.has(category);

        return (
          <div key={category || "__uncategorized"}>
            {category && (
              <button
                className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-none cursor-pointer bg-transparent ${themeColors.secondaryTextClass} ${themeColors.hoverClass} rounded-lg transition-all duration-200`}
                onClick={() => toggleCategory(category)}
              >
                <div
                  className={`w-0.5 h-3 rounded-full transition-all duration-200 ${
                    isCategoryExpanded
                      ? themeColors.gradientClass
                      : "bg-transparent"
                  }`}
                />
                <FolderOutlined className="text-[10px]" />
                <span className="flex-1 text-left truncate">{category}</span>
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${collapsedCategories.has(category) ? "-rotate-90" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
            {isCategoryExpanded &&
              subs.map((sub) => {
                const feed = feeds.find((f) => f.id === sub.feedId);
                const unread = unreadCounts[sub.feedId] || 0;
                const isActive =
                  selection.kind === "subscription" &&
                  selection.subscriptionId === sub.id;
                const displayName = getDisplayName(
                  sub.title,
                  feed?.title,
                  feed?.url,
                );
                const initial = displayName.charAt(0).toUpperCase();

                return (
                  <button
                    key={sub.id}
                    className={`group flex items-center gap-2.5 w-full rounded-xl px-2.5 py-2 text-[13px] border-none cursor-pointer transition-all duration-200 text-left ${category ? "pl-5" : ""} ${
                      isActive
                        ? `${themeColors.activeClass} shadow-sm`
                        : `bg-transparent hover:translate-x-0.5 ${themeColors.hoverClass}`
                    }`}
                    onClick={() =>
                      onSelect({
                        kind: "subscription",
                        subscriptionId: sub.id,
                        feedId: sub.feedId,
                      })
                    }
                    onContextMenu={(e) => handleContextMenu(e, sub.id)}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${themeColors.tagBgClass} ${themeColors.tagTextClass}`}
                    >
                      {initial}
                    </div>
                    <span className="flex-1 truncate">{displayName}</span>
                    {unread > 0 && (
                      <span
                        className={`text-[11px] min-w-[20px] text-center rounded-full px-2 py-0.5 font-medium shadow-sm ${themeColors.badgeBgClass} ${themeColors.badgeTextClass}`}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        );
      })}

      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[140px] rounded-xl border py-1.5 shadow-lg border-gray-200 dark:border-slate-700 bg-white dark:bg-zinc-900/95 backdrop-blur-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-xs border-none cursor-pointer bg-transparent text-red-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors duration-150"
              onClick={handleUnsubscribe}
            >
              取消订阅
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function getDisplayName(
  subTitle: string | null,
  feedTitle: string | undefined,
  feedUrl: string | undefined,
): string {
  if (subTitle && !looksLikeUrl(subTitle)) return subTitle;
  if (feedTitle && !looksLikeUrl(feedTitle)) return feedTitle;
  if (subTitle) return prettifyUrl(subTitle);
  if (feedTitle) return prettifyUrl(feedTitle);
  if (feedUrl) return prettifyUrl(feedUrl);
  return "未命名";
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function prettifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return url;
  }
}
