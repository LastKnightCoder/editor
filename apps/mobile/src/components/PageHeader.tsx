// 二级页统一顶栏：ghost 图标按钮（无底无影，按压浮现墨团）+ 居中大标题。
// 任务/文章/项目/知识库/设置/关于等页面共用，避免各页样式分叉。

import { ChevronLeft } from "lucide-react";
import { createContext, useContext } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// 封面沉浸页（transparent 顶栏）标记：其内按钮图标随 --header-p 白/棕交叉过渡
const CoverHeaderContext = createContext(false);

type PageHeaderButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: ReactNode;
  /** surface=ghost 裸图标（默认，返回/更多）；brand=品牌实底（新建等主操作） */
  variant?: "surface" | "brand";
};

export function PageHeaderButton({
  icon,
  variant = "surface",
  className = "",
  style,
  ...rest
}: PageHeaderButtonProps) {
  const onCover = useContext(CoverHeaderContext);
  return (
    <button
      type="button"
      {...rest}
      className={`grid h-10 w-10 shrink-0 place-items-center transition active:scale-90 ${
        variant === "brand"
          ? "shadow-lift text-ink-inverse rounded-[13px]"
          : // ghost 裸图标统一 22px/stroke2.4：无卡片底撑托后需加大加粗，与 18px 粗黑标题平衡
            "text-ink-1 active:bg-press rounded-full [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:stroke-[2.4]"
      } ${className}`}
      style={variant === "brand" ? { background: "var(--tau-accent)", ...style } : style}
    >
      {onCover && variant === "surface" ? (
        <span className="cover-icon-fade">
          <span className="cover-icon-fade-white">{icon}</span>
          <span className="cover-icon-fade-ink" aria-hidden>
            {icon}
          </span>
        </span>
      ) : (
        icon
      )}
    </button>
  );
}

type PageHeaderProps = {
  title?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** 居中内容替换大标题（如详情页保存状态小字）；与 title 二选一，优先于 title */
  center?: ReactNode;
  /** 右侧操作按钮组，建议用 PageHeaderButton */
  actions?: ReactNode;
  /** 完全自定义内容区（如任务页搜索展开态）；传入后 title/actions/onBack 均不渲染 */
  children?: ReactNode;
  /** 透明悬浮：封面沉浸页顶栏浮于封面之上（无渐变底） */
  transparent?: boolean;
};

export function PageHeader(props: PageHeaderProps) {
  return (
    <CoverHeaderContext.Provider value={props.transparent ?? false}>
      <header
        className={`mobile-topbar flex items-center gap-1.5 px-3 ${
          // topbar-cover-fade：随滚动渐显实底（--header-p 由封面页写入，缺省 0 即纯透明）
          props.transparent
            ? "topbar-cover-fade absolute inset-x-0 top-0 z-30"
            : "topbar-immersive relative"
        }`}
      >
        {props.children ?? (
          <>
            {props.onBack ? (
              <PageHeaderButton
                icon={<ChevronLeft size={22} strokeWidth={2.4} />}
                aria-label={props.backLabel ?? "返回"}
                onClick={props.onBack}
              />
            ) : null}
            {props.center ? (
              <div className="absolute left-1/2 w-max max-w-[calc(100%-208px)] -translate-x-1/2 overflow-hidden px-1">
                {props.center}
              </div>
            ) : (
              // 标题绝对定位严格居中：flex 布局下左右按钮不对称会把 flex-1 标题挤偏；
              // 208px = 两侧各 2 个 40px 图标钮 + 内边距的安全预留，超出部分省略
              <h1 className="text-ink-1 absolute left-1/2 max-w-[calc(100%-208px)] -translate-x-1/2 truncate px-1 text-center text-[18px] font-extrabold">
                {props.title}
              </h1>
            )}
            <div className="ml-auto flex shrink-0 justify-end gap-2">{props.actions}</div>
          </>
        )}
      </header>
    </CoverHeaderContext.Provider>
  );
}

export default PageHeader;
