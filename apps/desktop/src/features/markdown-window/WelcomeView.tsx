import { useEffect, useState } from "react";
import { FilePlus, FileText, Folder, FolderOpen, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";
import { getRecentProjects, type RecentProject } from "@/commands/recent-projects";
import { dirName } from "./paths";

export interface OpenActions {
  openFolder(): void;
  openFile(): void;
  newFile(): void;
  openPath(path: string, isDirectory: boolean): void;
}

function ActionCard({
  icon: Icon,
  title,
  hint,
  kbd,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  kbd: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line-1 rounded-tau-md text-tau-meta text-ink-1 hover:bg-hover flex flex-col items-start gap-2 border p-3.5 text-left transition-colors"
    >
      <Icon className="text-accent-text size-[18px]" strokeWidth={1.75} />
      {title}
      <span className="text-tau-tiny text-ink-3">{hint}</span>
      <kbd className="text-tau-tiny text-ink-3 font-mono">{kbd}</kbd>
    </button>
  );
}

/** 欢迎页：打开文件夹 / 打开文件 / 新建文件 + 最近打开 */
export function WelcomeView({ actions }: { actions: OpenActions }) {
  const [recent, setRecent] = useState<RecentProject[]>([]);
  useEffect(() => {
    getRecentProjects().then(setRecent, () => setRecent([]));
  }, []);

  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-8">
      <div className="w-[440px] max-w-full">
        <h1 className="text-tau-title-lg text-ink-1 font-semibold">打开 Markdown</h1>
        <p className="text-tau-meta text-ink-3 mb-5 mt-1">
          编辑本地的 .md 文件，或把整个文件夹当作一个文档库。
        </p>
        <div className="mb-6 grid grid-cols-3 gap-2.5">
          <ActionCard
            icon={Folder}
            title="打开文件夹"
            hint="侧栏显示目录树"
            kbd="⌘⇧O"
            onClick={actions.openFolder}
          />
          <ActionCard
            icon={FileText}
            title="打开文件"
            hint=".md / .markdown"
            kbd="⌘O"
            onClick={actions.openFile}
          />
          <ActionCard
            icon={FilePlus}
            title="新建文件"
            hint="选择保存位置"
            kbd="⌘N"
            onClick={actions.newFile}
          />
        </div>
        {recent.length > 0 && (
          <>
            <h2 className="text-tau-tiny text-ink-3 mb-1.5 font-medium tracking-wide">最近打开</h2>
            {recent.map(item => {
              const Icon = item.isDirectory ? FolderOpen : FileText;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => actions.openPath(item.path, item.isDirectory)}
                  title={item.path}
                  className="rounded-tau-sm text-tau-meta text-ink-1 hover:bg-hover flex h-8 w-full items-center gap-2 px-2.5 text-left transition-colors"
                >
                  <Icon className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.name}</span>
                  <span className="text-tau-tiny text-ink-3 ml-auto max-w-[220px] truncate">
                    {dirName(item.path)}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** 已打开文件夹、还没选文件 */
export function NoFileView({ onNewFile }: { onNewFile(): void }) {
  return (
    <div className="text-tau-meta text-ink-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <span>从左侧选择一个文件</span>
      <button
        type="button"
        onClick={onNewFile}
        className={cn(
          "border-line-1 rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 flex h-7 items-center gap-1.5 border px-3 transition-colors"
        )}
      >
        <FilePlus className="size-3.5" strokeWidth={1.75} />
        新建文件
        <kbd className="text-tau-tiny text-ink-3 font-mono">⌘N</kbd>
      </button>
    </div>
  );
}
