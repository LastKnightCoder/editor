/**
 * 「导出为 Markdown」弹窗重建：结构摘自 features/transfer/MarkdownExportDialog.tsx 与 components/CheckTree。
 * 左栏范围胶囊 + 勾选树，右栏本地资源 / 文档互链 / frontmatter / 文件名；底栏影响行 + 取消 / 导出（导出中 n%）。
 * 默认值同真实（services/markdown-export.ts）：打包 assets、相对 .md、写入 frontmatter；范围默认「项目」。
 */
import clsx from "clsx";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "@tau/ui";
import { PLUGINS } from "../../mock/deepwork";
import { DialogFrame, Pressed } from "./Dialog";
import { CheckLook, InputLook, RadioGroupLook, RadioLook, SwitchLook } from "./FormLook";

export type ExportScope = "项目" | "文章" | "卡片" | "全部";
export type LinkStyle = "relative" | "wiki" | "plain";

const E = PLUGINS.export;
const COUNTS: Record<ExportScope, number> = { 项目: 236, 文章: 58, 卡片: 412, 全部: E.total };

function TreeRow({ label, level, open, checked, count }: { label: string; level: number; open?: boolean; checked: boolean; count?: string }) {
  return (
    <div className="flex h-[30px] items-center gap-1.5 rounded-[7px] pr-2" style={{ paddingLeft: 4 + level * 18 }}>
      <span className="text-ink-3 grid size-4 shrink-0 place-items-center">
        <ChevronRight className={clsx("size-3", open && "rotate-90")} strokeWidth={2.2} />
      </span>
      <CheckLook checked={checked} />
      <span className={clsx("text-tau-body text-ink-1 min-w-0 flex-1 truncate", level === 0 && "font-[550]")}>{label}</span>
      {count && <span className="text-ink-3 font-tau-mono text-tau-tiny shrink-0 tabular-nums">{count}</span>}
    </div>
  );
}

export function MarkdownExportDialog({
  appear,
  scope,
  link,
  pressed,
  progress,
}: {
  appear: number;
  scope: ExportScope;
  link: LinkStyle;
  /** 正被点按的控件 */
  pressed?: "scope" | "link" | "export";
  /** 导出进度 0–100；undefined 表示还没开始 */
  progress?: number;
}) {
  const total = COUNTS[scope];
  const tree = scope === "全部" ? E.tree : E.tree.filter(t => t.label === scope);
  const exporting = progress !== undefined;
  return (
    <DialogFrame
      title="导出为 Markdown"
      width={860}
      height={620}
      appear={appear}
      impact={exporting ? (progress < 100 ? "正在打包…" : `已打包 ${total} 篇`) : `将导出 ${total} 篇为 Markdown 压缩包`}
      footer={
        <>
          <Button variant="secondary" size="sm">
            取消
          </Button>
          <Pressed on={pressed === "export"}>
            <Button variant="primary" size="sm" icon={Download}>
              {exporting ? `导出中 ${Math.round(progress)}%` : "导出"}
            </Button>
          </Pressed>
        </>
      }
    >
      <div className="mt-3.5 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <div className="border-line-1 flex min-h-0 flex-col border-r">
          <div className="flex flex-wrap items-center gap-1.5 pr-5 pb-2.5 pl-6">
            {(["项目", "文章", "卡片", "全部"] as ExportScope[]).map(s => (
              <span
                key={s}
                className={clsx(
                  "text-tau-sm rounded-full border px-3 py-0.5",
                  s === scope ? "border-accent bg-accent-soft text-accent-text" : "border-line-1 text-ink-2",
                  pressed === "scope" && s === "全部" && "bg-hover"
                )}
              >
                {s}
              </span>
            ))}
            <span className="text-ink-3 text-tau-sm ml-auto tabular-nums">
              {total} / {total} 篇
            </span>
            <span className="text-accent-text text-tau-sm">全不选</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden pr-3 pb-3 pl-4">
            {tree.map(group => (
              <div key={group.label}>
                <TreeRow label={group.label} level={0} open checked count={undefined} />
                {group.children.map((child, i) => {
                  const n = Math.max(3, Math.round(group.count / (group.children.length + 1)) - i * 7);
                  return <TreeRow key={child} label={child} level={1} checked count={`${n}/${n}`} />;
                })}
              </div>
            ))}
          </div>
          <p className="text-ink-3 text-tau-micro px-6 pt-2 pb-3">包内目录即左侧结构：项目按文档树，文章与卡片按首个标签分文件夹</p>
        </div>
        <div className="flex min-h-0 flex-col gap-[18px] overflow-hidden pr-6 pb-5 pl-[22px]">
          <RadioGroupLook legend="本地资源">
            <RadioLook checked label="打包进 assets/" desc="正文改为相对路径，换机可用" />
            <RadioLook checked={false} label="保留原地址" desc="只导出文字，图片仍指向本机或图床" />
          </RadioGroupLook>
          <div className="-mt-2.5 flex items-center gap-3">
            <SwitchLook checked={false} size="sm" />
            <span>
              <span className="text-ink-1 text-tau-body block">同时下载远程图片</span>
              <span className="text-ink-3 text-tau-sm block">图床地址也打包，导出更慢</span>
            </span>
          </div>
          <RadioGroupLook legend="文档互链">
            <RadioLook checked={link === "relative"} label="相对 .md 链接" desc="通用，Typora / VS Code 可跳转" />
            <span className={clsx("-mx-1 rounded-[8px] px-1", pressed === "link" && "bg-hover")}>
              <RadioLook checked={link === "wiki"} label="[[文件名]]" desc="Obsidian / Logseq 双链" />
            </span>
            <RadioLook checked={link === "plain"} label="纯文字" desc="只保留标题" />
          </RadioGroupLook>
          <p className="text-ink-3 text-tau-sm -mt-2.5">指向本次未导出内容的链接只保留标题</p>
          <div className="flex items-center gap-3">
            <SwitchLook checked size="sm" />
            <span>
              <span className="text-ink-1 text-tau-body block">写入 frontmatter</span>
              <span className="text-ink-3 text-tau-sm block">标题、标签、创建与更新时间</span>
            </span>
          </div>
          <div>
            <div className="text-ink-2 text-tau-sm mb-1.5 font-semibold tracking-[0.02em]">文件名</div>
            <InputLook value={`${scope}-20261018`} />
          </div>
        </div>
      </div>
    </DialogFrame>
  );
}
