/**
 * 协作：左边是作者，右边是受邀的人。右边粘贴协作码点「申请加入」，左边出现申请，同意后右边变成已加入。
 * 协作码输入与申请项按 features/collaboration 的 JoinDialog、InvitationCode 与 JoinRequestItem 重建。
 */
import { useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@tau/ui";

const CODE = ["K7QX", "M3AZ", "9BCD"];

type Stage = "idle" | "requested" | "joined" | "rejected";

function Pane({ who, children }: { who: string; children: ReactNode }) {
  return (
    <div className="border-line-1 bg-surface shadow-card flex min-w-0 flex-1 flex-col gap-3 rounded-[16px] border p-5">
      <p className="text-ink-3 text-tau-tiny font-semibold tracking-[0.12em]">{who}</p>
      {children}
    </div>
  );
}

export default function CollabDemo() {
  const [parts, setParts] = useState(["", "", ""]);
  const [stage, setStage] = useState<Stage>("idle");
  const complete = parts.every(part => part.length === 4);

  const fill = (index: number, value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    // 整段粘贴自动分到三格
    if (clean.length > 4) {
      setParts([clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)]);
      return;
    }
    setParts(list => list.map((part, partIndex) => (partIndex === index ? clean : part)));
  };

  return (
    <div className="flex gap-4 max-md:flex-col">
      <Pane who="作者 · 共享《学会学习》">
        <p className="text-tau-sm text-ink-2">把协作码发给对方，7 天内有效</p>
        <div className="border-line-1 rounded-tau-md flex h-[46px] items-center border pr-1.5 pl-4">
          <span className="font-tau-mono flex-1 text-[17px] tracking-[0.22em]">
            {CODE.join("-")}
          </span>
          <button
            type="button"
            onClick={() => setParts(CODE)}
            title="复制（示意里直接填到右边）"
            className="text-ink-2 hover:bg-hover grid size-8 place-items-center rounded-[8px]"
          >
            <Copy className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        {stage === "requested" && (
          <div className="animate-doc-in border-line-1 relative flex items-center gap-2.5 overflow-hidden rounded-[11px] border py-2.5 pr-2 pl-4">
            <i className="bg-accent absolute inset-y-0 left-0 w-[3px]" />
            <span className="bg-tag-2-soft text-tag-2 grid size-[26px] place-items-center rounded-full text-[12px] font-semibold">
              林
            </span>
            <span className="min-w-0 flex-1">
              <b className="text-tau-sm block">林夏</b>
              <span className="text-ink-3 text-tau-tiny">申请加入 · 7 天内有效</span>
            </span>
            <button
              type="button"
              aria-label="拒绝"
              onClick={() => setStage("rejected")}
              className="text-ink-2 hover:bg-hover grid size-8 place-items-center rounded-[8px]"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label="同意"
              onClick={() => setStage("joined")}
              className="bg-accent text-ink-inverse hover:bg-accent-hover grid size-8 place-items-center rounded-[8px]"
            >
              <Check className="size-4" strokeWidth={2} />
            </button>
          </div>
        )}
        {stage === "joined" && (
          <p className="text-ok text-tau-sm animate-doc-in">林夏已加入，现在可以一起编辑了</p>
        )}
        {stage === "idle" && <p className="text-ink-3 text-tau-sm">还没有人申请</p>}
      </Pane>
      <Pane who="受邀的人 · 加入协作">
        {stage === "joined" ? (
          <div className="animate-doc-in flex flex-col gap-2">
            <p className="text-ok text-tau-body font-semibold">已加入《学会学习》</p>
            <p className="text-ink-2 text-tau-sm">它会出现在侧边栏「协作」下的「我加入的」里。</p>
          </div>
        ) : (
          <>
            <p className="text-tau-sm text-ink-2">输入对方给你的协作码，可以整段粘贴</p>
            <div className="flex items-center gap-2">
              {parts.map((part, index) => (
                <span key={index} className="contents">
                  {index > 0 && <span className="text-ink-3">–</span>}
                  <input
                    value={part}
                    disabled={stage === "requested"}
                    onChange={event => fill(index, event.target.value)}
                    placeholder={CODE[index]}
                    aria-label={`协作码第 ${index + 1} 段`}
                    className="border-line-1 focus:border-accent font-tau-mono placeholder:text-ink-3/50 h-10 w-full min-w-0 rounded-[10px] border text-center text-[17px] tracking-[0.22em] uppercase outline-none select-text"
                  />
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={!complete || stage === "requested"}
              onClick={() => setStage("requested")}
              className={cn(
                "h-9 rounded-[10px] text-[14px] font-medium transition-colors",
                complete && stage !== "requested"
                  ? "bg-accent text-ink-inverse hover:bg-accent-hover"
                  : "bg-hover text-ink-3"
              )}
            >
              {stage === "requested" ? "等待作者同意…" : "申请加入"}
            </button>
            {stage === "rejected" && (
              <p className="text-danger text-tau-sm">作者没有同意这次申请</p>
            )}
            {stage === "idle" && !complete && (
              <p className="text-ink-3 text-tau-tiny">没有协作码？点左边的复制按钮</p>
            )}
          </>
        )}
      </Pane>
    </div>
  );
}
