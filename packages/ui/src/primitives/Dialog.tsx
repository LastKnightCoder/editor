/**
 * Dialog 基础件 —— 模态决策容器 + ConfirmDialog 语义预设（形制与行为裁决见 D-011）。
 *
 * 形制：体内大标题 + 上下文徽标（context）+ hairline 应答区（主按钮最右，按钮序列
 * 由 footer 提供）+ blur 遮罩；长内容滚动区接 edge fade（对齐壳层 useEdgeFade
 * 协议）。阻断通知不带 icon，文字头部与其它对话同构（D-011）。
 *
 * 行为内建（不做成 props）：
 *  - 开合动效：遮罩淡入 + 卡片 scale(0.97)+translateY(8px)，退场等长后卸载；根上带
 *    data-morph（视图转场进行中）时一步到位到终态——转场更新期间 rAF 不触发，入场
 *    动效跑不起来，浏览器要截的是终态。卡片 data-state=open|closed 供形变定位就绪
 *  - Esc：仅 open 态在卡片 DOM 消费（stopPropagation）——焦点圈闭保证 Esc 必落
 *    卡片，焦点链即 LIFO，不进 D-003 注册表（同 D-007/D-010 口径，ui 不反向依赖
 *    page/）；critical 抖动拒绝
 *  - 关闭矩阵：dismissible = × + Esc + 遮罩点击；critical = 无 ×、遮罩点击抖动；
 *    locked（异步 loading）= 全失效
 *  - Tab 圈闭（首尾环绕）· 打开记录触发元素、关闭归还焦点
 *  - 初始焦点落卡片内 [data-autofocus] 元素（无则卡片自身）；表单场景把
 *    data-autofocus 放首输入框，danger 场景放取消按钮
 *  - 打开锁定底层滚动；卡片是限高（78vh）的 flex 列，头尾钉住
 *
 * 正文组合（同 MUI DialogContent / Chakra ModalBody）：卡片不替内容决定滚动，
 * children 原样排在标题与应答区之间。常规正文包 <DialogBody>——它是滚动区
 * （edge fade + 内缩滚动条 + 标准内边距）；放在 DialogBody 之外的内容自然钉住
 * 不随正文滚动（元信息行、标签栏等）；工作台型弹窗（双栏树 + 预览等）不用
 * DialogBody，配合 height 定高由内容自行分栏滚动。
 *
 * 自定义头部：`header` 整体替换内建标题行与 ×（工作台型弹窗自带导航头时用），
 * 关闭入口由 header 自行提供；`title` 仍是对话框的无障碍名称。
 *
 * 尺寸档是预设不是牢笼（D-011）：sm 380 / md 440（默认）/ lg 560，width 任意值覆盖；
 * 高度默认随内容（上限 78vh），height 定高（仍不超 82vh）。
 * 层级：遮罩容器 z-[340]（Select/Menu 250 < Tooltip 300 之上，Toast 360 之下——弹窗里的操作反馈须可见）。
 */

import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { PortalScope, usePortalContainer } from "../UiProvider";
import clsx from "clsx";
import { cn } from "../cn";
import { X } from "lucide-react";
import { UiDismissBoundary } from "../UiHostProvider";
import { useEdgeFade } from "../hooks/useEdgeFade";
import { FADE_SCROLL_CLASS } from "../hooks/fadeScrollClass";
import { lockBodyScroll } from "../hooks/lockBodyScroll";
import { IconButton } from "./IconButton";
import { trapTabKey } from "./focusTrap";

