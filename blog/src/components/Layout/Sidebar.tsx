import { memo, useState } from "react";
import classNames from "classnames";
import {
  SidebarItem,
  ArticleListItem,
  CardListItem,
  CardTagTree,
} from "@blog/types";
import { joinPath, formatDate } from "@blog/utils";

const categoryLabels = {
  temporary: "闪念",
  permanent: "永久",
  theme: "主题",
  literature: "文献",
};

const categoryColors = {
  temporary: "bg-amber-500",
  permanent: "bg-sky-500",
  theme: "bg-violet-500",
  literature: "bg-emerald-500",
};

// ==================== 文档模式侧边栏 ====================
interface DocSidebarItemProps {
  item: SidebarItem;
  basePath: string;
  currentPath?: string;
  level?: number;
}

const DocSidebarItem = memo(
  ({ item, basePath, currentPath, level = 0 }: DocSidebarItemProps) => {
    const [collapsed, setCollapsed] = useState(item.collapsed ?? false);
    const hasChildren = item.children && item.children.length > 0;
    const isActive = item.href && currentPath === item.href;

    return (
      <div className="w-full">
        <div
          className={classNames(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-200",
            {
              "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-medium":
                isActive,
              "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]":
                !isActive,
              "cursor-pointer": hasChildren || item.href,
            },
          )}
          style={{ paddingLeft: `${level * 12 + 12}px` }}
          onClick={() => hasChildren && setCollapsed(!collapsed)}
        >
          {item.href ? (
            <a href={joinPath(basePath, item.href)} className="flex-1">
              {item.title}
            </a>
          ) : (
            <span className="flex-1 font-medium">{item.title}</span>
          )}

          {hasChildren && (
            <svg
              className={classNames(
                "h-4 w-4 shrink-0 text-[var(--color-text-quaternary)] transition-transform duration-200",
                { "rotate-90": !collapsed },
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </div>

        {hasChildren && (
          <div
            className={classNames(
              "overflow-hidden transition-all duration-200",
              collapsed ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100",
            )}
          >
            <div className="mt-1">
              {item.children!.map((child, index) => (
                <DocSidebarItem
                  key={child.href || index}
                  item={child}
                  basePath={basePath}
                  currentPath={currentPath}
                  level={level + 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

DocSidebarItem.displayName = "DocSidebarItem";

interface DocSidebarProps {
  items: SidebarItem[];
  basePath: string;
  currentPath?: string;
  title?: string;
}

export const DocSidebar = memo(
  ({ items, basePath, currentPath, title = "文档导航" }: DocSidebarProps) => {
    return (
      <aside className="w-64 shrink-0 overflow-y-auto">
        <div className="sidebar-container">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
            {title}
          </h3>
          <nav className="space-y-0.5">
            {items.map((item, index) => (
              <DocSidebarItem
                key={item.href || index}
                item={item}
                basePath={basePath}
                currentPath={currentPath}
              />
            ))}
          </nav>
        </div>
      </aside>
    );
  },
);

DocSidebar.displayName = "DocSidebar";

// ==================== 博客模式侧边栏（文章列表） ====================
interface ArticleSidebarProps {
  articles: ArticleListItem[];
  basePath: string;
  currentId?: number;
  title?: string;
}

export const ArticleSidebar = memo(
  ({
    articles,
    basePath,
    currentId,
    title = "最新文章",
  }: ArticleSidebarProps) => {
    return (
      <aside className="w-64 shrink-0 overflow-y-auto">
        <div className="sidebar-container">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
            {title}
          </h3>
          <nav className="space-y-1">
            {articles.map((article) => (
              <a
                key={article.id}
                href={joinPath(basePath, article.href)}
                className={classNames(
                  "block rounded-lg px-3 py-2.5 transition-all duration-200",
                  {
                    "bg-[var(--color-primary-subtle)] border-l-2 border-[var(--color-primary)]":
                      currentId === article.id,
                    "hover:bg-[var(--color-bg-canvas)]":
                      currentId !== article.id,
                  },
                )}
              >
                <div
                  className={classNames(
                    "line-clamp-2 text-sm leading-relaxed",
                    {
                      "text-[var(--color-primary)] font-medium":
                        currentId === article.id,
                      "text-[var(--color-text-secondary)]":
                        currentId !== article.id,
                    },
                  )}
                >
                  {article.title}
                </div>
                <div className="mt-1.5 text-xs text-[var(--color-text-quaternary)]">
                  {formatDate(article.createTime)}
                </div>
              </a>
            ))}
          </nav>
        </div>
      </aside>
    );
  },
);

ArticleSidebar.displayName = "ArticleSidebar";

// ==================== 卡片模式侧边栏（卡片列表） ====================
interface CardSidebarProps {
  cards: CardListItem[];
  basePath: string;
  currentId?: number;
  title?: string;
}

export const CardSidebar = memo(
  ({ cards, basePath, currentId, title = "全部卡片" }: CardSidebarProps) => {
    return (
      <aside className="w-64 shrink-0 overflow-y-auto">
        <div className="sidebar-container">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
            {title}
          </h3>
          <nav className="space-y-2">
            {cards.map((card) => (
              <a
                key={card.id}
                href={joinPath(basePath, card.href)}
                className={classNames(
                  "block rounded-lg px-3 py-2.5 transition-all duration-200",
                  {
                    "bg-[var(--color-primary-subtle)] border border-[var(--color-primary)]/30":
                      currentId === card.id,
                    "hover:bg-[var(--color-bg-canvas)]": currentId !== card.id,
                  },
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`${categoryColors[card.category]} h-2 w-2 rounded-full`}
                    title={categoryLabels[card.category]}
                  />
                  <span className="text-xs text-[var(--color-text-quaternary)]">
                    {categoryLabels[card.category]}
                  </span>
                </div>
                <div
                  className={classNames(
                    "line-clamp-2 text-sm leading-relaxed",
                    {
                      "text-[var(--color-primary)] font-medium":
                        currentId === card.id,
                      "text-[var(--color-text-secondary)]":
                        currentId !== card.id,
                    },
                  )}
                >
                  {card.summary}
                </div>
                <div className="mt-1.5 text-xs text-[var(--color-text-quaternary)]">
                  {formatDate(card.createTime)}
                </div>
              </a>
            ))}
          </nav>
        </div>
      </aside>
    );
  },
);

CardSidebar.displayName = "CardSidebar";

// ==================== 卡片标签面板（用于标签筛选） ====================

// 标签下的卡片项
const TagCardItem = memo(
  ({
    card,
    basePath,
    isActive,
    tagHint,
  }: {
    card: CardListItem;
    basePath: string;
    isActive: boolean;
    tagHint?: string;
  }) => {
    // 构建带 tagHint 参数的链接
    const href = tagHint
      ? `${joinPath(basePath, card.href)}?tagHint=${encodeURIComponent(tagHint)}`
      : joinPath(basePath, card.href);

    return (
      <a
        href={href}
        className={classNames(
          "block rounded-lg px-3 py-2 text-sm transition-all duration-200",
          {
            "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]":
              isActive,
            "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)]":
              !isActive,
          },
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={`${categoryColors[card.category]} h-1.5 w-1.5 shrink-0 rounded-full`}
          />
          <span className="line-clamp-2">{card.summary}</span>
        </div>
      </a>
    );
  },
);

TagCardItem.displayName = "TagCardItem";

interface TagItemProps {
  item: CardTagTree;
  basePath: string;
  activeTag: string;
  activeCardId?: number;
  parentTag?: string;
}

const TagItem = memo(
  ({
    item,
    basePath,
    activeTag,
    activeCardId,
    parentTag = "",
  }: TagItemProps) => {
    const [open, setOpen] = useState(false);
    const fullTag = parentTag ? `${parentTag}/${item.tag}` : item.tag;
    const isActive =
      activeTag === fullTag || activeTag.startsWith(fullTag + "/");
    const hasChildren = item.children && item.children.length > 0;
    const hasCards = item.cards && item.cards.length > 0;
    const canExpand = hasChildren || hasCards;

    return (
      <div className="w-full">
        <div
          className={classNames(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-200 cursor-pointer",
            {
              "bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-medium":
                isActive,
              "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]":
                !isActive,
            },
          )}
          onClick={() => canExpand && setOpen(!open)}
        >
          <div className="flex flex-1 items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            <span className="truncate">{item.tag}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={classNames(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                isActive
                  ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)]"
                  : "bg-[var(--color-bg-canvas)] text-[var(--color-text-quaternary)]",
              )}
            >
              {item.count}
            </span>
            {canExpand && (
              <svg
                className={classNames(
                  "h-4 w-4 transition-transform duration-200 text-[var(--color-text-quaternary)]",
                  { "rotate-90": open },
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        </div>

        <div
          className={classNames(
            "overflow-hidden transition-all duration-200",
            open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="ml-4 mt-1 border-l-2 border-[var(--color-border-secondary)] pl-2">
            {/* 完全匹配该标签的卡片 */}
            {hasCards &&
              item.cards.map((card) => (
                <TagCardItem
                  key={card.id}
                  card={card}
                  basePath={basePath}
                  isActive={activeCardId === card.id}
                  tagHint={fullTag}
                />
              ))}

            {/* 子标签 */}
            {hasChildren &&
              item.children.map((child) => (
                <TagItem
                  key={child.tag}
                  item={child}
                  basePath={basePath}
                  activeTag={activeTag}
                  activeCardId={activeCardId}
                  parentTag={fullTag}
                />
              ))}
          </div>
        </div>
      </div>
    );
  },
);

TagItem.displayName = "TagItem";

interface CardTagPanelProps {
  tagTree: CardTagTree[];
  basePath: string;
  activeTag?: string;
  activeCardId?: number;
  title?: string;
}

export const CardTagPanel = memo(
  ({
    tagTree,
    basePath,
    activeTag = "",
    activeCardId,
    title = "标签",
  }: CardTagPanelProps) => {
    // 按数量排序
    const sortedTagTree = [...tagTree].sort((a, b) => b.count - a.count);

    return (
      <div className="sidebar-container">
        <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
          {title}
        </h3>
        <nav className="max-h-[70vh] space-y-0.5 overflow-y-auto">
          {sortedTagTree.map((item) => (
            <TagItem
              key={item.tag}
              item={item}
              basePath={basePath}
              activeTag={activeTag}
              activeCardId={activeCardId}
            />
          ))}
        </nav>
      </div>
    );
  },
);

CardTagPanel.displayName = "CardTagPanel";

// ==================== 通用 Sidebar（兼容旧接口） ====================
interface SidebarProps {
  items: SidebarItem[];
  basePath: string;
  currentPath?: string;
}

const Sidebar = memo(({ items, basePath, currentPath }: SidebarProps) => {
  return (
    <DocSidebar items={items} basePath={basePath} currentPath={currentPath} />
  );
});

Sidebar.displayName = "Sidebar";

export default Sidebar;
