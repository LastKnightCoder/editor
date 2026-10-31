import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@tau/ui";
import { iconButtonClass } from "./classes.ts";

/** 注解序号徽标（浮层与抽屉头部） */
export function AnnotationNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-tau-mono rounded-[5px] bg-[var(--ed-accent-soft)] px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums text-[var(--ed-accent-text)]",
        className
      )}
    >
      {value}
    </span>
  );
}

/** 复制注解内容；成功后图标短暂换成对勾 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={copied ? "已复制" : "复制内容"}
      disabled={!text}
      className={cn(iconButtonClass, className)}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