export interface DialogProps {
  open: boolean;
  /** 提前挂载内容，待异步初始化完成后再显示并接管焦点。 */
  contentReady?: boolean;
  onOpenChange: (open: boolean) => void;
  /** 退场完成且内容卸载后调用，可在此清理业务草稿。 */
  onAfterClose?: () => void;
  title: string;
  /** 替换内建标题行与 ×；关闭入口由调用方在 header 内提供，title 转为 aria-label */
  header?: ReactNode;
  /** 标题左侧图标（16px、ink-2，随需出现；阻断通知等场景保持纯文字头部） */
  icon?: ReactNode;
  /** 标题下的次级说明行（meta 字号，随需出现） */
  subtitle?: string;
  /** 操作对象（上下文徽标，随需出现；标题保持动作语义） */
  context?: string;
  /** footer 影响行——后果量化贴决策点；impactDanger 走 danger 色 */
  impact?: string;
  impactDanger?: boolean;
  /** critical：无 ×，遮罩/Esc 抖动拒绝——「必须作答」档 */
  critical?: boolean;
  /** 关闭路径全封锁（异步进行中，半途关闭即坏文件） */
  locked?: boolean;
  size?: "sm" | "md" | "lg";
  /** 任意宽度（px）覆盖 size——业务特殊版式不必硬凑档位 */
  width?: number;
  /** 卡片定高（px，不超 82vh）——工作台型弹窗由内容自管滚动时用，避免高度随内容跳动 */
  height?: number;
  /** 应答区按钮序列（主按钮恒在最右；组件自身不渲染按钮） */
  footer?: ReactNode;
  children?: ReactNode;
  /** 卡片 onKeyDown 透传（ConfirmDialog 用它接管 Enter 默认应答） */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/** 上下文徽标：surface 亮底 + line-1 描边（D-009 行内小药丸口径） */
const CHIP_CLASS =
  "border-line-1 bg-surface text-ink-2 inline-flex h-[22px] max-w-[176px] shrink-0 items-center " +
  "gap-[5px] truncate rounded-full border px-2.5 text-[11px]";

/** 视图转场进行中（根上 data-morph，D-106）关掉开合过渡 */
const MORPH_INSTANT = "[[data-morph]_&]:transition-none";

/** critical 的拒绝反馈：300ms 横向抖动（jsdom 无 WAAPI，可选链防御） */
function shakeCard(el: HTMLElement | null) {
  el?.animate?.(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
  );
}

export function Dialog({
  open,
  contentReady = true,
  onOpenChange,
  onAfterClose,
  title,
  header,
  icon,
  subtitle,
  context,
  impact,
  impactDanger,
  critical = false,
  locked = false,
  size = "md",
  width,
  height,
  footer,
  children,
  onKeyDown,
  className,
  ref,
}: DialogProps) {
  const portalContainer = usePortalContainer();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);
  const wasMounted = useRef(false);
  const afterCloseRef = useRef(onAfterClose);
  afterCloseRef.current = onAfterClose;
  const titleId = useId();

