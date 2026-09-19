/**
 * Select 基础件 —— 数据驱动单选（API 形态与排除记录见 D-007）。
 *
 * 单组件无复合子组件：选项集合就是 options 数据——搜索是一行 filter、分组是 group
 * 字段、异步是换数组；M1 的多选（value: V[]）与虚拟化（列表区换 VirtualList）都
 * 不需要动 API 形状。字段名与 antd 对齐（value/label/disabled），存量用法直映。
 *
 * 行为内建（不做成 props）：
 *  - 键盘全表：↑↓ 移动高亮（跳过 disabled、scrollIntoView 跟随）/ Enter·Space 选中 /
 *    Home·End 首末 / type-ahead 400ms 窗口（非 searchable）/ Tab 关闭并自然移出
 *  - aria：触发器 combobox + 弹层 listbox + aria-activedescendant 指向高亮项；
 *    选中（bg-selected + Check，当前值）与高亮（bg-hover，键盘停留行）两态并存
 *  - 定位复用 D-004 引擎（computeAnchoredPosition("bottom") + gap 4）：下方放不下
 *    翻上方（动画方向跟随）；弹层 min-width = 触发器宽（matchTriggerWidth，默认开）
 *  - 外点关闭（pointerdown capture）· 选中即关 · 焦点归还触发器 ·
 *    scroll(capture)/resize/内容尺寸 → rAF 合并重定位（照 Tooltip 的跟随模式）
 *  - Esc：仅 open 态在组件 DOM 上消费（preventDefault + stopPropagation）——焦点链
 *    即 LIFO（Esc 归焦点所在的浮层，嵌套浮层逐层退场），closed 态零参与；不进
 *    D-003 全局注册表（那是命令面板等壳层浮层的仲裁，ui 基础件不反向依赖 page/）
 *
 * 表单控件家族口径：触发器与弹层内搜索框 = surface 亮底 + line-1 描边 + radius-sm——「浮起物」语感，白卡上同底靠描边显形。
 * 层级 z-[250]（命令面板 101 < Toast 200 < Select/Menu 250 < Tooltip 300）。
 *
 * 明确不做（M0）：多选/标签模式（M1 value: V[]）· 异步 loading prop（换数组即异步，
 * 过渡态用 emptyText）· 虚拟化（M1）· renderOption 逃生舱（label: ReactNode 已覆盖
 * 富行；触发器回填 label 本体，富 label 请保持单行紧凑）。
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/ui/cn";
import { mergeRefs } from "./mergeRefs";
import { useAnchoredPosition } from "./useAnchoredPosition";
import { useLayerDismiss } from "./useLayerDismiss";
import { useListNavigation } from "./useListNavigation";

export interface SelectOption<V = string> {
  value: V;
  /** string 直用；富行传 JSX（搜索匹配走 searchText） */
  label: ReactNode;
  disabled?: boolean;
  /** 分组键，按首次出现顺序分组 */
  group?: string;
  /** 富 label 的搜索代理字段（string label 免填） */
  searchText?: string;
}

