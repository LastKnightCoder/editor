/**
 * 表单控件的静态外观，类名摘自 packages/ui/src/primitives（Input / Radio / Switch / Checkbox / Loading 的 Spinner）。
 * 视频里不需要交互，状态由调用方给；Spinner 按帧旋转（CSS 动画在逐帧渲染里不可控）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { Check, type LucideIcon } from "lucide-react";
import { useCurrentFrame } from "remotion";

export function InputLook({
  lead: Lead,
  value,
  placeholder,
  size = "md",
  password,
  focused,
  className,
}: {
  lead?: LucideIcon;
  value?: string;
  placeholder?: string;
  size?: "sm" | "md";
  password?: boolean;
  focused?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "rounded-tau-sm border-line-1 bg-surface flex min-w-0 items-center gap-2 border",
        size === "sm" ? "text-tau-sm h-[28px] pr-[3px] pl-2.5" : "text-tau-body h-[34px] pr-1 pl-3",
        focused && "border-accent shadow-[var(--tau-focus-ring)]",
        className
      )}
    >
      {Lead && <Lead className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />}
      <span className={clsx("min-w-0 flex-1 truncate", value ? "text-ink-1" : "text-ink-3")}>{value ? (password ? "•".repeat(Math.min(28, [...value].length)) : value) : placeholder}</span>
    </span>
  );
}

export function RadioLook({ checked, label, desc }: { checked: boolean; label: string; desc?: string }) {
  return (
    <span className="flex items-start gap-1">
      <span className="grid size-6 shrink-0 place-items-center">
        <span className={clsx("bg-surface grid size-4 place-items-center rounded-full border-[1.5px]", checked ? "border-accent" : "border-line-1")}>
          {checked && <span className="bg-accent size-[7px] rounded-full" />}
        </span>
      </span>
      <span className="pt-0.5">
        <span className="text-ink-1 text-tau-body block">{label}</span>
        {desc && <span className="text-ink-3 text-tau-meta block leading-[1.55]">{desc}</span>}
      </span>
    </span>
  );
}

export function RadioGroupLook({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2.5">
      <div className="text-ink-2 text-tau-meta mb-0 font-medium">{legend}</div>
      {children}
    </div>
  );
}

export function SwitchLook({ checked, size = "md" }: { checked: boolean; size?: "sm" | "md" }) {
  return (
    <span className={clsx("relative shrink-0 rounded-full border-[1.5px] border-transparent", checked ? "bg-accent" : "bg-track", size === "sm" ? "h-[17px] w-[30px]" : "h-5 w-9")}>
      <span
        className={clsx(
          "bg-surface absolute top-0.5 left-0.5 rounded-full border shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
          checked ? "border-transparent" : "border-ink-3",
          size === "sm" ? "size-[11px]" : "size-3.5",
          checked && (size === "sm" ? "left-[14px]" : "left-[17px]")
        )}
      />
    </span>
  );
}

export function CheckLook({ checked }: { checked: boolean }) {
  return (
    <span className="relative inline-grid size-6 shrink-0 place-items-center">
      <span className={clsx("grid size-4 place-items-center rounded-[4.5px] border-[1.5px]", checked ? "border-accent bg-accent" : "bg-surface border-line-1")} />
      {checked && <Check strokeWidth={2.5} className="text-ink-inverse absolute size-3" />}
    </span>
  );
}

export function SpinnerLook({ className }: { className?: string }) {
  const frame = useCurrentFrame();
  return <span className={clsx("border-accent/30 border-t-accent inline-block size-4 rounded-full border-2", className)} style={{ transform: `rotate(${frame * 8}deg)` }} />;
}

export function LoadingLook({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[45vh] flex-col items-center justify-center gap-3">
      <SpinnerLook className="size-5" />
      <p className="text-tau-sm text-ink-3 tabular-nums">{label}</p>
    </div>
  );
}
