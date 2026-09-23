/**
 * 菜单基础件：命令、开关、单选组、分隔与子菜单组成的异构浮层。
 * 键盘导航、焦点回收、外点关闭和菜单树互斥由组件内建。
 */

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { usePortalContainer } from "../UiProvider";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "../cn";
import { mergeRefs } from "./mergeRefs";
import { useAnchoredPosition } from "./useAnchoredPosition";
import { registerDismissLayer, type RegisterDismissLayerOptions } from "./useLayerDismiss";
import { useListNavigation } from "./useListNavigation";
import { useMenuTree } from "./useMenuTree";

const GAP = 4;
const SUBMENU_HOVER_MS = 260;

/* ───────── 上下文 ───────── */

/** 根级：命令项触发后的整树关闭（外点/互斥由 dismiss 层逐层登记承担，D-014） */
export interface MenuRootContextValue {
  closeMenu: () => void;
}
const MenuRootContext = createContext<MenuRootContextValue | null>(null);

/** 层级：本层导航高亮 + 子菜单开合（每层 MenuSurface 各持一份） */
interface MenuLevelContextValue {
  hlId: string | null;
  setHl: (id: string | null) => void;
  activeSubId: string | null;
  openSubmenu: (headId: string) => void;
  closeSubmenu: () => void;
  focusSelf: () => void;
}
const MenuLevelContext = createContext<MenuLevelContextValue | null>(null);
const useMenuLevel = (): MenuLevelContextValue => {
  const v = useContext(MenuLevelContext);
  if (!v) throw new Error("Menu 子组件必须渲染在 <Menu> / <ContextMenu> 内");
  return v;
};

const RadioGroupContext = createContext<{
  value?: string;
  onValueChange?: (v: string) => void;
} | null>(null);

/* ───────── 小工具 ───────── */

/** type-ahead 的匹配文本：组件渲染文本不可读；可选 textValue 未纳入 API，当前仅从 ReactNode 子节点退化提取。 */
function childText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childText).join("");
  if (isValidElement(node)) return childText((node.props as { children?: ReactNode }).children);
  return "";
}

/** cloneElement 的 props 类型在 HTML 元素与组件间不协变，收窄绕开泛型噪声 */
function cloneTrigger(
  el: ReactElement<Record<string, unknown>>,
  props: Record<string, unknown>
): ReactElement {
  return cloneElement(el, props as Partial<Record<string, unknown>> & Record<string, unknown>);
}

/* ───────── 浮层层容器（主层常驻 / 子层动态挂载，导航与定位都在这） ───────── */

interface MenuSurfaceProps {
  open: boolean;
  /** 本层整体关闭：主层 = 关菜单还焦触发器；子层 = 通知父层收起 */
  onClose: () => void;
  focusReturn: () => void;
  getAnchor: () => {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  placement: "bottom-start" | "bottom-end" | "right-start";
  /** 子层响应 ← 键（主层不响应，避免误关） */
  isSub?: boolean;
  /** 触发器判定（dismiss 层用：点它不算外点；主层 = 根触发器，子层默认无） */
  isAnchor?: RegisterDismissLayerOptions["isAnchor"];
  /** 触发器 el（dismiss 层判父层用：子层锚 = 父项，落在主层 DOM 内即为其子层） */
  getAnchorEl?: () => HTMLElement | null;
  className?: string;
  children: ReactNode;
}

function MenuSurface({
  open,
  onClose,
  focusReturn,
  getAnchor,
  placement,
  isSub = false,
  isAnchor,
  getAnchorEl,
  className,
  children,
}: MenuSurfaceProps) {
  const root = useContext(MenuRootContext);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceId = useId();
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  const items = () =>
    Array.from(containerRef.current?.querySelectorAll("[data-menu-item]") ?? []).map(el => el.id);
  const isDisabled = (id: string) =>
    document.getElementById(id)?.getAttribute("data-disabled") === "true";

  const nav = useListNavigation<string>({
    items,
    isDisabled,
    initial: () => items().find(id => !isDisabled(id)) ?? null,
  });

  const labelOf = (id: string) => document.getElementById(id)?.dataset.label?.toLowerCase() ?? "";

  const levelValue = useMemo<MenuLevelContextValue>(
    () => ({
      hlId: nav.current,
      setHl: id => {
        nav.set(id);
        setActiveSubId(prev => (id === prev ? prev : null)); // 高亮移走时收起子菜单
      },
      activeSubId,
      openSubmenu: headId => {
        nav.set(headId);
        setActiveSubId(headId);
      },
      closeSubmenu: () => setActiveSubId(null),
      focusSelf: () => containerRef.current?.focus({ preventScroll: true }),
    }),
    // nav.set 是 useState setter（稳定）；nav.current / activeSubId 变化即重造 value
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.current, nav.set, activeSubId]
  );

