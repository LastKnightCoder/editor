import type { ReactNode } from "react";
import { Button, cn } from "@tau/ui";
import type { SaveState } from "./types";

const SAVE_LABELS: Record<SaveState, { label: string; dot: string }> = {
  saved: { label: "已保存", dot: "bg-ok" },
  dirty: { label: "未保存 · 自动保存中", dot: "bg-accent" },
  saving: { label: "保存中…", dot: "bg-accent" },
  error: { label: "保存失败，稍后重试", dot: "bg-danger" },
};

/** 纸面底部状态栏：左侧由视图决定（字数 / 类型等），右侧行列号 · 保存态 */
export function FileStatusBar({
  children,
  cursor,
  saveState,
  trailing,
}: {
  children?: ReactNode;
  cursor?: { line: number; column: number } | null;
  saveState?: SaveState;
  trailing?: ReactNode;
}) {
  const save = saveState ? SAVE_LABELS[saveState] : null;
  return (
    <footer className="border-line-2 text-tau-micro text-ink-3 flex h-[30px] shrink-0 items-center gap-3.5 border-t px-3.5 tabular-nums">
      {children}
      <span className="flex-1" />
      {cursor && (
        <span>
          行 {cursor.line}，列 {cursor.column}
        </span>
      )}
      {save && (
        <span className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", save.dot)} />
          {save.label}
        </span>
      )}
      {trailing}
    </footer>
  );
}

/** 纸面顶部横幅（外部修改冲突 / 文件已不在磁盘上）：不打断输入 */
export function FileBanner({
  tone,
  children,
  actions,
}: {
  tone: "warn" | "danger";
  children: ReactNode;
  actions: { label: string; primary?: boolean; onClick(): void }[];
}) {
  return (
    <div
      role="alert"
      className={cn(
        "text-tau-sm mx-3 mt-2.5 flex shrink-0 items-center gap-2.5 rounded-[10px] py-1.5 pl-3 pr-1.5",
        tone === "warn" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {actions.map(action => (
        <Button
          key={action.label}
          size="sm"
          variant={action.primary ? "primary" : "secondary"}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
