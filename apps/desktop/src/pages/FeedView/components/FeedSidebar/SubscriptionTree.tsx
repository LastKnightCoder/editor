import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  InboxOutlined,
  PlusOutlined,
  BellOutlined,
} from "@ant-design/icons";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  BILIBILI_DEFAULT_CATEGORY,
  BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL,
} from "@/commands/rss";
import EditTitleModal from "@/components/EditTitleModal";
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
  const { message, modal } = App.useApp();
  const feeds = useRssStore((s) => s.feeds);
  const subscriptions = useRssStore((s) => s.subscriptions);
  const categories = useRssStore((s) => s.categories);
  const unreadCounts = useRssStore((s) => s.unreadCounts);
  const unsubscribe = useRssStore((s) => s.unsubscribe);
  const subscribeBilibiliFollowings = useRssStore(
    (s) => s.subscribeBilibiliFollowings,
  );
  const updateSubscription = useRssStore((s) => s.updateSubscription);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [categoryDialogSubscriptionId, setCategoryDialogSubscriptionId] =
    useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const handleUnsubscribe = useCallback(
    async (subscriptionId: number, name: string) => {
      modal.confirm({
        title: "取消订阅",
        content: `确定要取消订阅「${name}」吗？相关文章数据也会被删除。`,
        okText: "取消订阅",
        okButtonProps: { danger: true },
        cancelText: "保留",
        onOk: async () => {
          await unsubscribe(subscriptionId);
        },
      });
    },
    [unsubscribe, modal],
  );

  const handleMoveToCategory = useCallback(
    async (subscriptionId: number, category: string) => {
      await updateSubscription(subscriptionId, { category });
    },
    [updateSubscription],
  );

  const handleOpenRename = useCallback(
    (subscriptionId: number, title: string) => {
      setEditingSubscription({ id: subscriptionId, title });
    },
    [],
  );

  const handleRenameSubscription = useCallback(
    async ({ title }: { title: string }) => {
      if (!editingSubscription) return;

      try {
        await updateSubscription(editingSubscription.id, { title });
        setEditingSubscription(null);
        message.success("订阅名称已更新");
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "订阅名称更新失败",
        );
      }
    },
    [editingSubscription, message, updateSubscription],
  );

  const handleCreateCategory = useCallback((subscriptionId: number) => {
    setCategoryDialogSubscriptionId(subscriptionId);
    setNewCategoryName("");
    setCategoryError(null);
  }, []);

  const closeCategoryDialog = useCallback(() => {
    if (categorySubmitting) return;
    setCategoryDialogSubscriptionId(null);
    setNewCategoryName("");
    setCategoryError(null);
  }, [categorySubmitting]);

  const submitNewCategory = useCallback(async () => {
    if (categoryDialogSubscriptionId === null) return;

    const category = newCategoryName.trim();
    if (!category) {
      setCategoryError("请输入分类名称");
      return;
    }

    setCategorySubmitting(true);
    setCategoryError(null);
    try {
      await updateSubscription(categoryDialogSubscriptionId, { category });
      setCategoryDialogSubscriptionId(null);
      setNewCategoryName("");
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "分类更新失败");
    } finally {
      setCategorySubmitting(false);
    }
  }, [categoryDialogSubscriptionId, newCategoryName, updateSubscription]);

  const handleCategoryInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        submitNewCategory();
      }
      if (event.key === "Escape") {
        closeCategoryDialog();
      }
    },
    [closeCategoryDialog, submitNewCategory],
  );

  const buildSubscriptionMenuItems = useCallback(
    (subscriptionId: number, currentCategory: string, displayName: string) => {
      const categoryItems: NonNullable<MenuProps["items"]> = [];

      if (currentCategory) {
        categoryItems.push({
          key: "uncategorized",
          label: "移至未分类",
          icon: <InboxOutlined />,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            handleMoveToCategory(subscriptionId, "");
          },
        });
      }

      categories
        .filter((category) => category && category !== currentCategory)
        .forEach((category) => {
          categoryItems.push({
            key: `category-${category}`,
            label: category,
            icon: <FolderOutlined />,
            onClick: ({ domEvent }) => {
              domEvent.stopPropagation();
              handleMoveToCategory(subscriptionId, category);
            },
          });
        });

      return [
        {
          key: "rename",
          label: "重命名",
          icon: <EditOutlined />,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            handleOpenRename(subscriptionId, displayName);
          },
        },
        { type: "divider" as const },
        {
          key: "category",
          label: "调整分类",
          icon: <FolderOutlined />,
          children: categoryItems,
        },
        {
          key: "new-category",
          label: "新建分类...",
          icon: <PlusOutlined />,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            handleCreateCategory(subscriptionId);
          },
        },
        { type: "divider" as const },
        {
          key: "unsubscribe",
          label: "取消订阅",
          icon: <DeleteOutlined />,
          danger: true,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            handleUnsubscribe(subscriptionId, displayName);
          },
        },
      ] satisfies MenuProps["items"];
    },
    [
      categories,
      handleCreateCategory,
      handleMoveToCategory,
      handleOpenRename,
      handleUnsubscribe,
    ],
  );

  const grouped: Record<string, typeof subscriptions> = {};
  for (const sub of subscriptions) {
    const cat = sub.category || "";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(sub);
  }
  if (!grouped[BILIBILI_DEFAULT_CATEGORY]) {
    grouped[BILIBILI_DEFAULT_CATEGORY] = [];
  }

  const bilibiliFollowingsFeed = feeds.find(
    (feed) => feed.url === BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL,
  );
  const bilibiliFollowingsSubscription = bilibiliFollowingsFeed
    ? subscriptions.find((sub) => sub.feedId === bilibiliFollowingsFeed.id) ||
      null
    : null;
  const bilibiliFollowingsUnread = bilibiliFollowingsFeed
    ? unreadCounts[bilibiliFollowingsFeed.id] || 0
    : 0;
  const bilibiliFollowingsDisplayName = bilibiliFollowingsSubscription
    ? getBilibiliFollowingsDisplayName(
        bilibiliFollowingsSubscription.title,
        bilibiliFollowingsFeed?.title,
      )
    : "我订阅的动态";

  const handleSubscribeBilibiliFollowings = useCallback(async () => {
    try {
      await subscribeBilibiliFollowings(BILIBILI_DEFAULT_CATEGORY);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "订阅失败");
    }
  }, [message, subscribeBilibiliFollowings]);

  const bilibiliFollowingsMenuItems: MenuProps["items"] =
    bilibiliFollowingsSubscription
      ? [
          {
            key: "rename",
            label: "重命名",
            icon: <EditOutlined />,
            onClick: ({ domEvent }) => {
              domEvent.stopPropagation();
              handleOpenRename(
                bilibiliFollowingsSubscription.id,
                bilibiliFollowingsDisplayName,
              );
            },
          },
          {
            type: "divider",
          },
          {
            key: "unsubscribe",
            label: "取消订阅",
            icon: <DeleteOutlined />,
            danger: true,
            onClick: ({ domEvent }) => {
              domEvent.stopPropagation();
              handleUnsubscribe(
                bilibiliFollowingsSubscription.id,
                bilibiliFollowingsDisplayName,
              );
            },
          },
        ]
      : [
          {
            key: "subscribe",
            label: "订阅",
            icon: <BellOutlined />,
            onClick: ({ domEvent }) => {
              domEvent.stopPropagation();
              void handleSubscribeBilibiliFollowings();
            },
          },
        ];

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <>
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
              {isCategoryExpanded && [
                category === BILIBILI_DEFAULT_CATEGORY && (
                  <Dropdown
                    key="bilibili-followings"
                    menu={{ items: bilibiliFollowingsMenuItems }}
                    trigger={["contextMenu"]}
                  >
                    <button
                      className={`group flex items-center gap-2.5 w-full rounded-xl px-2.5 py-2 text-[13px] border-none cursor-pointer transition-all duration-200 text-left pl-5 ${
                        selection.kind === "bilibili-followings"
                          ? `${themeColors.activeClass} shadow-sm`
                          : `bg-transparent hover:translate-x-0.5 ${themeColors.hoverClass}`
                      }`}
                      onClick={() => onSelect({ kind: "bilibili-followings" })}
                      onContextMenu={(event) => event.stopPropagation()}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${themeColors.tagBgClass} ${themeColors.tagTextClass}`}
                      >
                        B
                      </div>
                      <span className="flex-1 truncate">
                        {bilibiliFollowingsDisplayName}
                      </span>
                      {bilibiliFollowingsUnread > 0 && (
                        <span
                          className={`text-[11px] min-w-[20px] text-center rounded-full px-2 py-0.5 font-medium shadow-sm ${themeColors.badgeBgClass} ${themeColors.badgeTextClass}`}
                        >
                          {bilibiliFollowingsUnread > 99
                            ? "99+"
                            : bilibiliFollowingsUnread}
                        </span>
                      )}
                    </button>
                  </Dropdown>
                ),
                ...subs
                  .filter(
                    (sub) =>
                      !(
                        bilibiliFollowingsFeed &&
                        sub.feedId === bilibiliFollowingsFeed.id
                      ),
                  )
                  .map((sub) => {
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
                      <Dropdown
                        key={sub.id}
                        menu={{
                          items: buildSubscriptionMenuItems(
                            sub.id,
                            sub.category || "",
                            displayName,
                          ),
                        }}
                        trigger={["contextMenu"]}
                      >
                        <button
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
                          onContextMenu={(event) => event.stopPropagation()}
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
                      </Dropdown>
                    );
                  }),
              ]}
            </div>
          );
        })}
      </div>
      <EditTitleModal
        open={!!editingSubscription}
        onCancel={() => setEditingSubscription(null)}
        onConfirm={handleRenameSubscription}
        initialTitle={editingSubscription?.title || ""}
        modalTitle="修改订阅名称"
        modalDescription="设置这个订阅在信息流中的显示名称"
        placeholder="请输入订阅名称"
      />
      {createPortal(
        <AnimatePresence>
          {categoryDialogSubscriptionId !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={closeCategoryDialog}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-full max-w-[420px] m-4 flex flex-col"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden">
                  <div className="flex items-start gap-3 mb-5 shrink-0">
                    <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-orange-50 dark:bg-orange-500/20 border border-orange-200 dark:border-orange-500/30">
                      <svg
                        className="w-5 h-5 text-orange-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="M12 11v4" />
                        <path d="M10 13h4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                        新建分类
                      </h2>
                      <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                        创建分类并把当前订阅移动过去
                      </p>
                    </div>
                    <button
                      onClick={closeCategoryDialog}
                      className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                        分类名称
                      </label>
                      <input
                        autoFocus
                        type="text"
                        placeholder="输入分类名称"
                        value={newCategoryName}
                        onChange={(event) => {
                          setNewCategoryName(event.target.value);
                          if (categoryError) setCategoryError(null);
                        }}
                        onKeyDown={handleCategoryInputKeyDown}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-orange-500 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(249,115,22,0.25)]"
                      />
                    </div>

                    {categoryError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400"
                      >
                        {categoryError}
                      </motion.div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200 dark:border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={closeCategoryDialog}
                      disabled={categorySubmitting}
                      className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={submitNewCategory}
                      disabled={categorySubmitting}
                      className="px-5 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)] hover:bg-orange-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      {categorySubmitting ? "移动中..." : "移动到此分类"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
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

function getBilibiliFollowingsDisplayName(
  subTitle: string | null,
  feedTitle: string | undefined,
): string {
  const title = getDisplayName(subTitle, feedTitle, undefined);
  return title === "我的 Bilibili 关注动态" ? "我订阅的动态" : title;
}
