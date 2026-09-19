/**
 * ⚠️ 占位迁移（未经设计稿评审）：本文件是原 primitives/Input.tsx 中 FormField 的
 * 原样搬迁，仅为了让既有消费者（database 的 DatabasePanels、样板间）在 Input
 * 重写后继续编译——「表单字段包装」属于表单范式，正式形态是 ui/patterns 的
 * FormRow（Field 体系，02 §5.1 规划位：label / 描述 / 错误 / touched 策略 /
 * ref 聚焦钩子），待出设计稿后整体重做，届时本导出名与 render-props 契约
 * 均可能变化。在此之前请勿在此基础上加能力。
 */

import { useId, type ReactNode } from "react";
import { cn } from "../cn";

export function FormField({
  label,
  description,
  error,
  required,
  children,
}: {
  label: string;
  description?: string;
  error?: string | null;
  required?: boolean;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-1 text-tau-meta font-medium">
        {label}
        {required && (
          <span aria-label="必填" className="text-danger ml-1">
            *
          </span>
        )}
      </label>
      {children({
        id,
        "aria-describedby": error || description ? `${id}-help` : undefined,
        "aria-invalid": !!error,
      })}
      {(error || description) && (
        <p
          id={`${id}-help`}
          role={error ? "alert" : undefined}
          className={cn("text-tau-meta", error ? "text-danger" : "text-ink-2")}
        >
          {error || description}
        </p>
      )}
    </div>
  );
}
