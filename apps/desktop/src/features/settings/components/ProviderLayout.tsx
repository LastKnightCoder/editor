/**
 * 服务商页共用件 —— 大语言模型 / 图片生成（2026-09-24 用户裁决 mockups/settings/provider-layout.html
 * 方案 A：去掉左右主从，改「顶部切换栏 + 整宽分组」，与其它设置页同一节奏）。
 *
 * 整页收进一个面板（用户校准「分成三块看着散」），面板内三层（再校准「内部层次不分明」）：
 * ProviderSwitcher = 卡片头（横排切换 + bg-selected 轻染，末尾「添加」，下缘 line-1 贯穿线，
 * 同弹窗头部的结构线）→ ProviderSection = 紧凑小节头（标题与说明同行、操作居右）+ line-1 描边
 * 内框（层次靠描边，不引入实底档）→ 内框里的设置行（line-2 弱分隔）。
 * FieldBox：字段定宽盒——Input 的 className 落在内部 <input>，外框是 w-full，定宽给外层盒子，
 * 普通输入与 SecretInput 右缘才能逐像素对齐。
 * SecretInput：密钥的显隐 / 复制收进框内，不挂在框外把右缘顶歪。
 */

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Copy, Eye, EyeOff, Plus } from "lucide-react";
import { IconButton, Input } from "@tau/ui";

export function FieldBox({ children }: { children: ReactNode }) {
  return <div className="w-[300px] max-w-full">{children}</div>;
}

export interface ProviderSwitcherItem {
  id: string;
  label: string;
  /** 名称后的小字附注（模型数 / 「当前」） */
  meta?: ReactNode;
}

export function ProviderSwitcher({
  label,
  items,
  activeId,
  onSelect,
  addLabel,
  onAdd,
}: {
  label: string;
  items: ProviderSwitcherItem[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-line-1 -mx-1.5 -mt-1.5 flex flex-wrap items-center gap-1 border-b p-1.5"
    >
      {items.map(item => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(item.id)}
            className={clsx(
              "rounded-tau-sm text-tau-body inline-flex h-8 max-w-[220px] items-center gap-1.5 px-3",
              "ease-tau-out transition-colors duration-[160ms]",
              active
                ? "bg-selected text-accent-text font-medium"
                : "text-ink-2 hover:bg-hover hover:text-ink-1"
            )}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            {item.meta !== undefined && (
              <span className="text-tau-micro text-ink-3 flex-none font-normal tabular-nums">
                {item.meta}
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="rounded-tau-sm text-tau-body text-ink-2 hover:bg-hover hover:text-ink-1 ml-auto inline-flex h-8 items-center gap-1.5 px-3"
      >
        <Plus size={14} strokeWidth={1.75} />
        {addLabel}
      </button>
    </div>
  );
}

/** 面板内小节：紧凑小节头（标题 + 同行说明 / 右侧操作）+ line-1 描边内框 */
export function ProviderSection({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-1.5 pb-1.5 pt-3.5">
      <div className="flex min-h-8 items-center gap-3 pb-2 pl-1.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h4 className="text-tau-body-lg text-ink-1 flex-none font-semibold">{title}</h4>
          {description && <p className="text-tau-meta text-ink-2 truncate">{description}</p>}
        </div>
        {action && <div className="flex flex-none items-center gap-1.5">{action}</div>}
      </div>
      <div className="rounded-tau-md p-1 shadow-[inset_0_0_0_1px_var(--color-line-1)]">
        {children}
      </div>
    </section>
  );
}

/** 密钥输入：显隐（可选复制）按钮收进框内右侧，右缘与其它字段对齐 */
export function SecretInput({
  value,
  onChange,
  placeholder,
  label,
  onCopy,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  onCopy?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        className={clsx("font-tau-mono", onCopy ? "pr-[52px]" : "pr-7")}
        type={visible ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={label}
        onChange={e => onChange(e.target.value)}
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        <IconButton
          className="size-[26px]"
          aria-label={visible ? `隐藏 ${label}` : `显示 ${label}`}
          onClick={() => setVisible(v => !v)}
        >
          {visible ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
        </IconButton>
        {onCopy && (
          <IconButton className="size-[26px]" aria-label={`复制 ${label}`} onClick={onCopy}>
            <Copy size={14} strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
