/** 生成配置弹窗的表单部件：资料清单、字段、单选卡片、模板选择 */

import { memo, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { Checkbox, cn } from "@tau/ui";
import { isElectron } from "@/electron";
import { useHtmlPreviewUrl } from "@/utils/html-preview";
import type { VLResource } from "@/types/vibe-learning";
import { resourceIcon } from "../resourceKinds";

/** 字段：12px 淡墨标签 + 可选右侧动作，内容在下 */
export function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-ink-2 text-[12px]">{label}</span>
        {hint && <span className="text-ink-3 text-[11.5px]">{hint}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </div>
  );
}

/** 资料多选：描边框内一行一份，勾选框 + 类型图标 + 名称 */
export function ResourceChecklist({
  resources,
  selectedIds,
  loading,
  allSelected,
  onToggle,
  onToggleAll,
  optional,
}: {
  resources: VLResource[];
  selectedIds: number[];
  loading: boolean;
  allSelected: boolean;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  /** 可以一份都不选（AI 编辑的参考资料） */
  optional?: boolean;
}) {
  return (
    <Field
      label={optional ? "参考资料（可选）" : "资料"}
      hint={resources.length > 0 ? `已选 ${selectedIds.length} / ${resources.length}` : undefined}
      action={
        resources.length > 0 && (
          <button
            type="button"
            onClick={onToggleAll}
            className="text-accent-text text-[12px] hover:underline"
          >
            {allSelected ? "全不选" : "全选"}
          </button>
        )
      }
    >
      <div className="border-line-1 rounded-tau-sm max-h-[220px] overflow-y-auto border p-1">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="text-ink-3 size-4 animate-spin" strokeWidth={1.75} />
          </div>
        ) : resources.length === 0 ? (
          <p className="text-tau-meta text-ink-3 m-0 px-3 py-5 text-center">
            还没有处理完成的资料，等资料转换、索引好再来生成
          </p>
        ) : (
          resources.map(resource => {
            const Icon = resourceIcon(resource);
            const checked = selectedIds.includes(resource.id);
            return (
              <label
                key={resource.id}
                className={cn(
                  "text-tau-meta flex h-[32px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2",
                  checked ? "text-ink-1" : "text-ink-2 hover:bg-hover"
                )}
              >
                <Checkbox checked={checked} onChange={() => onToggle(resource.id)} />
                <Icon className="text-ink-3 size-[15px] shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{resource.name}</span>
              </label>
            );
          })
        )}
      </div>
    </Field>
  );
}

/** 单选卡片（文章风格等）：选中 = accent 描边 + accent-soft 底 */
export function OptionCards<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: V; label: string; description: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <Field label={label}>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {options.map(option => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "ease-tau-out rounded-[10px] border px-3 py-2 text-left outline-none transition-[background,border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                active ? "border-accent bg-accent-soft" : "border-line-1 hover:bg-hover"
              )}
            >
              <span className="text-ink-1 block text-[13px] font-semibold">{option.label}</span>
              <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

interface TemplateLike {
  id: string;
  name: string;
  description: string;
  previewHtml: string;
}

const TemplateCard = memo(function TemplateCard({
  template,
  active,
  partition,
  onClick,
}: {
  template: TemplateLike;
  active: boolean;
  partition: string;
  onClick: () => void;
}) {
  const previewUrl = useHtmlPreviewUrl(template.previewHtml);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "ease-tau-out overflow-hidden rounded-[10px] border text-left outline-none transition-[border-color,box-shadow] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        active
          ? "border-accent shadow-[0_0_0_1px_var(--tau-accent)]"
          : "border-line-1 hover:border-ink-3/60"
      )}
    >
      <div className="bg-hover relative aspect-[16/10] w-full">
        {isElectron ? (
          <webview
            src={previewUrl}
            partition={partition}
            webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
            allowpopups={false}
            // @ts-expect-error inert 是合法的 HTML 属性
            inert="true"
            style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none" }}
          />
        ) : (
          <iframe
            src={previewUrl}
            className="pointer-events-none h-full w-full border-0"
            sandbox="allow-scripts"
            title={template.name}
            // @ts-expect-error inert 是合法的 HTML 属性
            inert="true"
          />
        )}
        {active && (
          <span className="bg-accent text-ink-inverse absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full">
            <Check className="size-3" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div
          className={cn(
            "truncate text-[12.5px] font-medium",
            active ? "text-accent-text" : "text-ink-1"
          )}
        >
          {template.name}
        </div>
        <div className="text-ink-3 truncate text-[11px]">{template.description}</div>
      </div>
    </button>
  );
});

/** 模板选择（PPT / 报告）：三列缩略图卡片 */
export function TemplatePicker({
  label,
  templates,
  value,
  onChange,
  partition,
}: {
  label: string;
  templates: TemplateLike[];
  value: string;
  onChange: (id: string) => void;
  partition: string;
}) {
  return (
    <Field label={label}>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {templates.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            active={template.id === value}
            partition={partition}
            onClick={() => onChange(template.id)}
          />
        ))}
      </div>
    </Field>
  );
}
