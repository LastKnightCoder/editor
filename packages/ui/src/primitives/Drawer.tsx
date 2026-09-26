/**
 * Drawer 基础件 —— 右侧抽屉，两种形态共用头部 / 正文 / 开合与内容保留：
 *
 * modal（默认）：距视口四边 8px 的浮起卡 + 淡遮罩（不 blur），portal 到 body 级容器。
 *   Skill / MCP 服务器 / 站点设置等「看完即走」的详情与配置。
 *   - 开合：遮罩淡入 + 卡片自右缘滑入（280ms），退场后卸载
 *   - Tab 圈闭 · 打开记录触发元素、卸载归还焦点 · 初始焦点落 [data-autofocus]（无则卡片）
 *   - 遮罩点击关闭 · 打开锁定底层滚动 · 内部 Select / Menu 继承卡片内的局部 Portal 容器
 *
 * modal={false}：就地渲染在最近的定位祖先里（默认 absolute 距上右下 12px），无遮罩、不抢焦点、
 *   不锁滚动——「边看边改」的伴随面板（待办详情、复习参考资料、白板关联笔记）。
 *   - 开合：以右缘为原点微缩 + 淡入（240ms），外框始终在容器内，不被纸的圆角裁掉
 *   - 焦点可能在抽屉外（用户回到列表 / 画布），Esc 需调用方另接页面浮层仲裁
 *     （桌面端 useOverlayDismiss）；焦点在抽屉内时由抽屉自己消费
 *
 * 共同：
 *  - 结构：头部（前导图标 · 标题 / 副标题 / 元信息三行 · 右侧操作区 + ×）→ 可选 toolbar →
 *    正文滚动区（FADE_SCROLL_CLASS + edge fade）→ 可选 footer。不传 title 即无头部，× 浮在
 *    右上角；fill 让正文不滚动、无内边距，内容自管布局（自带头部与滚动的复杂面板）
 *  - Esc 在抽屉 DOM 消费（stopPropagation）；内层 Select / Menu 先消费自己的 Esc
 *    （defaultPrevented 让位）；visible 渲染期派生，Activity 保活停驻时必然退到不可见不可点
 *  - isolateKeyboard：键盘事件在抽屉边界停止冒泡（冒泡阶段，内层编辑器照常收到），
 *    宿主在 document 上监听快捷键时（白板）用它防串键
 *  - onWidthChange：左缘出现拖拽调宽手柄，宽度受控、夹在 minWidth / maxWidth 之间
 *
 * 退场期间内容保留：抽屉多由「选中项 | null」驱动，关闭即 null 会让内容在滑出途中消失。
 * 调用方用 useRetainedValue(item) 拿到「最后一次非空值」渲染即可。
 *
 * 尺寸档：sm 440 / md 560（默认）/ lg 720，width 任意值覆盖；不超出视口（modal）/ 容器（非模态）。
 * 层级：modal z-[340]，与 Dialog 同层——后打开者在上；非模态 z-10，className 可覆盖。
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../cn";
import { PortalScope, usePortalContainer } from "../UiProvider";
import { useEdgeFade } from "../hooks/useEdgeFade";
import { FADE_SCROLL_CLASS } from "../hooks/fadeScrollClass";
import { lockBodyScroll } from "../hooks/lockBodyScroll";
import { IconButton } from "./IconButton";
import { trapTabKey } from "./focusTrap";

/** 开合时长（ms），卸载定时与之对齐 */
const DURATION = { modal: 280, inline: 240 } as const;

