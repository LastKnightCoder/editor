/**
 * 文章条目的悬停操作：置顶星 + ⋯ 菜单（演示 / 导出 Markdown / 换封面 / 窗口打开 / 删除）。
 * 网格卡（封面右上角浮起的实底小方块）与列表行（行尾平铺）共用，差异只在容器与按钮样式。
 */

import type { LucideIcon } from "lucide-react";
import { Download, ImagePlus, MonitorUp, MoreHorizontal, Play, Star, Trash2 } from "lucide-react";
import { IconButton, Menu, cn } from "@tau/ui";
import type { ArticlePageItem } from "@/types";

export interface ArticleItemActions {
  onOpen(article: ArticlePageItem): void;
  onToggleTop(article: ArticlePageItem): void;
  onDelete(article: ArticlePageItem): void;
  onPresent(article: ArticlePageItem): void;
  onExportMarkdown(article: ArticlePageItem): void;
  onChangeCover(article: ArticlePageItem): void;
  /** Electron 专属能力：未传则不渲染该菜单项（Web 端不显示入口） */
  onOpenWindow?(article: ArticlePageItem): void;
}

/* Menu.Item 的 icon 槽统一 15px lucide 线性图标 */
function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

export function ArticleItemOps({
  article,
  actions,
  className,
  buttonClassName,
}: {
  article: ArticlePageItem;
  actions: ArticleItemActions;
  /** 容器定位与显隐（宿主须带 group） */
  className?: string;
  buttonClassName?: string;
}) {
  const button = cn("size-[23px] rounded-[7px]", buttonClassName);
  return (
    <div
      className={cn(
        "flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100",
        className
      )}
      onClick={e => e.stopPropagation()}
    >
      <IconButton
        title={article.isTop ? "取消置顶" : "置顶"}
        onClick={() => actions.onToggleTop(article)}
        className={button}
      >
        <Star
          className={cn("size-[13px]", article.isTop && "fill-accent text-accent")}
          strokeWidth={1.75}
        />
      </IconButton>
      <Menu
        align="end"
        trigger={
          <IconButton title="更多操作" className={button}>
            <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
        }
      >
        <Menu.Item onSelect={() => actions.onPresent(article)} icon={<MenuIcon icon={Play} />}>
          演示模式
        </Menu.Item>
        <Menu.Item
          onSelect={() => actions.onExportMarkdown(article)}
          icon={<MenuIcon icon={Download} />}
        >
          导出 Markdown
        </Menu.Item>
        <Menu.Item
          onSelect={() => actions.onChangeCover(article)}
          icon={<MenuIcon icon={ImagePlus} />}
        >
          换封面
        </Menu.Item>
        {actions.onOpenWindow && (
          <Menu.Item
            onSelect={() => actions.onOpenWindow?.(article)}
            icon={<MenuIcon icon={MonitorUp} />}
          >
            窗口打开
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          danger
          onSelect={() => actions.onDelete(article)}
          icon={<MenuIcon icon={Trash2} />}
        >
          删除文章
        </Menu.Item>
      </Menu>
    </div>
  );
}
