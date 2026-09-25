/**
 * 输入框左下的 ＋ 与它的添加面板（D-048 二轮）：面板从输入框外框（COMPOSER_ANCHOR_ATTR，
 * 缺省为本组件所在输入区）上沿向上展开、与外框同宽；Portal 到 body + fixed 定位，
 * 不受对话列 overflow 裁剪。键盘 ↑↓ / Enter / Esc，外点关闭，关闭还焦 ＋。
 * 带 panel 的项选中后不关闭，而是在同一块面板里展开二级内容（顶部返回，Esc 回到列表）。
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Spinner, cn, usePortalContainer } from "@tau/ui";
import {
  COMPOSER_ANCHOR_ATTR,
  ComposerPanel,
  ComposerPanelFooter,
  ComposerPanelGroup,
  ComposerPanelItem,
} from "./ComposerPanel";

export interface ComposerAddItem {
  key: string;
  group: string;
  icon: ReactNode;
  label: string;
  description?: string;
  kbd?: string;
  disabled?: boolean;
  onSelect?: () => void;
  /** 二级面板：选中后在同一面板内展开；close 关闭整个面板 */
  panel?: (close: () => void) => ReactNode;
}

const GAP = 8;

export function ComposerAddMenu({
  items,
  busy = false,
  disabled = false,
}: {
  items: ComposerAddItem[];
  /** 上传中：＋ 显示转圈 */
  busy?: boolean;
  disabled?: boolean;
}) {
  const portalContainer = usePortalContainer();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [subKey, setSubKey] = useState<string | null>(null);
  const subItem = subKey ? items.find(item => item.key === subKey) : undefined;
  const [rect, setRect] = useState<{
    left: number;
    width: number;
    bottom: number;
    maxHeight: number;
  } | null>(null);

  const enabledIndexes = items.flatMap((item, index) => (item.disabled ? [] : [index]));

  const close = (refocus = true) => {
    setOpen(false);
    setSubKey(null);
    if (refocus) buttonRef.current?.focus();
  };

  // 锚定外框：同宽、贴上沿；外框尺寸变化（附件增减、多行）时跟随
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const anchor =
      button?.closest<HTMLElement>(`[${COMPOSER_ANCHOR_ATTR}]`) ?? button?.parentElement ?? null;
    if (!anchor) return;
    const measure = () => {
      const r = anchor.getBoundingClientRect();
      // 上方空间不足时限高（列表区滚动），不顶出窗口
      setRect({
        left: r.left,
        width: r.width,
        bottom: window.innerHeight - r.top + GAP,
        maxHeight: Math.max(160, r.top - GAP * 2),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(enabledIndexes[0] ?? 0);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
      setSubKey(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
    // 只在打开时初始化高亮
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 面板在 rect 量出后才挂载：挂载后再接焦点（键盘 ↑↓ / Enter / Esc 由面板接收）
  const mounted = open && rect !== null;
  useEffect(() => {
    if (mounted) panelRef.current?.focus();
  }, [mounted]);

  if (items.length === 0) return null;

  const select = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    if (item.panel) {
      setSubKey(item.key);
      panelRef.current?.focus();
      return;
    }
    close(false);
    item.onSelect?.();
  };

  const move = (step: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const at = enabledIndexes.indexOf(active);
    const next = (at + step + enabledIndexes.length) % enabledIndexes.length;
    setActive(enabledIndexes[next]);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (subItem) {
      // 二级面板内交给原生 Tab / 空格操作控件，只接管 Esc 返回
      if (event.key !== "Escape") return;
      setSubKey(null);
      panelRef.current?.focus();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Enter") select(active);
    else if (event.key === "Escape") close();
    else if (event.key === "Tab") return close(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const hasMention = items.some(item => item.kbd === "@");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="添加"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "border-line-1 text-ink-2 ease-tau-out grid size-[30px] shrink-0 place-items-center rounded-[10px] border transition-[background,color,border-color] duration-[160ms]",
          "enabled:hover:bg-hover enabled:hover:text-ink-1 disabled:cursor-default disabled:opacity-45",
          open && "bg-selected text-accent-text enabled:hover:bg-selected border-transparent"
        )}
      >
        {busy ? (
          <Spinner className="size-3.5 border-[1.5px]" />
        ) : (
          <Plus
            size={16}
            strokeWidth={1.75}
            className={cn(
              "ease-tau-out transition-transform duration-[240ms]",
              open && "rotate-45"
            )}
          />
        )}
      </button>
      {open &&
        rect &&
        createPortal(
          <ComposerPanel
            ref={panelRef}
            role="listbox"
            aria-label="添加"
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="fixed z-[250]"
            style={rect}
          >
            {subItem ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSubKey(null);
                    panelRef.current?.focus();
                  }}
                  className="text-tau-sm text-ink-2 hover:text-ink-1 flex items-center gap-1 px-3 pb-0.5 pt-2.5 font-semibold"
                >
                  <ChevronLeft className="size-3.5" strokeWidth={2} />
                  {subItem.label}
                </button>
                <div className="max-h-[360px] min-h-0 overflow-y-auto p-1.5 pt-1">
                  {subItem.panel?.(() => close(false))}
                </div>
                <ComposerPanelFooter hints={[["Esc", "返回"]]} />
              </>
            ) : (
              <>
                <div className="max-h-[360px] min-h-0 overflow-y-auto p-1.5">
                  {items.map((item, index) => (
                    <div key={item.key}>
                      {item.group !== items[index - 1]?.group && (
                        <ComposerPanelGroup>{item.group}</ComposerPanelGroup>
                      )}
                      <ComposerPanelItem
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        kbd={item.kbd}
                        trailing={
                          item.panel ? (
                            <ChevronRight className="text-ink-3 ml-auto size-3.5 shrink-0" />
                          ) : undefined
                        }
                        disabled={item.disabled}
                        active={index === active}
                        onHover={() => !item.disabled && setActive(index)}
                        onSelect={() => select(index)}
                      />
                    </div>
                  ))}
                </div>
                <ComposerPanelFooter
                  hints={[
                    ...(hasMention ? ([["@", "引用内容"]] as Array<[string, string]>) : []),
                    ["↑↓", "选择"],
                    ["Enter", "确认"],
                    ["Esc", "关闭"],
                  ]}
                />
              </>
            )}
          </ComposerPanel>,
          portalContainer
        )}
    </>
  );
}
