/**
 * AI 对话：三个示例请求，分别演示读取（search_knowledge 直接执行，回答带引用）、
 * 改写（rewrite 产生「请确认这次修改」审阅卡，确认应用 / 拒绝）、安排待办
 * （create_todo 触发「AI 想要修改内容，需要你确认」审批条，允许 / 本会话始终允许 / 拒绝）。
 * 工具行、审批条、审阅卡与改动摘要按 packages/chat-ui 的 ToolCallRow、ToolApprovalBar
 * 与 desktop tool-call-renderers 的 ContentEditProposalRenderer、CompactSummary 重建。
 */
import { useEffect, useState } from "react";
import {
  ArrowUp,
  Ban,
  Check,
  ChevronRight,
  CircleCheck,
  PencilLine,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  SquarePen,
  X,
} from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type ToolState = "executing" | "awaiting" | "success" | "denied";

interface ToolCall {
  name: string;
  state: ToolState;
  seconds: string;
  input: string;
  output: string;
}

type ScenarioKey = "read" | "edit" | "todo";

const PROMPTS: Record<ScenarioKey, string> = {
  read: "我读过的书里，关于专注有哪些观点？",
  edit: "把这篇读书笔记的第二段改得更精炼",
  todo: "明天下午三点提醒我写第三季度复盘",
};

/** idle → running（工具执行中）→ waiting（需要你处理）→ done / denied */
type Stage = "idle" | "running" | "waiting" | "done" | "denied";

function Spinner() {
  return (
    <span className="border-ink-3 size-3 animate-spin rounded-full border-[1.5px] border-t-transparent" />
  );
}

function ToolRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const icon =
    call.state === "success" ? (
      <Check className="text-ok size-3.5" strokeWidth={2} />
    ) : call.state === "awaiting" ? (
      <ShieldQuestion className="text-warn size-3.5" strokeWidth={1.75} />
    ) : call.state === "denied" ? (
      <Ban className="text-ink-3 size-3.5" strokeWidth={1.75} />
    ) : (
      <Spinner />
    );
  const label =
    call.state === "success"
      ? call.seconds
      : call.state === "awaiting"
        ? "等待确认"
        : call.state === "denied"
          ? "已拒绝"
          : "执行中…";
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="text-tau-meta hover:bg-hover flex h-[26px] items-center gap-2 rounded-[7px] px-1.5"
      >
        {icon}
        <span className="font-tau-mono text-[12px]">{call.name}</span>
        <span className="text-ink-3 tabular-nums">· {label}</span>
        <ChevronRight
          className={cn("text-ink-3 size-3.5 transition-transform", open && "rotate-90")}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <div className="border-line-1 animate-doc-in my-1 ml-[5px] flex flex-col gap-2 border-l-2 pl-3.5">
          {[
            ["输入", call.input],
            ["输出", call.state === "success" ? call.output : "—"],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="text-ink-3 text-tau-tiny mb-1">{title}</p>
              <pre className="font-tau-mono bg-page border-line-1 rounded-tau-sm overflow-x-auto border px-2.5 py-1.5 text-[12px] whitespace-pre-wrap">
                {body}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Ref({ children }: { children: string }) {
  return (
    <span className="text-accent-text underline decoration-dotted underline-offset-[3px]">
      {children}
    </span>
  );
}

const P = "text-tau-body animate-doc-in leading-[1.8]";

function ReadScenario({ stage }: { stage: Stage }) {
  const search: ToolCall = {
    name: "search_knowledge",
    state: stage === "running" ? "executing" : "success",
    seconds: "820 毫秒",
    input: '{ "query": "专注 注意力 深度工作", "types": ["card", "excerpt"] }',
    output:
      "8 条结果：专注是可以练习的能力（卡片）、注意力残留（卡片）、《Deep Work》第 2 章划线……",
  };
  return (
    <>
      <p className={P}>我在你的卡片和读书划线里找一下。</p>
      <ToolRow call={search} />
      {stage !== "running" && (
        <div className={cn(P, "mt-2")}>
          <p>你的笔记里主要有三个观点：</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>
              专注是可以练习的能力，不是天赋（<Ref>专注是可以练习的能力</Ref>
              ）；
            </li>
            <li>
              切换任务后注意力会残留在上一件事上（<Ref>注意力残留</Ref>）；
            </li>
            <li>
              忙碌常是浅层工作带来的虚假满足（
              <Ref>《Deep Work》第 2 章划线</Ref>）。
            </li>
          </ol>
        </div>
      )}
    </>
  );
}

function EditScenario({ stage, setStage }: { stage: Stage; setStage: (stage: Stage) => void }) {
  const [view, setView] = useState<"diff" | "full">("diff");
  const call: ToolCall = {
    name: "replace_content_by_text",
    // 审阅卡等你处理期间，工具仍在执行中
    state: stage === "running" || stage === "waiting" ? "executing" : "success",
    seconds: "1.4 秒",
    input: '{ "searchText": "很多时候我们以为自己在工作……", "replaceText": "忙碌不等于产出……" }',
    output: stage === "denied" ? "已拒绝这次修改。" : "已确认应用这次修改。",
  };
  return (
    <>
      <p className={P}>先看一下你正在编辑的《Deep Work 读书笔记》，再改第二段。</p>
      <ToolRow call={call} />
      {stage !== "running" && (
        <div className="border-line-1 bg-surface rounded-tau-md animate-doc-in my-2 overflow-hidden border">
          <div className="px-3.5 pt-3 pb-1">
            <p className="text-tau-title font-semibold">
              {stage === "waiting" ? "请确认这次修改" : "内容修改结果"}
            </p>
            {stage === "waiting" ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStage("done")}
                  className="bg-accent text-ink-inverse hover:bg-accent-hover h-7 rounded-[8px] px-3 text-[12.5px] font-medium"
                >
                  确认应用
                </button>
                <span className="border-line-1 text-ink-2 grid h-7 place-items-center rounded-[8px] border px-3 text-[12.5px]">
                  提修改意见
                </span>
                <button
                  type="button"
                  onClick={() => setStage("denied")}
                  className="bg-danger-soft text-danger h-7 rounded-[8px] px-3 text-[12.5px]"
                >
                  拒绝
                </button>
              </div>
            ) : (
              <div className="bg-hover rounded-tau-sm mt-2.5 flex items-center gap-2.5 px-3 py-2">
                {stage === "done" ? (
                  <CircleCheck className="text-ok size-4" strokeWidth={1.75} />
                ) : (
                  <X className="text-ink-3 size-4" strokeWidth={1.75} />
                )}
                <span className="text-tau-body font-medium">
                  {stage === "done" ? "已应用" : "已拒绝"}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2.5 px-3.5 pt-2 pb-3.5">
            <div className="bg-hover text-ink-2 text-tau-meta rounded-tau-sm flex h-9 items-center gap-2 pr-1 pl-3">
              <span className="text-ink-1 flex items-center gap-1.5 font-medium">
                <PencilLine className="text-ink-2 size-3.5" strokeWidth={1.75} />
                已修改 1 处
              </span>
              <span className="text-ink-3">·</span>
              <span className="text-ok font-medium tabular-nums">+28</span>
              <span className="text-danger font-medium tabular-nums">-61</span>
              {stage === "done" && (
                <span
                  title="撤销这次应用"
                  className="text-ink-2 ml-auto grid size-[26px] place-items-center rounded-[7px]"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.75} />
                </span>
              )}
            </div>
            <div className="bg-hover inline-flex rounded-[8px] p-0.5 text-[12px]">
              {(
                [
                  ["diff", "改动高亮"],
                  ["full", "完整内容"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    "h-6 rounded-[6px] px-2.5",
                    view === key ? "bg-surface text-ink-1 shadow-card font-medium" : "text-ink-2"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="border-line-1 rounded-tau-sm border px-3 py-2.5 text-[13px] leading-[1.8]">
              {view === "diff" ? (
                <>
                  <span className="bg-danger-soft text-danger rounded-[3px] line-through">
                    很多时候我们以为自己在工作，其实只是在回邮件、开会和刷消息，这些事情让人感觉很忙，却很少真正推进什么。
                  </span>
                  <span className="bg-ok-soft text-ok rounded-[3px]">
                    忙碌不等于产出：回邮件、开会、刷消息让人觉得在工作，却很少推进真正的事。
                  </span>
                </>
              ) : (
                "忙碌不等于产出：回邮件、开会、刷消息让人觉得在工作，却很少推进真正的事。"
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TodoScenario({ stage, setStage }: { stage: Stage; setStage: (stage: Stage) => void }) {
  const call: ToolCall = {
    name: "create_todo",
    state:
      stage === "running"
        ? "executing"
        : stage === "waiting"
          ? "awaiting"
          : stage === "denied"
            ? "denied"
            : "success",
    seconds: "310 毫秒",
    input:
      '{ "items": [{ "todo": { "title": "写第三季度复盘", "dueAt": "明天 15:00", "reminderAt": "明天 15:00" } }] }',
    output: "已完成 · 写第三季度复盘",
  };
  return (
    <>
      <p className={P}>好的，我加一条明天 15:00 的待办，并在那时提醒你。</p>
      <ToolRow call={call} />
      {stage === "waiting" && (
        <div className="bg-warn-soft rounded-tau-md animate-doc-in mt-1 mb-1 ml-5 px-3 py-2.5">
          <p className="text-tau-meta flex items-center gap-2">
            <ShieldAlert className="text-warn size-4" strokeWidth={1.75} />
            <span>
              AI 想要<b className="font-semibold">修改内容</b>，需要你确认
            </span>
          </p>
          <pre className="font-tau-mono bg-surface rounded-tau-sm mt-2 overflow-x-auto px-2.5 py-1.5 text-[12px] leading-[1.6] whitespace-pre-wrap">
            {
              '{\n  "title": "写第三季度复盘",\n  "dueAt": "明天 15:00",\n  "reminderAt": "明天 15:00"\n}'
            }
          </pre>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStage("done")}
              className="bg-accent text-ink-inverse hover:bg-accent-hover h-7 rounded-[8px] px-3 text-[12.5px] font-medium"
            >
              允许
            </button>
            <button
              type="button"
              onClick={() => setStage("done")}
              className="bg-surface border-line-1 hover:bg-hover h-7 rounded-[8px] border px-3 text-[12.5px]"
            >
              本会话始终允许
            </button>
            <button
              type="button"
              onClick={() => setStage("denied")}
              className="text-ink-2 hover:bg-hover h-7 rounded-[8px] px-3 text-[12.5px]"
            >
              拒绝
            </button>
          </div>
        </div>
      )}
      {stage === "done" && (
        <>
          <div className="border-line-1 bg-surface rounded-tau-md animate-doc-in my-2 border px-3.5 py-3">
            <p className="text-tau-body font-medium">操作结果</p>
            <div className="text-tau-sm text-ink-2 mt-1.5 flex items-center justify-between">
              <span>已完成 · 写第三季度复盘</span>
              <span className="text-ink-2 hover:bg-hover rounded-[7px] px-2 py-0.5">撤销</span>
            </div>
            <p className="text-tau-sm text-ink-3 mt-0.5">新增 1 项待办</p>
          </div>
          <p className={P}>加好了，明天 15:00 会提醒你。它也会出现在日程的明天这一格里。</p>
        </>
      )}
      {stage === "denied" && <p className={cn(P, "mt-2")}>好的，这条待办我先不加了。</p>}
    </>
  );
}

export default function ChatDemo() {
  const [scenario, setScenario] = useState<ScenarioKey | null>(null);
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    if (stage !== "running") return;
    const next: Stage = scenario === "read" ? "done" : "waiting";
    const timer = setTimeout(() => setStage(next), 1300);
    return () => clearTimeout(timer);
  }, [stage, scenario]);

  const start = (key: ScenarioKey) => {
    setScenario(key);
    setStage("running");
  };

  return (
    <AppWindow active="chat" crumb="AI 对话" height={470}>
      <div className="flex h-full flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 pr-3 pl-5">
          <span className="text-tau-body font-medium">
            {scenario ? PROMPTS[scenario].slice(0, 12) : "新对话"}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            title="新对话"
            aria-label="新对话"
            onClick={() => {
              setScenario(null);
              setStage("idle");
            }}
            className="text-ink-2 hover:bg-hover grid size-7 place-items-center rounded-[8px]"
          >
            <SquarePen className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[600px] px-5 pb-4">
            {!scenario ? (
              <div className="flex flex-col items-center pt-12 text-center">
                <p className="text-tau-title-lg font-semibold">想聊点什么？</p>
                <p className="text-ink-3 text-tau-meta mt-2">点一句试试</p>
                <div className="mt-4 flex w-full max-w-[380px] flex-col gap-2">
                  {(Object.keys(PROMPTS) as ScenarioKey[]).map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => start(key)}
                      className="border-line-1 hover:bg-hover hover:border-ink-3 rounded-[12px] border px-3.5 py-2.5 text-left text-[13.5px] transition-colors"
                    >
                      {PROMPTS[key]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-accent/[0.18] animate-doc-in mt-3 ml-auto w-fit max-w-[82%] rounded-[14px_14px_4px_14px] px-3.5 py-2 text-[14px]">
                  {PROMPTS[scenario]}
                </div>
                <div className="mt-4 flex flex-col gap-1">
                  {scenario === "read" && <ReadScenario stage={stage} />}
                  {scenario === "edit" && <EditScenario stage={stage} setStage={setStage} />}
                  {scenario === "todo" && <TodoScenario stage={stage} setStage={setStage} />}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[600px] shrink-0 px-5 pb-4">
          <div className="border-line-1 rounded-[16px] border px-3.5 pt-3 pr-2.5 pb-2.5">
            <p className="text-ink-3 text-[14px]">输入消息，Ctrl/Command + Enter 进行发送</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-ink-2 text-tau-tiny flex items-center gap-1">
                <ShieldCheck className="size-3.5" strokeWidth={1.75} />
                手动确认
              </span>
              <span className="text-ink-3 text-tau-tiny">· 细致推演</span>
              <span className="flex-1" />
              <span className="bg-ink-3 text-ink-inverse grid size-[30px] place-items-center rounded-[10px]">
                <ArrowUp className="size-4" strokeWidth={2} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