  // 定位生命周期收口 useAnchoredPosition（D-014）：进场双遍 + scroll(capture)/resize 跟随
  useAnchoredPosition({
    open,
    getAnchor,
    popRef: containerRef,
    placement,
    gap: GAP,
    onPlace: ({ side }, c) => {
      c.dataset.dir = side === "top" ? "up" : "down";
    },
  });

  // open 时：焦点入层 + 高亮归位；关闭时清子层状态（重开不残留）
  useLayoutEffect(() => {
    if (!open) {
      setActiveSubId(null);
      return;
    }
    nav.reset();
    try {
      containerRef.current?.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 高亮行滚动跟随（jsdom 无 scrollIntoView，可选链防御）
  useEffect(() => {
    if (!open || !nav.current) return;
    document.getElementById(nav.current)?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nav.current]);

  // 登记进 dismiss 层仲裁表：外点关闭、跨实例互斥与「点菜单内容不是外点」的
  // 链判定都在这（D-014 收口，useMenuTree 不再挂自己的监听）；子层经 getAnchorEl
  // 声明父层。关闭走 onClose（主层 = closeMenu 整树关还焦；子层 = 通知父层收起）
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    return registerDismissLayer({
      el,
      isAnchor: isAnchor ?? (() => false),
      close: onClose,
      anchorEl: getAnchorEl?.() ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      nav.move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      nav.edge(e.key === "Home" ? "home" : "end");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const el = nav.current ? document.getElementById(nav.current) : null;
      if (el?.dataset.kind === "sub" && el.dataset.disabled !== "true") setActiveSubId(el.id);
      else el?.click(); // 子组件的 onClick 接管触发语义（cmd 关树 / 开关不关）
    } else if (e.key === "ArrowRight") {
      const el = nav.current ? document.getElementById(nav.current) : null;
      if (el?.dataset.kind === "sub" && el.dataset.disabled !== "true") {
        e.preventDefault();
        setActiveSubId(el.id);
      }
    } else if (e.key === "ArrowLeft") {
      if (isSub) {
        e.preventDefault();
        onClose();
        focusReturn();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // 焦点链 LIFO：Esc 只关本层，不冒泡成页面后退
      onClose();
      focusReturn();
    } else if (e.key === "Tab") {
      root?.closeMenu();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      nav.typeAhead(
        e.key,
        buf => items().find(id => !isDisabled(id) && labelOf(id).startsWith(buf)) ?? undefined
      );
    }
  };

  return (
    <MenuLevelContext.Provider value={levelValue}>
      <div
        ref={containerRef}
        id={surfaceId}
        role="menu"
        tabIndex={-1}
        aria-hidden={!open}
        aria-activedescendant={nav.current ?? undefined}
        data-open={open}
        onKeyDown={onKeyDown}
        className={cn(
          "bg-surface border-line-1 shadow-float rounded-tau-lg border p-[6px]",
          "fixed left-0 top-0 z-[250] flex max-h-[300px] w-max min-w-[160px] max-w-[min(320px,calc(100vw-16px))] flex-col overflow-hidden",
          "ease-tau-out transition-[opacity,transform,visibility] duration-[160ms]",
          "outline-none",
          open ? "opacity-100" : "invisible translate-y-[4px] opacity-0",
          !open && "data-[dir=up]:-translate-y-[4px]",
          className
        )}
      >
        <div className="min-h-0 overflow-y-auto pr-[6px]">{children}</div>
      </div>
    </MenuLevelContext.Provider>
  );
}

/* ───────── 子组件（纯声明，交互语义各自内建） ───────── */

const kbdChipClass =
  "font-tau-mono border-line-1 bg-surface text-ink-2 rounded-[5px] border px-[6px] py-px text-[11px] leading-[1.5]";

function MenuKbd({ kbd, hlDanger }: { kbd?: string; hlDanger?: boolean }) {
  if (!kbd) return null;
  return (
    <span
      className={cn(
        kbdChipClass,
        "ml-auto shrink-0 pl-[18px]",
        hlDanger && "text-ink-inverse border-ink-inverse/35 bg-transparent"
      )}
    >
      {kbd}
    </span>
  );
}

function MenuIconSlot({ icon, hlDanger }: { icon?: ReactNode; hlDanger?: boolean }) {
  if (!icon) return null;
  return (
    <span
      className={cn(
        "text-ink-2 group-data-[hl=true]/mi:text-ink-1 flex size-4 shrink-0 items-center justify-center",
        "[&_svg]:size-4",
        hlDanger && "group-data-[hl=true]/mi:text-ink-inverse"
      )}
    >
      {icon}
    </span>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  /** 快捷键提示（展示用；键监听归全局注册表，这里不接线） */
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
  className?: string;
}

function MenuItem({ icon, kbd, danger, disabled, onSelect, children, className }: MenuItemProps) {
  const level = useMenuLevel();
  const root = useContext(MenuRootContext);
  const id = useId();
  const isHl = level.hlId === id;
  const hlDanger = isHl && danger === true;
  return (
    <div
      id={id}
      role="menuitem"
      data-menu-item
      data-kind="cmd"
      data-label={childText(children)}
      data-disabled={disabled === true}
      data-danger={danger === true}
      data-hl={isHl}
      aria-disabled={disabled}
      onPointerEnter={disabled ? undefined : () => level.setHl(id)}
      onClick={
        disabled
          ? undefined
          : () => {
              onSelect?.();
              root?.closeMenu(); // 命令项触发即关整树
            }
      }
      className={cn(
        "group/mi text-ink-1 rounded-tau-sm text-tau-body mb-[2px] flex h-[34px] cursor-pointer items-center gap-[9px] px-2.5 text-left",
        "data-[danger=true]:text-danger",
        "data-[hl=true]:bg-hover",
        "data-[danger=true]:data-[hl=true]:bg-danger data-[danger=true]:data-[hl=true]:text-ink-inverse",
        "data-[disabled=true]:text-ink-3 data-[disabled=true]:pointer-events-none",
        className
      )}
    >
      <MenuIconSlot icon={icon} hlDanger={hlDanger} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuKbd kbd={kbd} hlDanger={hlDanger} />
    </div>
  );
}

export interface MenuCheckboxItemProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  icon?: ReactNode;
  kbd?: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

function MenuCheckboxItem({
  checked = false,
  onCheckedChange,
  icon,
  kbd,
  disabled,
  children,
  className,
}: MenuCheckboxItemProps) {
  const level = useMenuLevel();
  const id = useId();
  const isHl = level.hlId === id;
  return (
    <div
      id={id}
      role="menuitemcheckbox"
      aria-checked={checked}
      data-menu-item
      data-kind="check"
      data-label={childText(children)}
      data-disabled={disabled === true}
      data-hl={isHl}
      aria-disabled={disabled}
      onPointerEnter={disabled ? undefined : () => level.setHl(id)}
      onClick={
        disabled ? undefined : () => onCheckedChange?.(!checked) // 开关项触发不关闭（连续操作）
      }
      className={cn(
        "group/mi text-ink-1 rounded-tau-sm text-tau-body mb-[2px] flex h-[34px] cursor-pointer items-center gap-[9px] px-2.5 text-left",
        "data-[hl=true]:bg-hover",
        "data-[disabled=true]:text-ink-3 data-[disabled=true]:pointer-events-none",
        className
      )}
    >
      {/* 控件式方框：选中填 accent + 反色勾 */}
      <span
        className={cn(
          "flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px]",
          "ease-tau-out transition-[background-color,border-color] duration-[130ms]",
          checked ? "border-accent bg-accent" : "border-ink-3",
          disabled === true && "opacity-50"
        )}
      >
        <Check
          className={cn(
            "text-ink-inverse size-[10px] stroke-[2.5]",
            "transition-[opacity,transform] duration-[130ms]",
            checked ? "scale-100 opacity-100" : "scale-80 opacity-0"
          )}
        />
      </span>
      <MenuIconSlot icon={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuKbd kbd={kbd} />
    </div>
  );
}

export interface MenuRadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}

function MenuRadioGroup({ value, onValueChange, children }: MenuRadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      {children}
    </RadioGroupContext.Provider>
  );
}

export interface MenuRadioItemProps {
  value: string;
  icon?: ReactNode;
  kbd?: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

function MenuRadioItem({ value, icon, kbd, disabled, children, className }: MenuRadioItemProps) {
  const group = useContext(RadioGroupContext);
  const level = useMenuLevel();
  const id = useId();
  const isHl = level.hlId === id;
  const checked = group?.value === value;
  return (
    <div
      id={id}
      role="menuitemradio"
      aria-checked={checked}
      data-menu-item
      data-kind="radio"
      data-label={childText(children)}
      data-disabled={disabled === true}
      data-hl={isHl}
      aria-disabled={disabled}
      onPointerEnter={disabled ? undefined : () => level.setHl(id)}
      onClick={
        disabled ? undefined : () => group?.onValueChange?.(value) // 单选项触发不关闭（组内互斥由受控 value 保证）
      }
      className={cn(
        "group/mi text-ink-1 rounded-tau-sm text-tau-body mb-[2px] flex h-[34px] cursor-pointer items-center gap-[9px] px-2.5 text-left",
        "data-[hl=true]:bg-hover",
        "data-[disabled=true]:text-ink-3 data-[disabled=true]:pointer-events-none",
        className
      )}
    >
      {/* 控件式圆圈：选中 accent 内点 */}
      <span
        className={cn(
          "flex size-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
          checked ? "border-accent" : "border-ink-3",
          disabled === true && "opacity-50"
        )}
      >
        <span
          className={cn(
            "bg-accent size-[7px] rounded-full",
            "ease-tau-out transition-transform duration-[130ms]",
            checked ? "scale-100" : "scale-0"
          )}
        />
      </span>
      <MenuIconSlot icon={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuKbd kbd={kbd} />
    </div>
  );
}

export interface MenuSubmenuProps {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

function MenuSubmenu({ label, icon, disabled, children }: MenuSubmenuProps) {
  const portalContainer = usePortalContainer();
  const level = useMenuLevel();
  const id = useId();
  const hoverTimer = useRef<number>(0);
  const open = !disabled && level.activeSubId === id;
  const isHl = level.hlId === id;

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [disabled, open]);

  return (
    <>
      <div
        id={id}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        data-menu-item
        data-kind="sub"
        data-label={childText(label)}
        data-disabled={disabled === true}
        data-hl={isHl}
        aria-disabled={disabled}
        onPointerEnter={
          disabled
            ? undefined
            : () => {
                level.setHl(id);
                if (!open) {
                  window.clearTimeout(hoverTimer.current);
                  hoverTimer.current = window.setTimeout(
                    () => level.openSubmenu(id),
                    SUBMENU_HOVER_MS
                  );
                }
              }
        }
        onPointerLeave={() => window.clearTimeout(hoverTimer.current)}
        onClick={
          disabled
            ? undefined
            : () => (open ? (level.closeSubmenu(), level.focusSelf()) : level.openSubmenu(id))
        }
        className={cn(
          "group/mi text-ink-1 rounded-tau-sm text-tau-body mb-[2px] flex h-[34px] cursor-pointer items-center gap-[9px] px-2.5 text-left",
          "data-[hl=true]:bg-hover",
          "data-[disabled=true]:text-ink-3 data-[disabled=true]:pointer-events-none"
        )}
      >
        <MenuIconSlot icon={icon} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="text-ink-3 ml-auto h-3 w-3 shrink-0" strokeWidth={2} />
      </div>
      {open &&
        createPortal(
          // 子层瞬开（不做 160ms 进场）：动态挂载的两帧动画换不来可感知收益，换来测试与时序复杂度
          <MenuSurface
            open
            isSub
            onClose={level.closeSubmenu}
            focusReturn={level.focusSelf}
            getAnchor={() => document.getElementById(id)?.getBoundingClientRect() ?? null}
            placement="right-start"
            getAnchorEl={() => document.getElementById(id)}
          >
            {children}
          </MenuSurface>,
          portalContainer
        )}
    </>
  );
}

function MenuSeparator() {
  return <div role="separator" className="bg-line-1 mx-1 my-1.5 h-px" />;
}

function MenuGroup({ children }: { children: ReactNode }) {
  return (
    <div className="text-ink-3 text-tau-tiny px-2.5 pb-1 pt-2 font-semibold tracking-[0.03em] first:pt-1">
      {children}
    </div>
  );
}

/* ───────── 根组件 ───────── */

export interface MenuProps {
  /**
   * 触发器（单一元素，克隆注入开合事件 / aria / ref；不强制本组件的按钮样式）。
   * 协议同 Tooltip：元素必须透传 props 与 ref——原生元素或 {...rest} 透传的
   * 组件；不透传的包装组件会吞掉注入，点击无反应。
   */
  trigger: ReactElement;
  children: ReactNode;
  /** 交叉轴对齐：start = 左缘 / end = 右缘对齐触发器 */
  align?: "start" | "end";
  /** 浮层受控（§5.3 契约；样板间常显标本用它） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 透传浮层（宽度控制如 w-[280px]） */
  className?: string;
}

export function Menu({
  trigger,
  children,
  align = "start",
  open: openProp,
  onOpenChange,
  className,
}: MenuProps) {
  const portalContainer = usePortalContainer();
  const triggerRef = useRef<HTMLElement | null>(null);
  const tree = useMenuTree({
    open: openProp,
    onOpenChange,
    focusReturn: () => triggerRef.current?.focus(),
  });
  const { open, setOpen, closeMenu, rootValue } = tree;

  const triggerEl = Children.only(trigger) as ReactElement<Record<string, unknown>>;
  const injected: Record<string, unknown> = {
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    ref: mergeRefs((triggerEl.props as { ref?: Ref<HTMLElement> }).ref, el => {
      triggerRef.current = el;
    }),
    onClick: (e: ReactMouseEvent) => {
      (triggerEl.props as { onClick?: (e: ReactMouseEvent) => void }).onClick?.(e);
      if (!e.defaultPrevented) setOpen(!open);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      (triggerEl.props as { onKeyDown?: (e: ReactKeyboardEvent) => void }).onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
        e.preventDefault();
        setOpen(true);
      } else if ((e.key === "Enter" || e.key === " ") && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Tab" && open) {
        setOpen(false);
      }
    },
  };

  return (
    <MenuRootContext.Provider value={rootValue}>
      {cloneTrigger(triggerEl, injected)}
      {createPortal(
        <MenuSurface
          open={open}
          onClose={closeMenu}
          focusReturn={() => triggerRef.current?.focus()}
          getAnchor={() => triggerRef.current?.getBoundingClientRect() ?? null}
          placement={align === "end" ? "bottom-end" : "bottom-start"}
          isAnchor={target => triggerRef.current?.contains(target) ?? false}
          getAnchorEl={() => triggerRef.current}
          className={className}
        >
          {children}
        </MenuSurface>,
        portalContainer
      )}
    </MenuRootContext.Provider>
  );
}

export interface ContextMenuProps {
  /** 被包裹的区域（区域内在任意处右键弹出菜单） */
  children: ReactNode;
  /** 菜单内容（与 Menu 的 children 同构） */
  content: ReactNode;
  className?: string;
}

export function ContextMenu({ children, content, className }: ContextMenuProps) {
  const portalContainer = usePortalContainer();
  const pointRef = useRef({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  /** 右键命中的元素：关闭时把焦点还给它（不可聚焦元素 focus() 静默失败，无害） */
  const targetRef = useRef<HTMLElement | null>(null);
  const tree = useMenuTree({
    focusReturn: () => targetRef.current?.focus(),
  });
  const { open, setOpen, closeMenu, rootValue } = tree;

  return (
    <MenuRootContext.Provider value={rootValue}>
      {/* display:contents 包裹不破坏调用方布局；右键锚 = 命中点的 0 尺寸虚拟 rect */}
      <div
        className="contents"
        onContextMenu={e => {
          e.preventDefault();
          const x = e.clientX;
          const y = e.clientY;
          pointRef.current = { left: x, top: y, right: x, bottom: y, width: 0, height: 0 };
          targetRef.current = e.target as HTMLElement;
          setOpen(true);
        }}
      >
        {children}
      </div>
      {createPortal(
        <MenuSurface
          open={open}
          onClose={closeMenu}
          focusReturn={() => targetRef.current?.focus()}
          getAnchor={() => pointRef.current}
          placement="bottom-start"
          isAnchor={target => targetRef.current?.contains(target) ?? false}
          getAnchorEl={() => targetRef.current}
          className={className}
        >
          {content}
        </MenuSurface>,
        portalContainer
      )}
    </MenuRootContext.Provider>
  );
}

Menu.Item = MenuItem;
Menu.CheckboxItem = MenuCheckboxItem;
Menu.RadioGroup = MenuRadioGroup;
Menu.RadioItem = MenuRadioItem;
Menu.Submenu = MenuSubmenu;
Menu.Separator = MenuSeparator;
Menu.Group = MenuGroup;
