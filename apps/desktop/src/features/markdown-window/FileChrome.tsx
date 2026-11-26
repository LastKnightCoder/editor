import type { ReactNode } from "react";
import { Button, cn } from "@tau/ui";
import type { SaveState } from "./types";

import { useMarkdownChromeI18n } from "./chrome.i18n";

const SAVE_DOTS: Record<SaveState, string> = {
  saved: "bg-ok",
  dirty: "bg-accent",
  saving: "bg-accent",
  error: "bg-danger",
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
  const { t } = useMarkdownChromeI18n();
  const saveDot = saveState ? SAVE_DOTS[saveState] : null;
  return (
    <footer className="border-line-2 text-tau-micro text-ink-3 flex h-[30px] shrink-0 items-center gap-3.5 border-t px-3.5 tabular-nums">
      {children}
      <span className="flex-1" />
      {cursor && <span>{t("chrome.cursor", { line: cursor.line, column: cursor.column })}</span>}
      {saveState && (
        <span className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", saveDot)} />
          {t(`chrome.save.${saveState}`)}
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
  actions: { id: string; label: string; primary?: boolean; onClick(): void }[];
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
          key={action.id}
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
