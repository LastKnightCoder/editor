/** 日记页小件：标签色点（与 Tag 七色板同源，D-021） */

import { cn, type TagColor } from "@tau/ui";

const DOT: Record<TagColor, string> = {
  red: "bg-danger",
  orange: "bg-accent",
  yellow: "bg-warn",
  green: "bg-ok",
  gray: "bg-ink-3",
  blue: "bg-info",
  purple: "bg-tag-3",
};

export function TagDot({ color, className }: { color: TagColor; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[color], className)} />;
}
