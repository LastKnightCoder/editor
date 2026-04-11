import { memo, useState } from "react";
import classNames from "classnames";
import {
  SidebarItem,
  ArticleListItem,
  CardListItem,
  CardTagTree,
} from "@blog/types";
import { joinPath, formatDate } from "@blog/utils";

const categoryLabels: Record<string, string> = {
  temporary: "闪念",
  permanent: "永久",
  theme: "主题",
  literature: "文献",
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
          data-doc-sidebar-active={isActive ? "true" : undefined}
          className={classNames(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-150",
            {
              "bg-[var(--color-primary-subtle)] text-[var(--color-text-primary)] font-medium":
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
            <a
              href={joinPath(basePath, item.href)}
              className="flex-1 text-inherit hover:text-inherit"
            >
              {item.title}
            </a>
          ) : (
            <span className="flex-1 font-medium">{item.title}</span>
          )}

          {hasChildren && (
            <svg
              className={classNames(
                "h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-150",
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
              "overflow-hidden transition-all duration-150",
              collapsed ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100",
            )}
          >
            <div className="mt-0.5">
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
      <aside className="w-full shrink-0">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <span className="h-4 w-0.5 rounded-full bg-[var(--color-text-primary)]" />
          <span className="min-w-0 flex-1 break-words">{title}</span>
        </h3>
        <nav className="space-y-0.5 pr-2">
          {items.map((item, index) => (
            <DocSidebarItem
              key={item.href || index}
              item={item}
              basePath={basePath}
              currentPath={currentPath}
            />
          ))}
        </nav>
      </aside>
    );
  },
);

DocSidebar.displayName = "DocSidebar";

// ==================== 文章列表侧边栏 ====================
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
      <aside className="w-full shrink-0">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <span className="h-4 w-0.5 rounded-full bg-[var(--color-text-primary)]" />
          <span className="min-w-0 flex-1 break-words">{title}</span>
        </h3>
        <nav className="space-y-1">
          {articles.map((article) => (
            <a
              key={article.id}
              href={joinPath(basePath, article.href)}
              className={classNames(
                "block rounded-lg px-3 py-2.5 transition-all duration-150",
                currentId === article.id
                  ? "bg-[var(--color-primary-subtle)] border-l-2 border-[var(--color-text-primary)]"
                  : "hover:bg-[var(--color-bg-canvas)]",
              )}
            >
              <div
                className={classNames("line-clamp-2 text-sm leading-relaxed", {
                  "text-[var(--color-text-primary)] font-medium":
                    currentId === article.id,
                  "text-[var(--color-text-secondary)]":
                    currentId !== article.id,
                })}
              >
                {article.title}
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {formatDate(article.createTime)}
              </div>
            </a>
          ))}
        </nav>
      </aside>
    );
  },
);

ArticleSidebar.displayName = "ArticleSidebar";

// ==================== 卡片列表侧边栏 ====================
interface CardSidebarProps {
  cards: CardListItem[];
  basePath: string;
  currentId?: number;
  title?: string;
}

export const CardSidebar = memo(
  ({ cards, basePath, currentId, title = "全部卡片" }: CardSidebarProps) => {
    return (
      <aside className="w-full shrink-0">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <span className="h-4 w-0.5 rounded-full bg-[var(--color-text-primary)]" />
          <span className="min-w-0 flex-1 break-words">{title}</span>
        </h3>
        <nav className="space-y-1">
          {cards.map((card) => (
            <a
              key={card.id}
              href={joinPath(basePath, card.href)}
              className={classNames(
                "block rounded-lg px-3 py-2.5 transition-all duration-150",
                currentId === card.id
                  ? "bg-[var(--color-primary-subtle)]"
                  : "hover:bg-[var(--color-bg-canvas)]",
              )}
            >
              <div className="mb-1 text-xs text-[var(--color-text-tertiary)]">
                {categoryLabels[card.category] || card.category}
              </div>
              <div
                className={classNames("line-clamp-2 text-sm leading-relaxed", {
                  "text-[var(--color-text-primary)] font-medium":
                    currentId === card.id,
                  "text-[var(--color-text-secondary)]": currentId !== card.id,
                })}
              >
                {card.summary}
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                {formatDate(card.createTime)}
              </div>
            </a>
          ))}
        </nav>
      </aside>
    );
  },
);

CardSidebar.displayName = "CardSidebar";