const SIZE_WIDTH = { sm: 440, md: 560, lg: 720 } as const;

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 退场完成且内容卸载后调用 */
  onAfterClose?: () => void;
  /** false = 非模态伴随面板（见文件头） */
  modal?: boolean;
  /** 标题：字符串或自定义节点（如标题 + 来源标签、可编辑标题）；不传则无头部，× 浮在右上角 */
  title?: ReactNode;
  /** 无障碍名；title 不是纯字符串（或没有 title）时必填 */
  label?: string;
  /** 前导视觉（图标 / 头像 / 勾选框），尺寸由调用方决定，与标题首行顶对齐 */
  icon?: ReactNode;
  /** 标题下第二行（meta 字号 ink-3）：字符串单行截断；节点由调用方决定截断 / 折行 */
  subtitle?: ReactNode;
  /** 第三行元信息（徽标 + 计数等，sm 字号横排） */
  meta?: ReactNode;
  /** 头部右侧操作区（× 之前）：主操作按钮、更多菜单、开关等 */
  actions?: ReactNode;
  /** 头部下方、正文之上的钉住条（分区 Segmented、筛选等），不随正文滚动 */
  toolbar?: ReactNode;
  /** 底部钉住区（hairline 分隔）：保存提示、应答按钮等 */
  footer?: ReactNode;
  /** 正文不滚动、无内边距，flex 列由内容自管（自带头部与滚动的复杂面板） */
  fill?: boolean;
  /** 键盘事件不冒泡出抽屉（宿主在 document 上监听快捷键时防串键） */
  isolateKeyboard?: boolean;
  size?: keyof typeof SIZE_WIDTH;
  /** 任意宽度（px）覆盖 size；配合 onWidthChange 即受控宽度 */
  width?: number;
  /** 传入即开启左缘拖拽调宽 */
  onWidthChange?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  /** × 的无障碍名（默认「关闭」） */
  closeLabel?: string;
  /** 正文滚动区附加类（改内边距、字号等） */
  bodyClassName?: string;
  /** 抽屉卡片附加类（非模态常用来改定位：top-0、z-50 等） */
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function Drawer({
  open,
  onOpenChange,
  onAfterClose,
  modal = true,
  title,
  label,
  icon,
  subtitle,
  meta,
  actions,
  toolbar,
  footer,
  fill = false,
  isolateKeyboard = false,
  size = "md",
  width,
  onWidthChange,
  minWidth = 280,
  maxWidth = 960,
  closeLabel = "关闭",
  bodyClassName,
  className,
  children,
  ref,
}: DrawerProps) {
  const portalContainer = usePortalContainer();
  const panelRef = useRef<HTMLElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);
  const wasMounted = useRef(false);
  const afterCloseRef = useRef(onAfterClose);
  afterCloseRef.current = onAfterClose;
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const titleId = useId();
  const duration = modal ? DURATION.modal : DURATION.inline;

  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(timer);
  }, [open, duration]);
  const entered = open && shown;

  // 模态打开：记录触发元素（关闭归还）+ 锁底层滚动
  useEffect(() => {
    if (!open || !modal) return;
    lastActiveRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return lockBodyScroll(portalContainer.ownerDocument);
  }, [open, modal]);

  // 模态挂载后落初始焦点（非模态不抢焦点：用户可能正在列表里用键盘移动）
  useEffect(() => {
    if (!mounted || !open || !modal) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* jsdom 部分元素无 focus */
    }
  }, [mounted, open, modal]);

  // 卸载瞬间归还焦点给触发元素
  useEffect(() => {
    if (mounted) {
      wasMounted.current = true;
      return;
    }
    lastActiveRef.current?.focus?.();
    lastActiveRef.current = null;
    if (wasMounted.current) {
      wasMounted.current = false;
      afterCloseRef.current?.();
    }
  }, [mounted]);

  useEdgeFade(fill ? null : bodyEl);

  const close = () => onOpenChange(false);

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (isolateKeyboard) e.stopPropagation();
    if (e.nativeEvent.isComposing || e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab" && modal) {
      trapTabKey(e, panelRef.current);
    }
  };

  // 左缘拖拽调宽：指针捕获在手柄上，向左拖变宽
  const resizable = onWidthChange !== undefined;
  const baseWidth = width ?? SIZE_WIDTH[size];
  // 可调宽时把受控宽度夹进上下限（本地存储的旧值可能越界）
  const currentWidth = resizable ? Math.min(maxWidth, Math.max(minWidth, baseWidth)) : baseWidth;
  const [resizing, setResizing] = useState(false);
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startWidth = panelRef.current?.offsetWidth ?? currentWidth;
    setResizing(true);
    const onMove = (ev: PointerEvent) => {
      const next = Math.round(startWidth + startX - ev.clientX);
      onWidthChange?.(Math.min(maxWidth, Math.max(minWidth, next)));
    };
    const onUp = () => {
      setResizing(false);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  if (!mounted) return null;

  const hasHeader = title != null || icon != null || actions != null;
  const closeButton = (
    <IconButton
      aria-label={closeLabel}
      title={`${closeLabel} (Esc)`}
      onClick={close}
      className={hasHeader ? undefined : "absolute right-2.5 top-2.5 z-20 size-7"}
    >
      <X className="size-4" strokeWidth={1.75} />
    </IconButton>
  );

  const panel = (
    <aside
      ref={el => {
        panelRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref && typeof ref === "object") ref.current = el;
      }}
      role={modal ? "dialog" : undefined}
      aria-modal={modal || undefined}
      aria-label={label}
      aria-labelledby={label || title == null ? undefined : titleId}
      tabIndex={-1}
      inert={!open || undefined}
      onKeyDown={onPanelKeyDown}
      onKeyUp={isolateKeyboard ? e => e.stopPropagation() : undefined}
      style={{ width: currentWidth }}
      className={cn(
        /* shadow-float 只向下沉，顶边几乎无影、与同色纸面糊在一起：补 1px 细边描轮廓 + 四周一圈淡影 */
        "bg-surface flex flex-col rounded-[14px] outline-none",
        "shadow-[0_0_0_1px_var(--tau-line-2),0_0_18px_-6px_var(--tau-overlay),var(--tau-shadow-float)]",
        modal
          ? "fixed bottom-2 right-2 top-2 z-[340] max-w-[calc(100vw-16px)]"
          : "absolute bottom-3 right-3 top-3 z-10 max-w-[calc(100%-24px)] origin-right outline outline-1 outline-[var(--tau-line-1)]",
        modal
          ? "transition-transform duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)]"
          : "ease-tau-out transition-[transform,opacity] duration-[240ms]",
        entered
          ? modal
            ? "translate-x-0"
            : "scale-100 opacity-100"
          : cn(
              "pointer-events-none",
              modal ? "translate-x-[calc(100%+16px)]" : "scale-[0.98] opacity-0"
            ),
        className
      )}
    >
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="拖拽调整宽度"
          onPointerDown={onResizeStart}
          onMouseDown={e => e.stopPropagation()}
          className="group absolute -left-1 bottom-4 top-4 z-30 w-2 cursor-col-resize touch-none"
        >
          <span
            className={cn(
              "bg-accent absolute bottom-0 left-[3px] top-0 w-[2px] rounded-full transition-opacity duration-150",
              resizing ? "opacity-60" : "opacity-0 group-hover:opacity-40 group-hover:delay-200"
            )}
          />
        </div>
      )}

      {hasHeader ? (
        <header className="flex shrink-0 items-start gap-3.5 px-[22px] pt-5">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            {title != null && (
              <h3
                id={titleId}
                className="text-ink-1 flex min-w-0 items-center gap-2 text-[16px] font-semibold leading-[1.45]"
              >
                {typeof title === "string" ? <span className="truncate">{title}</span> : title}
              </h3>
            )}
            {subtitle && (
              <div className="text-tau-meta text-ink-3 mt-0.5 min-w-0">
                {typeof subtitle === "string" ? (
                  <span className="block truncate">{subtitle}</span>
                ) : (
                  subtitle
                )}
              </div>
            )}
            {meta && (
              <div className="text-tau-sm text-ink-3 mt-1.5 flex min-w-0 items-center gap-2 tabular-nums">
                {meta}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {closeButton}
          </div>
        </header>
      ) : (
        closeButton
      )}

      {toolbar && <div className="shrink-0 px-[22px] pt-4">{toolbar}</div>}

      {fill ? (
        <div className={cn("relative flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
      ) : (
        <div
          ref={setBodyEl}
          className={cn(
            // 同 FadeScroll：右侧 6px 透明边承载内缩滚动条，右内边距相应减 6px
            FADE_SCROLL_CLASS,
            "min-h-0 flex-1",
            "text-ink-1 pb-4 pl-[22px] pr-4 pt-2",
            hasHeader || toolbar ? "mt-3" : "mt-2",
            !footer && "mb-3",
            bodyClassName
          )}
        >
          {children}
        </div>
      )}

      {footer && (
        <div className="border-line-2 flex shrink-0 items-center gap-2 border-t px-[22px] py-3">
          {footer}
        </div>
      )}
    </aside>
  );

  if (!modal) return panel;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "bg-overlay fixed inset-0 z-[340] transition-opacity duration-200",
          entered ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <PortalScope>{panel}</PortalScope>
    </>,
    portalContainer
  );
}

/**
 * 退场期间保留内容：返回 value；value 为空时返回最后一次非空值。
 * 抽屉由「选中项 | null」驱动时，用它渲染内容，关闭滑出途中不会变空白。
 */
export function useRetainedValue<T>(value: T | null | undefined): T | null {
  const [kept, setKept] = useState<T | null>(value ?? null);
  if (value != null && value !== kept) setKept(value);
  return value ?? kept;
}