  // 进出场：open 时挂载 + rAF 后上 shown（播进场）；关时先撤 shown，退场时长的定时后卸载。
  // visible 在渲染期由 open/contentReady 派生：宿主页面被 Activity 保活停驻时退场
  // effect 不再运行、卸载定时器被清，shown/mounted 会冻结——portal 又挂在页面外
  // （不随页面 display:none 隐藏），渲染期短路保证此时弹窗必然退到不可见不可点，
  // 页面重新激活后 effect 补跑完成卸载与 onAfterClose。
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const visible = open && contentReady;
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (!contentReady) {
        setShown(false);
        return;
      }
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(timer);
  }, [open, contentReady]);

  // 打开：记录触发元素（关闭归还）+ 锁底层滚动
  useEffect(() => {
    if (!open || !contentReady) return;
    lastActiveRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return lockBodyScroll(portalContainer.ownerDocument);
  }, [open, contentReady, portalContainer.ownerDocument]);

  // 挂载后落初始焦点：[data-autofocus] 优先（表单首输入框 / danger 的取消按钮），否则卡片自身
  useEffect(() => {
    if (!mounted || !open || !contentReady) return;
    const card = cardRef.current;
    if (!card) return;
    const target = card.querySelector<HTMLElement>("[data-autofocus]") ?? card;
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* jsdom 部分元素无 focus */
    }
  }, [mounted, open, contentReady]);

  // 卸载瞬间归还焦点给触发元素（键盘用户不断链）
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

  const requestClose = () => {
    if (locked) return;
    onOpenChange(false);
  };

  const onMaskClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // 点的是卡片不是遮罩
    if (locked) return;
    if (critical) shakeCard(cardRef.current);
    else requestClose();
  };

  const onCardKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.nativeEvent.isComposing || e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // 焦点链 LIFO：不冒泡成页面后退
      if (locked) return;
      if (critical) shakeCard(cardRef.current);
      else requestClose();
    } else if (e.key === "Tab") {
      trapTabKey(e, cardRef.current);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <UiDismissBoundary
      open={visible}
      dismiss={() => {
        if (critical) shakeCard(cardRef.current);
        else requestClose();
      }}
    >
      <div
        onClick={onMaskClick}
        aria-hidden={!contentReady || undefined}
        inert={!contentReady || undefined}
        className={clsx(
          "bg-overlay fixed inset-0 z-[340] grid place-items-center p-8",
          "backdrop-blur-[4px]",
          "ease-tau-out transition-opacity duration-[200ms]",
          visible && shown ? "opacity-100" : "opacity-0",
          MORPH_INSTANT,
          visible && "[[data-morph]_&]:opacity-100",
          !visible && "pointer-events-none",
          !contentReady && "invisible"
        )}
      >
        <PortalScope>
          <div
            ref={el => {
              cardRef.current = el;
              if (typeof ref === "function") ref(el);
              else if (ref && typeof ref === "object") ref.current = el;
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={header ? undefined : titleId}
            aria-label={header ? title : undefined}
            tabIndex={-1}
            data-state={visible ? "open" : "closed"}
            onKeyDown={onCardKeyDown}
            style={{ width, height: height ? `min(82vh, ${height}px)` : undefined }}
            className={clsx(
              "bg-surface border-line-1 shadow-float relative",
              // 遮罩是按内容定轨的 grid，max-w-full 限不住宽度：按视口减去遮罩两侧 p-8 限宽
              "rounded-tau-lg text-ink-2 text-tau-body flex max-w-[calc(100vw-4rem)] flex-col border",
              !height && "max-h-[min(78vh,660px)]",
              size === "sm" ? "w-[380px]" : size === "lg" ? "w-[560px]" : "w-[440px]",
              "ease-tau-out transition-[opacity,transform] duration-[200ms]",
              visible && shown ? "opacity-100" : "translate-y-[8px] scale-[0.97] opacity-0",
              MORPH_INSTANT,
              visible &&
                "[[data-morph]_&]:translate-none [[data-morph]_&]:scale-none [[data-morph]_&]:opacity-100",
              !(visible && shown) && "pointer-events-none",
              className
            )}
          >
            {header ?? (
              <>
                {!critical && (
                  <IconButton
                    type="button"
                    aria-label="关闭"
                    disabled={locked}
                    onClick={requestClose}
                    className="absolute right-3 top-3 size-[28px] rounded-[8px]"
                  >
                    <X className="size-[14px]" />
                  </IconButton>
                )}
                <div className="flex items-center gap-2 pl-6 pr-12 pt-[22px]">
                  {icon && (
                    <span className="text-ink-2 flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
                      {icon}
                    </span>
                  )}
                  <h2
                    id={titleId}
                    title={title}
                    className="text-ink-1 min-w-0 truncate text-[16px] font-[650] leading-[1.45] tracking-[-0.01em]"
                  >
                    {title}
                  </h2>
                  {context && (
                    <span className={CHIP_CLASS}>
                      <span className="bg-accent size-[6px] shrink-0 rounded-full" />
                      {context}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-ink-3 text-tau-meta mt-[3px] pl-6 pr-12">{subtitle}</p>
                )}
              </>
            )}
            <DialogContext value={{ hasFooter: Boolean(footer || impact) }}>
              {children}
            </DialogContext>
            {(footer || impact) && (
              <div
                className={clsx(
                  "border-line-2 flex items-center gap-2 border-t px-6 py-[14px]",
                  !impact && "justify-end"
                )}
              >
                {impact && (
                  <div
                    className={clsx(
                      "min-w-0 flex-1 text-[11.5px] leading-[1.5]",
                      impactDanger ? "text-danger" : "text-ink-3"
                    )}
                  >
                    {impact}
                  </div>
                )}
                {footer}
              </div>
            )}
          </div>
        </PortalScope>
      </div>
    </UiDismissBoundary>,
    portalContainer
  );
}

const DialogContext = createContext({ hasFooter: false });

export interface DialogBodyProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Dialog 正文滚动区：同 FadeScroll 的内缩滚动条（轨道上下各留 10px，不贴头尾），右侧 6px
 * 透明边、右内边距相应减 6px；只纵向滚动（内容借位负外边距超出时不冒横向滚动条）。
 * 底部留白按有无应答区取：有则贴 hairline 前留 22px，无则滚动区离卡片底 16px。
 */
export function DialogBody({ children, className }: DialogBodyProps) {
  const { hasFooter } = use(DialogContext);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(bodyEl);
  return (
    <div
      ref={setBodyEl}
      className={cn(
        FADE_SCROLL_CLASS,
        "min-h-0 overflow-x-hidden pl-6 pr-[18px] pt-[8px]",
        hasFooter ? "pb-[22px]" : "mb-4 pb-[6px]",
        className
      )}
    >
      {children}
    </div>
  );
}
