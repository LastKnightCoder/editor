/**
 * 文章卡片：月刊网格竖卡（封面在上 + 内容在下；featured 横卡形态经实机
 * 否决移除——大摘要也填不满横向空间，见 DECISIONS.md D-015 追记）。
 * 封面三态：bannerBg → 本地图；无 banner → id 派生色渐变叠首段文字（同篇同色、
 * 相邻错色，2026-09-19 裁决，mockups/articles/plan-a3-journal.html）；无摘录 →
 * 派生色纯色块。派生色板是设计定稿的数据色（与热力图色阶同性质），不进主题词表。
 */

import type { LucideIcon } from "lucide-react";
import { Download, ImagePlus, MonitorUp, MoreHorizontal, Play, Star, Trash2 } from "lucide-react";
import LocalImage from "@/components/LocalImage";
import { IconButton } from "@tau/ui/IconButton";
import { Menu } from "@tau/ui/Menu";
import { cn } from "@tau/ui/cn";
import { articleExcerpt } from "../queries";
import type { ArticlePageItem } from "@/types";

/** 封面派生色板：12 色粉彩渐变（出处 mockups/articles 2026-09-19 裁决，双主题共用） */
const COVER_GRADIENTS = [
  "linear-gradient(140deg, #e8c4a8, #d9885f)",
  "linear-gradient(140deg, #ccd8c2, #96ab8a)",
  "linear-gradient(140deg, #c8d2dd, #92a5b8)",
  "linear-gradient(140deg, #e2cf9f, #c0a05e)",
  "linear-gradient(140deg, #e5c9c4, #c98d84)",
  "linear-gradient(140deg, #cfc8ba, #a39682)",
  "linear-gradient(140deg, #eccaa2, #d89a5e)",
  "linear-gradient(140deg, #d3dcc6, #a3b58e)",
  "linear-gradient(140deg, #cfe0dc, #9dbbb4)",
  "linear-gradient(140deg, #ddd4e0, #b3a3c4)",
  "linear-gradient(140deg, #eed3c2, #dd9a86)",
  "linear-gradient(140deg, #ddd8a5, #b3a860)",
] as const;

/** 相邻 id 错开取色（×7 mod 12），同一篇永远同一色（详情页 hero 兜底同源复用） */
export const coverGradientOf = (id: number): string => COVER_GRADIENTS[(id * 7 + 3) % 12];

/** 文字封面的前景（粉彩底上的定稿对比色，出处同上） */
const TEXT_ON_COVER = "rgba(67,57,44,0.82)";
const QUOTE_ON_COVER = "rgba(255,248,239,0.6)";

/* Menu.Item 的 icon 槽统一 15px lucide 线性图标 */
function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

export interface ArticleCardProps {
  article: ArticlePageItem;
  onOpen(article: ArticlePageItem): void;
  onToggleTop(article: ArticlePageItem): void;
  onDelete(article: ArticlePageItem): void;
  onPresent(article: ArticlePageItem): void;
  onExportMarkdown(article: ArticlePageItem): void;
  onChangeCover(article: ArticlePageItem): void;
  /** Electron 专属能力：未传则不渲染该菜单项（Web 端不显示入口） */
  onOpenWindow?(article: ArticlePageItem): void;
}

