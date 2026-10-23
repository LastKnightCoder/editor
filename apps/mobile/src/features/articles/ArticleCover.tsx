// 文章封面：优先真实 banner_bg（与桌面端同源数据，含 banner_position 取景），
// 无封面时回退到固定渐变 + 白圆环装饰（如同真实配图，不随主题变化）。

import { BookOpen, Compass, Heart, ShieldCheck, Sun } from "lucide-react";
import type { ReactNode } from "react";
import LocalImage from "../../components/editor/LocalImage";
import type { ArticleListItem } from "../../types";

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #f3c9bb 0%, #e8a58e 48%, #d97757 100%)",
  "linear-gradient(135deg, #cfdff0 0%, #9db9d8 52%, #7d9fc4 100%)",
  "linear-gradient(135deg, #d3e2cf 0%, #a3c2a0 52%, #7f9f7c 100%)",
  "linear-gradient(135deg, #e2daf1 0%, #bfb0dc 52%, #9d8ac0 100%)",
  "linear-gradient(135deg, #f1e5bf 0%, #dcc684 52%, #bfa75a 100%)",
];

const COVER_ICONS = [Sun, Compass, BookOpen, Heart, ShieldCheck];

/** banner_position：top / center / bottom / 自定义百分比 → CSS object-position */
export function coverObjectPosition(position: string): string {
  const value = (position || "center").trim();
  if (value === "top") return "center 0%";
  if (value === "bottom") return "center 100%";
  if (value === "center") return "center";
  return `center ${value}`;
}

type ArticleCoverProps = {
  article: Pick<ArticleListItem, "id" | "bannerBg" | "bannerPosition">;
  /** feature=特写卡全宽封面 / thumb=列表小封面 / edit=编辑页封面条 / hero=详情页全宽沉浸封面 */
  variant?: "feature" | "thumb" | "edit" | "hero";
  className?: string;
  /** 覆盖在封面之上的内容（置顶徽标、更换封面按钮等） */
  children?: ReactNode;
};

export function ArticleCover({
  article,
  variant = "thumb",
  className = "",
  children,
}: ArticleCoverProps) {
  const hasImage = Boolean(article.bannerBg.trim());
  const gradient = COVER_GRADIENTS[Math.abs(article.id) % COVER_GRADIENTS.length];
  const Icon = COVER_ICONS[Math.abs(article.id) % COVER_ICONS.length];
  const sizeClass =
    variant === "thumb"
      ? "h-[76px] w-[76px] shrink-0 rounded-[18px]"
      : variant === "edit"
        ? "h-[96px] w-full rounded-[18px]"
        : variant === "hero"
          ? "h-[190px] w-full"
          : "h-[148px] w-full";

  return (
    <div
      className={`relative overflow-hidden ${sizeClass} ${className}`}
      style={hasImage ? undefined : { background: gradient }}
    >
      {hasImage ? (
        <LocalImage
          url={article.bannerBg}
          alt=""
          thumbnail={variant === "thumb" || variant === "feature"}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: coverObjectPosition(article.bannerPosition) }}
        />
      ) : (
        <>
          <span
            className={`absolute rounded-full border-white/[.14] ${
              variant === "feature"
                ? "-bottom-[46px] -right-[34px] h-[120px] w-[120px] border-[22px]"
                : "-bottom-[24px] -right-[18px] h-16 w-16 border-[13px]"
            }`}
            aria-hidden
          />
          <span className="absolute inset-0 grid place-items-center text-white/85">
            <Icon size={variant === "feature" ? 22 : 20} strokeWidth={1.7} />
          </span>
        </>
      )}
      {children}
    </div>
  );
}

export default ArticleCover;
