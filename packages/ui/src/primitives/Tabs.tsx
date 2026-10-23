import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  children: ReactNode;
}

export interface TabsProps<K extends string = string> {
  items: readonly TabItem<K>[];
  activeKey?: K;
  defaultActiveKey?: K;
  onChange?: (key: K) => void;
  /** 标签居中（默认左对齐） */
  centered?: boolean;
  className?: string;
  /** 面板容器类名：标签栏固定、面板独立滚动时由调用方给出高度约束 */
  panelClassName?: string;
}

/** 下划线式标签页（与 desktop 设置页同一视觉语言）；方向键在标签间移动 */
export function Tabs<K extends string = string>({
  items,
  activeKey: activeKeyProp,
  defaultActiveKey,
  onChange,
  centered = false,
  className,
  panelClassName,
}: TabsProps<K>) {
  const [innerKey, setInnerKey] = useState<K | undefined>(defaultActiveKey ?? items[0]?.key);
  const activeKey = activeKeyProp ?? innerKey;
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const select = (key: K) => {
    setInnerKey(key);
    onChange?.(key);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = items.findIndex(item => item.key === activeKey);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = items[(index + step + items.length) % items.length];
    if (!next) return;
    select(next.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.key}"]`)?.focus();
  };

  const active = items.find(item => item.key === activeKey);

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className={cn("border-line-2 flex gap-[22px] border-b px-1", centered && "justify-center")}
      >
        {items.map(item => {
          const selected = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              data-tab={item.key}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.key)}
              className={cn(
                "text-tau-body relative -mb-px inline-flex cursor-pointer items-center gap-1.5 pb-[7px] pt-2",
                "ease-tau-out outline-none transition-colors duration-[160ms]",
                "focus-visible:text-ink-1",
                "after:bg-accent after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
                selected
                  ? "text-ink-1 font-semibold after:opacity-100"
                  : "text-ink-2 hover:text-ink-1 after:opacity-0"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.key}`}
          aria-labelledby={`${baseId}-tab-${active.key}`}
          className={cn("pt-3", panelClassName)}
        >
          {active.children}
        </div>
      )}
    </div>
  );
}