export interface SelectProps<V = string> {
  options: SelectOption<V>[];
  value?: V | null;
  defaultValue?: V | null;
  onValueChange?: (value: V) => void;
  placeholder?: string;
  size?: "sm" | "md";
  /** 弹层内嵌搜索框（本地过滤；自定义策略传 filter） */
  searchable?: boolean;
  filter?: (option: SelectOption<V>, query: string) => boolean;
  /** 过滤空态文案 */
  emptyText?: string;
  /** 弹层 min-width 跟随触发器（默认开） */
  matchTriggerWidth?: boolean;
  /** Field 体系错误态（danger 描边） */
  status?: "error";
  disabled?: boolean;
  /** 浮层受控（§5.3 契约；样板间常显标本用它） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 透传到根容器（宽度控制如 w-full） */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** 默认过滤：label 文本 + searchText 的 includes（query 已小写化） */
function defaultFilter<V>(option: SelectOption<V>, query: string): boolean {
  const text = typeof option.label === "string" ? option.label : "";
  return `${text} ${option.searchText ?? ""}`.toLowerCase().includes(query);
}

export function Select<V = string>({
  options,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  placeholder = "请选择",
  size = "md",
  searchable = false,
  filter,
  emptyText = "无匹配项",
  matchTriggerWidth = true,
  status,
  disabled = false,
  open: openProp,
  onOpenChange,
  className,
  ref,
}: SelectProps<V>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [internalValue, setInternalValue] = useState<V | null>(defaultValue);
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuId = useId();

  const value = valueProp !== undefined ? valueProp : internalValue;
  const open = openProp ?? internalOpen;
  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter(o => (filter ?? defaultFilter<V>)(o, q));
  }, [options, query, searchable, filter]);

  /** 高亮在可见序列上环游 / 边缘直达 / type-ahead（与 Menu 共用的交集，D-007） */
  const nav = useListNavigation<number>({
    items: () => visible.map((_, i) => i),
    isDisabled: i => visible[i]?.disabled === true,
    initial: () => {
      const i = visible.findIndex(o => o.value === value);
      if (i >= 0) return i;
      const first = visible.findIndex(o => !o.disabled);
      return first >= 0 ? first : null;
    },
  });
  const hl = nav.current ?? -1;
  const setHl = nav.set;

  /** 可见行（分组标签 + 选项混排），option 携带它在 visible 里的索引供高亮锚定 */
  const rows = useMemo(() => {
    const out: Array<
      { kind: "group"; key: string } | { kind: "option"; opt: SelectOption<V>; index: number }
    > = [];
    let lastGroup: string | undefined;
    visible.forEach((opt, index) => {
      if (opt.group !== lastGroup) {
        out.push({ kind: "group", key: opt.group ?? "" });
        lastGroup = opt.group;
      }
      out.push({ kind: "option", opt, index });
    });
    return out;
  }, [visible]);

  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
    if (!v) setQuery("");
  };

  /** 高亮归位：优先当前值，否则首个可选项（过滤后高亮重算也走这里） */
  const resetHl = () => nav.reset();

  const moveHl = (dir: 1 | -1) => nav.move(dir);

  const pick = (opt: SelectOption<V>) => {
    if (opt.disabled) return;
    setInternalValue(opt.value);
    onValueChange?.(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  /** 定位生命周期收口 useAnchoredPosition（D-014）；min-width 在 onPlace 设置，
   *  第二遍精调时同步布局已带上新宽度 */
  useAnchoredPosition({
    open,
    getAnchor: () => triggerRef.current?.getBoundingClientRect() ?? null,
    popRef: menuRef,
    placement: "bottom",
    gap: 4,
    onPlace: ({ side }, m) => {
      if (matchTriggerWidth) {
        const a = triggerRef.current;
        if (a) m.style.minWidth = `${a.getBoundingClientRect().width}px`;
      }
      m.dataset.dir = side === "top" ? "up" : "down";
    },
  });

  // 高亮行滚动跟随（jsdom 无 scrollIntoView，可选链防御）
  useEffect(() => {
    if (!open || hl < 0) return;
    menuRef.current?.querySelector(`[data-index="${hl}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, hl]);

  // open 时：高亮归位 + searchable 聚焦（定位由 useAnchoredPosition 承担）
  useLayoutEffect(() => {
    if (!open) return;
    resetHl();
    if (searchable) {
      // data-open 同步生效后 visibility 已切换，同步可聚焦；rAF 兜底无渲染帧环境
      try {
        searchRef.current?.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
      requestAnimationFrame(() => {
        if (document.activeElement !== searchRef.current)
          searchRef.current?.focus({ preventScroll: true });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchable]);

  // 过滤词变化：重算高亮（重定位由 useAnchoredPosition 的尺寸自适应承担——弹层高度随命中数变化）
  useLayoutEffect(() => {
    if (!open) return;
    resetHl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // 外点关闭 → dismiss 层仲裁（登记制：弹层内再开的 Menu/Popover 不算外点）
  useLayerDismiss({
    open,
    layerRef: menuRef,
    close: () => setOpen(false),
    isAnchor: target => rootRef.current?.contains(target) ?? false,
    getAnchorEl: () => triggerRef.current,
  });

  const pickHighlighted = () => {
    const opt = visible[hl] ?? visible.find(o => !o.disabled);
    if (opt) pick(opt);
  };

  /** open 态的导航键（trigger 与 menu 共用：非 searchable 焦点在触发器、searchable 在搜索框） */
  const navKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); // 搜索框内箭头默认移光标，这里改作选项导航
      moveHl(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      nav.edge(e.key === "Home" ? "home" : "end");
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickHighlighted();
    }
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab" && open) {
      setOpen(false);
    } else if (open) {
      navKeyDown(e);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !searchable) {
      // type-ahead：400ms 窗口内累积前缀匹配（命中即打开并落高亮）
      const hit = nav.typeAhead(e.key, buf => {
        const i = visible.findIndex(o => {
          const text = typeof o.label === "string" ? o.label : (o.searchText ?? "");
          return text.toLowerCase().startsWith(buf);
        });
        return i >= 0 ? i : undefined;
      });
      if (hit !== undefined) setOpen(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // 焦点链 LIFO：Esc 只关本层，不冒泡成页面后退
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else {
      navKeyDown(e);
    }
  };

  const hlOptionId = hl >= 0 ? `${menuId}-opt-${hl}` : undefined;

  const menu = createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      aria-hidden={!open}
      aria-activedescendant={hlOptionId}
      data-open={open}
      onKeyDown={onMenuKeyDown}
      className={clsx(
        "bg-surface border-line-1 shadow-float group/menu",
        "fixed left-0 top-0 z-[250] max-h-[292px] max-w-[340px] overflow-y-auto",
        "rounded-tau-lg border p-[5px]",
        "ease-tau-out transition-[opacity,transform,visibility] duration-[160ms]",
        open ? "opacity-100" : "invisible translate-y-[4px] opacity-0",
        !open && "data-[dir=up]:-translate-y-[4px]"
      )}
    >
      {searchable && (
        <div className="bg-surface border-line-1 sticky -top-[5px] -mx-[5px] -mb-[5px] border-b px-[5px] pb-2 pt-[5px]">
          <div className="border-line-1 bg-surface focus-within:border-accent rounded-tau-sm relative flex items-center border transition-colors">
            <Search className="text-ink-3 pointer-events-none absolute left-2.5 size-[13px]" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={menuId}
              aria-activedescendant={hlOptionId}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="输入过滤…"
              className="text-ink-1 placeholder:text-ink-3 h-[30px] w-full bg-transparent pl-7 pr-2.5 text-[12.5px] outline-none"
            />
          </div>
        </div>
      )}
      {rows.map(row =>
        row.kind === "group" ? (
          <div
            key={`g-${row.key}`}
            className="text-ink-3 text-tau-tiny px-2.5 pb-1 pt-2 font-semibold first:pt-1"
          >
            {row.key || "其他"}
          </div>
        ) : (
          <div
            key={String(row.opt.value)}
            id={`${menuId}-opt-${row.index}`}
            role="option"
            aria-selected={row.opt.value === value}
            data-index={row.index}
            data-hl={hl === row.index}
            data-selected={row.opt.value === value}
            data-disabled={row.opt.disabled === true}
            onPointerEnter={() => !row.opt.disabled && setHl(row.index)}
            onClick={() => pick(row.opt)}
            className={clsx(
              "text-ink-1 rounded-tau-sm flex h-8 cursor-pointer items-center gap-2 px-2.5",
              size === "sm" ? "text-tau-sm" : "text-tau-body",
              "data-[selected=true]:bg-selected data-[selected=true]:font-[550]",
              "data-[hl=true]:data-[selected=false]:bg-hover",
              "data-[disabled=true]:text-ink-3 data-[disabled=true]:pointer-events-none"
            )}
          >
            <span className="min-w-0 flex-1 truncate">{row.opt.label}</span>
            <Check
              className={clsx(
                "text-accent-text size-[15px] shrink-0",
                "transition-[opacity,transform] duration-[130ms]",
                row.opt.value === value ? "scale-100 opacity-100" : "scale-80 opacity-0"
              )}
            />
          </div>
        )
      )}
      {visible.length === 0 && (
        <div className="text-ink-3 text-tau-meta py-4 text-center">{emptyText}</div>
      )}
    </div>,
    document.body
  );

  return (
    <div ref={rootRef} className={cn("inline-flex", className)} data-disabled={disabled}>
      <button
        ref={mergeRefs(ref, el => {
          triggerRef.current = el;
        })}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        data-open={open}
        data-status={status}
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKeyDown}
        className={clsx(
          "border-line-1 bg-surface text-ink-1 group/trigger",
          "rounded-tau-sm inline-flex items-center gap-2 border",
          "ease-tau-out transition-[border-color,box-shadow] duration-[160ms]",
          "hover:border-ink-3 focus-visible:border-accent outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
          "data-[open=true]:border-accent data-[status=error]:border-danger",
          "disabled:pointer-events-none disabled:opacity-55",
          size === "sm"
            ? "text-tau-sm h-[28px] pl-2.5 pr-[3px]"
            : "text-tau-body h-[34px] pl-3 pr-[5px]"
        )}
      >
        <span
          className={clsx(
            "flex min-w-0 flex-1 items-center gap-2 truncate text-left",
            !selected && "text-ink-3"
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={clsx(
            "text-ink-3 size-4 shrink-0",
            "ease-tau-out transition-transform duration-[160ms]",
            "group-data-[open=true]/trigger:text-accent-text group-data-[open=true]/trigger:rotate-180"
          )}
        />
      </button>
      {menu}
    </div>
  );
}
