/** 设备同步页的共用小件：状态句、淡底提示行、段头、配对步骤、粘贴框、错误说明与冲突副本 */

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Copy, Database, Files, type LucideIcon } from "lucide-react";
import { Button, Dialog, DialogBody, Textarea, toast } from "@tau/ui";
import { describeDeviceSyncError } from "@tau/collaboration/src/device-sync/messages";
import { useDeviceSyncCopies, type DeviceSyncStatus } from "./deviceSyncModel";

export type Tone = "ok" | "warn" | "danger" | "accent" | "idle";
const LEAD_TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent-text",
  idle: "bg-hover text-ink-2",
};

/** 一句状态 + 一行来源，操作靠右 */
export function StatusBand(props: {
  tone: Tone;
  icon: LucideIcon;
  spinning?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className="flex items-center gap-3.5">
      <span
        className={clsx(
          "grid size-9 flex-none place-items-center rounded-full",
          LEAD_TONE[props.tone]
        )}
      >
        <Icon
          size={18}
          strokeWidth={1.75}
          aria-hidden
          className={clsx(props.spinning && "animate-spin [animation-duration:1.4s]")}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-tau-title text-ink-1 leading-snug font-semibold">{props.title}</div>
        {props.subtitle && <div className="text-tau-meta text-ink-2 mt-0.5">{props.subtitle}</div>}
      </div>
      {props.actions && <div className="flex flex-none items-center gap-1.5">{props.actions}</div>}
    </div>
  );
}

/** 状态句下方的补充说明：淡墨底一行，不升级为警告 */
export function QuietRow(props: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="bg-hover rounded-tau-md text-tau-meta text-ink-2 mt-3.5 flex min-h-9 items-center gap-2.5 px-3 py-1.5">
      <Icon size={15} strokeWidth={1.75} className="text-ink-3 flex-none" aria-hidden />
      <span className="min-w-0 flex-1">{props.children}</span>
      {props.action}
    </div>
  );
}

export function SectionHead(props: { title: string; note?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h4 className="text-tau-body-lg text-ink-1 font-semibold">{props.title}</h4>
      {props.note && <span className="text-tau-meta text-ink-3">{props.note}</span>}
    </div>
  );
}

/** 步骤序号：固定尺寸、数字居中，与右侧标题首行对齐 */
export function StepNumber(props: { n: number }) {
  return (
    <span className="bg-accent-soft text-accent-text text-tau-tiny mt-px grid size-5 flex-none place-items-center rounded-full leading-none font-semibold tabular-nums">
      {props.n}
    </span>
  );
}

export function Steps(props: { items: { title: string; detail: ReactNode }[]; columns?: boolean }) {
  return (
    <ol className={clsx("grid gap-4", props.columns && "grid-cols-3")}>
      {props.items.map((item, index) => (
        <li key={item.title} className="flex gap-2.5">
          <StepNumber n={index + 1} />
          <div className="min-w-0">
            <div className="text-tau-body text-ink-1 font-medium">{item.title}</div>
            <div className="text-tau-meta text-ink-2 mt-px">{item.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 配对载荷单行省略显示，「复制」才是主角 */
export function CodeField(props: { code: string; expired?: boolean }) {
  return (
    <div className="border-line-1 bg-surface rounded-tau-md flex min-w-0 items-center gap-2 border py-1.5 pr-1.5 pl-3">
      <span
        className={clsx(
          "font-tau-mono min-w-0 flex-1 truncate text-[12px]",
          props.expired ? "text-ink-3 line-through" : "text-ink-2"
        )}
      >
        {props.code}
      </span>
      {!props.expired && (
        <Button
          variant="primary"
          size="sm"
          icon={Copy}
          onClick={() =>
            void navigator.clipboard
              .writeText(props.code)
              .then(() => toast.success("已复制配对信息"))
              .catch(() => toast.error("复制失败，请手动选中复制"))
          }
        >
          复制
        </Button>
      )}
    </div>
  );
}

export function PasteField(props: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  rows?: number;
}) {
  return (
    <Textarea
      id={props.id}
      value={props.value}
      rows={props.rows ?? 2}
      spellCheck={false}
      aria-invalid={props.invalid || undefined}
      placeholder="粘贴以 tau-pair: 开头的配对信息"
      onChange={event => props.onChange(event.target.value)}
      className="font-tau-mono min-h-0 text-[12px]"
    />
  );
}

/** 动作失败：人话标题 + 下一步，原始错误只在复制里 */
export function Failure(props: { error: unknown; className?: string }) {
  if (!props.error) return null;
  const problem = describeDeviceSyncError(props.error);
  return (
    <p role="alert" className={clsx("text-tau-meta text-danger", props.className)}>
      {problem.title}。<span className="text-ink-2">{problem.hint}</span>
    </p>
  );
}

export function CopyDetail(props: { detail: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(props.detail).then(() => toast.success("已复制错误详情"))
      }
    >
      复制错误详情
    </Button>
  );
}

/** 冲突副本：一行淡底提示 +「查看」；日常同步继续用当前资料库 */
export function PreservedCopies(props: { status: DeviceSyncStatus }) {
  const count = props.status.branches + props.status.noteCopies;
  const [open, setOpen] = useState(false);
  const { copies, exportCopy } = useDeviceSyncCopies(open && count > 0);
  if (!count) return null;
  return (
    <>
      <QuietRow
        icon={Files}
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            查看
          </Button>
        }
      >
        已保留 {count} 份冲突副本，日常同步继续使用当前资料库
      </QuietRow>
      <Dialog open={open} onOpenChange={setOpen} title="已保留的冲突副本" size="lg">
        <DialogBody>
          <p className="text-tau-body text-ink-2 mb-3">
            少数离线修改无法自动合并时，Tau
            会把它们完整留下来。日常同步继续使用当前资料库，可以另存一份对照查看。
          </p>
          {copies.isLoading && <p className="text-tau-meta text-ink-3">正在读取…</p>}
          <Failure error={copies.error ?? exportCopy.error} className="mb-2" />
          <ul className="-mx-2 grid gap-0.5">
            {copies.data?.map(copy => {
              const Icon = copy.kind === "note" ? Files : Database;
              return (
                <li
                  key={`${copy.kind}-${copy.id}`}
                  className="hover:bg-hover rounded-tau-md flex items-center gap-3 px-2 py-2"
                >
                  <span className="bg-hover text-ink-2 grid size-8 flex-none place-items-center rounded-[10px]">
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-tau-body text-ink-1 block truncate">{copy.reason}</span>
                    <span className="text-tau-sm text-ink-3 block">
                      {copy.kind === "note" ? "笔记副本" : "资料库副本"}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={exportCopy.isPending && exportCopy.variables?.id === copy.id}
                    loadingText="保存中…"
                    onClick={() => exportCopy.mutate(copy)}
                  >
                    {copy.kind === "note" ? "导出原始材料" : "另存为资料库"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </DialogBody>
      </Dialog>
    </>
  );
}