/** 封面 hover 浮现的操作（浅底小号置顶按钮 + 更多菜单） */
function CoverOps(props: ArticleCardProps) {
  const { article } = props;
  return (
    <div
      className="absolute right-2 top-2 z-[1] flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      onClick={e => e.stopPropagation()}
    >
      <IconButton
        title={article.isTop ? "取消置顶" : "置顶"}
        onClick={() => props.onToggleTop(article)}
        className="shadow-card size-[23px] rounded-[7px] bg-[rgba(255,248,239,0.86)] enabled:hover:bg-[#fff8ef]"
      >
        <Star
          className={cn("size-[13px]", article.isTop && "fill-accent text-accent")}
          strokeWidth={1.75}
        />
      </IconButton>
      <Menu
        align="end"
        trigger={
          <IconButton
            title="更多操作"
            className="shadow-card size-[23px] rounded-[7px] bg-[rgba(255,248,239,0.86)] enabled:hover:bg-[#fff8ef]"
          >
            <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
        }
      >
        <Menu.Item onSelect={() => props.onPresent(article)} icon={<MenuIcon icon={Play} />}>
          演示模式
        </Menu.Item>
        <Menu.Item
          onSelect={() => props.onExportMarkdown(article)}
          icon={<MenuIcon icon={Download} />}
        >
          导出 Markdown
        </Menu.Item>
        <Menu.Item
          onSelect={() => props.onChangeCover(article)}
          icon={<MenuIcon icon={ImagePlus} />}
        >
          换封面
        </Menu.Item>
        {props.onOpenWindow && (
          <Menu.Item
            onSelect={() => props.onOpenWindow?.(article)}
            icon={<MenuIcon icon={MonitorUp} />}
          >
            窗口打开
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          danger
          onSelect={() => props.onDelete(article)}
          icon={<MenuIcon icon={Trash2} />}
        >
          删除文章
        </Menu.Item>
      </Menu>
    </div>
  );
}

export function ArticleCard(props: ArticleCardProps) {
  const { article } = props;
  const excerpt = articleExcerpt(article.excerpt);
  const gradient = coverGradientOf(article.id);

  return (
    <article
      tabIndex={0}
      onClick={() => props.onOpen(article)}
      className={cn(
        "bg-surface shadow-card ease-tau-out group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--tau-radius-md)]",
        // hover 无位移（D-013「反馈是光的」）：translateY 上浮会在卡片下缘
        // 制造 hover 进出循环（鼠标落边缘带反复触发）。反馈 = 阴影加深 + 1px
        // 描边亮起（阴影在深色主题下对比弱，描边双主题都醒目）
        "transition-[box-shadow,outline-color] duration-200",
        "outline-line-1 hover:shadow-float outline-0 -outline-offset-1 hover:outline-1"
      )}
    >
      {/* 封面 */}
      <div className="relative aspect-[13/8] w-full overflow-hidden">
        {article.bannerBg ? (
          <LocalImage
            url={article.bannerBg}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: article.bannerPosition === "top" ? "top" : "center" }}
          />
        ) : excerpt ? (
          <div
            className="absolute inset-0 flex items-end px-[15px] pb-[13px] pt-[26px]"
            style={{ backgroundImage: gradient }}
          >
            <span
              aria-hidden
              className="absolute left-[10px] top-[2px] font-serif text-[34px] font-bold leading-none"
              style={{ color: QUOTE_ON_COVER }}
            >
              “
            </span>
            <p
              className="line-clamp-3 text-[12.5px] leading-[1.7]"
              style={{ color: TEXT_ON_COVER }}
            >
              {excerpt}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0" style={{ backgroundImage: gradient }} />
        )}
        {article.isTop && (
          <span className="text-accent absolute left-2.5 top-2.5 grid size-[22px] place-items-center rounded-[8px] bg-[rgba(255,248,239,0.86)]">
            <Star className="fill-accent size-[13px]" strokeWidth={1.75} />
          </span>
        )}
        <CoverOps {...props} />
      </div>

      {/* 主体 */}
      <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-[11px] pt-3">
        <h3 className="text-ink-1 line-clamp-2 text-[14.5px] font-semibold leading-[1.45] tracking-[-0.005em]">
          {article.title || `文章 #${article.id}`}
        </h3>
        {excerpt && (
          <p className="text-ink-2 mt-[5px] line-clamp-2 text-[12.5px] leading-[1.65]">{excerpt}</p>
        )}
        {article.tags.length > 0 && (
          <div className="mt-[9px] flex flex-wrap gap-[5px]">
            {article.tags.map(tag => (
              <span
                key={tag}
                className="bg-group text-ink-2 whitespace-nowrap rounded-[5px] px-[7px] py-px text-[11px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-ink-3 mt-auto flex items-center gap-2 pt-[9px] text-[11px] tabular-nums">
          <span>{formatMonthDay(article.updateTime)}</span>
          <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
          <span>{formatWords(article.words)} 字</span>
        </p>
      </div>
    </article>
  );
}

/* ---------- 展示格式化 ---------- */

function formatMonthDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString("zh-CN");
}
