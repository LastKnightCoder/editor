/**
 * 洞见：点「AI 洞见」后先「正在读」，再出报告并在正文里依次画出标记（可连接蓝线、矛盾波浪线）；
 * 点标记弹出对照气泡，「连接」后标记消失、计数增加。样式按 features/insights 的 InsightLeaf、
 * InsightPopover 与 InsightsReport 重建。
 */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@tau/ui";

type Kind = "link" | "conflict";

interface Finding {
  id: number;
  kind: Kind;
  text: string;
  target: string;
  here: string;
  there: string;
}

const FINDINGS: Finding[] = [
  {
    id: 1,
    kind: "link",
    text: "注意力会被切碎",
    target: "注意力残留",
    here: "注意力会被切碎",
    there: "切换任务后，一部分注意力会留在上一件事上。",
  },
  {
    id: 2,
    kind: "conflict",
    text: "每天至少要专注四小时",
    target: "Deep Work 读书笔记",
    here: "每天至少要专注四小时",
    there: "书里说新手能专注一小时就不错，四小时是长期训练后的上限。",
  },
];

type Stage = "idle" | "reading" | "ready";

/** 矛盾标记的波浪线：遮罩只取形状，颜色走主题的 danger */
const WAVE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 2 Q1.5 0 3 2 T6 2' fill='none' stroke='black' stroke-width='1'/%3E%3C/svg%3E\")";

export default function InsightsDemo() {
  const [stage, setStage] = useState<Stage>("idle");
  const [resolved, setResolved] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [connected, setConnected] = useState(0);

  useEffect(() => {
    if (stage !== "reading") return;
    const timer = setTimeout(() => setStage("ready"), 1500);
    return () => clearTimeout(timer);
  }, [stage]);

  const mark = (finding: Finding, order: number) => {
    if (stage !== "ready" || resolved.includes(finding.id)) return <span>{finding.text}</span>;
    return (
      <span className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === finding.id ? null : finding.id)}
          className="relative cursor-pointer"
        >
          {finding.text}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 -bottom-0.5 h-[3px] origin-left animate-[insight-draw_0.5s_ease-out_both]",
              finding.kind === "link" ? "bg-info" : "bg-danger [mask:var(--wave)_repeat-x]"
            )}
            style={{
              animationDelay: `${order * 250}ms`,
              ["--wave" as string]: WAVE,
            }}
          />
        </button>
        {open === finding.id && (
          <span className="bg-surface border-line-1 shadow-float animate-doc-in absolute top-full left-0 z-10 mt-2 flex w-[360px] max-w-[calc(100vw-64px)] flex-col gap-2.5 rounded-[14px] border p-3.5 text-left text-[13px] leading-relaxed">
            <span
              className={cn(
                "text-tau-tiny font-semibold",
                finding.kind === "link" ? "text-info" : "text-danger"
              )}
            >
              {finding.kind === "link" ? "可以连接" : "可能矛盾"}
            </span>
            <span className="grid grid-cols-2 gap-2">
              <span className="bg-surface-hover rounded-[10px] p-2.5">
                <span className="text-ink-3 text-tau-tiny block">这里</span>
                {finding.here}
              </span>
              <span className="bg-surface-hover rounded-[10px] p-2.5">
                <span className="text-ink-3 text-tau-tiny block">《{finding.target}》</span>
                {finding.there}
              </span>
            </span>
            <span className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setResolved(list => [...list, finding.id]);
                  setOpen(null);
                }}
                className="text-ink-2 hover:bg-hover h-7 rounded-[8px] px-3"
              >
                不相关
              </button>
              <button
                type="button"
                onClick={() => {
                  setResolved(list => [...list, finding.id]);
                  if (finding.kind === "link") setConnected(value => value + 1);
                  setOpen(null);
                }}
                className="bg-accent text-ink-inverse hover:bg-accent-hover h-7 rounded-[8px] px-3 font-medium"
              >
                {finding.kind === "link" ? "连接" : "去补写"}
              </button>
            </span>
          </span>
        )}
      </span>
    );
  };

  const left = FINDINGS.filter(finding => !resolved.includes(finding.id));

  return (
    <div className="border-line-1 bg-surface shadow-card rounded-[16px] border px-8 pt-6 pb-8 max-sm:px-4">
      <style>{"@keyframes insight-draw { from { transform: scaleX(0); } }"}</style>
      <h4 className="text-[22px] font-semibold">为什么你总是很忙却没做成事</h4>
      <div className="text-ink-3 text-tau-tiny mt-2 flex items-center gap-2">
        <span>1,280 字</span>
        <button
          type="button"
          title="让 AI 对照你的其他笔记读这一篇"
          onClick={() => {
            if (stage === "idle") setStage("reading");
            else {
              setStage("idle");
              setResolved([]);
              setConnected(0);
              setOpen(null);
            }
          }}
          className={cn(
            "text-tau-meta inline-flex h-[22px] items-center gap-[5px] rounded-full px-2 transition-colors",
            stage === "idle" ? "text-ink-2 hover:bg-hover" : "bg-accent-soft text-accent-text"
          )}
        >
          <Sparkles
            className={cn("size-3", stage === "reading" && "animate-spin")}
            strokeWidth={1.75}
          />
          {stage === "idle" ? "AI 洞见" : stage === "reading" ? "正在读" : "退出洞见"}
        </button>
      </div>

      {stage === "reading" && (
        <p className="text-ink-2 text-tau-sm animate-doc-in mt-4">
          对照你的 86 份笔记，找到 5 处可能相关…
        </p>
      )}
      {stage === "ready" && (
        <div className="bg-surface-hover rounded-tau-lg animate-doc-in mt-4 flex flex-wrap items-center gap-2 px-[18px] py-3">
          <span className="bg-surface inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px]">
            <i className="bg-info size-1.5 rounded-full" />
            可连接{" "}
            {
              FINDINGS.filter(finding => finding.kind === "link" && !resolved.includes(finding.id))
                .length
            }
          </span>
          <span className="bg-surface inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px]">
            <i className="bg-danger size-1.5 rounded-full" />
            矛盾{" "}
            {
              FINDINGS.filter(
                finding => finding.kind === "conflict" && !resolved.includes(finding.id)
              ).length
            }
          </span>
          <span className="text-ink-3 text-tau-sm ml-auto">
            {left.length ? "点正文里的标记逐条处理" : `都处理完了 · 已连 ${connected} 处`}
          </span>
        </div>
      )}

      <p className="text-tau-body-lg mt-5 leading-[1.95]">
        一天下来消息回了几十条，会开了三个，真正想推进的那件事却一个字没动。问题不在于时间不够，而在于
        {mark(FINDINGS[0], 0)}
        ：每一次被打断，都要花很久才能回到原来的状态。所以我给自己定了一条规矩：
        {mark(FINDINGS[1], 1)}，雷打不动。
      </p>
    </div>
  );
}