// ==================== 卡片标签面板 ====================
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
    const href = tagHint
      ? `${joinPath(basePath, card.href)}?tagHint=${encodeURIComponent(tagHint)}`
      : joinPath(basePath, card.href);

    return (
      <a
        href={href}
        className={classNames(
          "block rounded-lg px-3 py-2 text-sm transition-all duration-150",
          isActive
            ? "bg-[var(--color-primary-subtle)] text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)]",
        )}
      >
        <span className="line-clamp-2">{card.summary}</span>
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
            "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-150",
            isActive
              ? "bg-[var(--color-primary-subtle)] text-[var(--color-text-primary)] font-medium"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]",
          )}
          onClick={() => canExpand && setOpen(!open)}
        >
          <span className="truncate">{item.tag}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {item.count}
            </span>
            {canExpand && (
              <svg
                className={classNames(
                  "h-3.5 w-3.5 text-[var(--color-text-tertiary)] transition-transform duration-150",
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
            "overflow-hidden transition-all duration-150",
            open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="ml-3 mt-0.5 border-l border-[var(--color-border-ring)] pl-2">
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
    const sortedTagTree = [...tagTree].sort((a, b) => b.count - a.count);

    return (
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <span className="h-4 w-0.5 rounded-full bg-[var(--color-text-primary)]" />
          {title}
        </h3>
        <nav className="space-y-0.5">
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

interface CardTagFilterPanelProps {
  tagTree: CardTagTree[];
  basePath: string;
  activeTag?: string;
  title?: string;
  allLabel?: string;
  onSelectTag?: (tag: string) => void;
}

function buildCardTagFilterHref(basePath: string, tag?: string): string {
  const listHref = joinPath(basePath, "/cards");

  if (!tag) {
    return listHref;
  }

  const [pathname, search = ""] = listHref.split("?");
  const params = new URLSearchParams(search);
  params.set("tag", tag);
  const query = params.toString();

  return `${pathname}${query ? `?${query}` : ""}`;
}

interface CardTagFilterItemProps {
  item: CardTagTree;
  basePath: string;
  activeTag: string;
  parentTag?: string;
  level?: number;
  onSelectTag?: (tag: string) => void;
}

const CardTagFilterItem = memo(
  ({
    item,
    basePath,
    activeTag,
    parentTag = "",
    level = 0,
    onSelectTag,
  }: CardTagFilterItemProps) => {
    const fullTag = parentTag ? `${parentTag}/${item.tag}` : item.tag;
    const hasChildren = item.children.length > 0;
    const isActiveBranch =
      activeTag === fullTag || activeTag.startsWith(`${fullTag}/`);
    const [open, setOpen] = useState(() => level === 0 || isActiveBranch);

    return (
      <div className="w-full">
        <div
          className={classNames(
            "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
            isActiveBranch
              ? "bg-[var(--color-primary-subtle)]"
              : "hover:bg-[var(--color-bg-canvas)]",
          )}
        >
          <a
            href={buildCardTagFilterHref(basePath, fullTag)}
            onClick={(event) => {
              if (!onSelectTag) {
                return;
              }
              event.preventDefault();
              onSelectTag(fullTag);
            }}
            className={classNames(
              "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-1 text-sm transition-colors",
              activeTag === fullTag
                ? "text-[var(--color-text-primary)] font-medium"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            <span className="truncate">{item.tag}</span>
            <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-tertiary)]">
              {item.count}
            </span>
          </a>

          {hasChildren && (
            <button
              type="button"
              aria-label={`${open ? "收起" : "展开"} ${fullTag}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-container)] hover:text-[var(--color-text-primary)]"
              onClick={() => setOpen((prev) => !prev)}
            >
              <svg
                className={classNames(
                  "h-3.5 w-3.5 transition-transform duration-150",
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
            </button>
          )}
        </div>

        {hasChildren && open && (
          <div className="mt-1 space-y-1 border-l border-[var(--color-border-ring)] pl-3">
            {item.children.map((child) => (
              <CardTagFilterItem
                key={child.tag}
                item={child}
                basePath={basePath}
                activeTag={activeTag}
                parentTag={fullTag}
                level={level + 1}
                onSelectTag={onSelectTag}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);

CardTagFilterItem.displayName = "CardTagFilterItem";

export const CardTagFilterPanel = memo(
  ({
    tagTree,
    basePath,
    activeTag = "",
    title = "标签树",
    allLabel = "全部卡片",
    onSelectTag,
  }: CardTagFilterPanelProps) => {
    const sortedTagTree = [...tagTree].sort((a, b) => b.count - a.count);

    return (
      <aside className="w-full shrink-0">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <span className="h-4 w-0.5 rounded-full bg-[var(--color-text-primary)]" />
          <span className="min-w-0 flex-1 break-words">{title}</span>
        </h3>

        <nav className="space-y-1 pr-2">
          <a
            href={buildCardTagFilterHref(basePath)}
            onClick={(event) => {
              if (!onSelectTag) {
                return;
              }
              event.preventDefault();
              onSelectTag("");
            }}
            className={classNames(
              "flex items-center justify-between rounded-lg px-4 py-2.5 text-sm transition-colors",
              activeTag
                ? "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]"
                : "bg-[var(--color-primary-subtle)] text-[var(--color-text-primary)] font-medium",
            )}
          >
            <span>{allLabel}</span>
          </a>

          {sortedTagTree.map((item) => (
            <CardTagFilterItem
              key={item.tag}
              item={item}
              basePath={basePath}
              activeTag={activeTag}
              onSelectTag={onSelectTag}
            />
          ))}
        </nav>
      </aside>
    );
  },
);

CardTagFilterPanel.displayName = "CardTagFilterPanel";

// ==================== 通用 Sidebar ====================
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
