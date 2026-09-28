/**
 * 资源选择弹窗（视频 / 音频 / PDF / 网页等「粘贴链接添加」类）共用的正文片段：字段、错误提示、解析结果预览。
 * 外壳统一用 @tau/ui 的 Dialog，版式对齐「添加资料」弹窗。
 */

import type { ReactNode } from "react";
import { Input, cn, type InputProps } from "@tau/ui";
import LocalImage from "@/components/LocalImage";

/** 链接 / 标题输入框：比表单默认档（34px）高一档，粘贴长链接时更从容 */
export function ResourceSelectInput({ wrapperClassName, className, ...props }: InputProps) {
  return (
    <Input
      {...props}
      wrapperClassName={cn("h-10 pl-3.5", wrapperClassName)}
      className={cn("text-tau-body-lg", className)}
    />
  );
}

/** 字段：12px 淡墨标签 + 可选提示，控件在下 */
export function ResourceSelectField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <span className="text-ink-2 text-[12px]">{label}</span>
        {hint && <span className="text-ink-3 text-[11.5px]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function ResourceSelectError({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3.5 py-2.5"
    >
      {text}
    </p>
  );
}

/** 解析结果：封面 + 标题 + 来源说明 */
export function ResourceSelectPreview({
  cover,
  title,
  meta,
}: {
  cover?: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {cover && (
        <LocalImage
          url={cover}
          alt={title}
          className="rounded-tau-sm h-[54px] w-24 shrink-0 object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-tau-body text-ink-1 truncate font-semibold" title={title}>
          {title}
        </div>
        <div className="text-tau-sm text-ink-3">{meta}</div>
      </div>
    </div>
  );
}
