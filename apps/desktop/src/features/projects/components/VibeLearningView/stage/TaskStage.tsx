/**
 * 阅读区 · 生成过程：一次生成任务的执行过程与输出中间态。
 * 推理、工具调用沿用对话的淡墨折叠行；输出按类型实时呈现（文档直接渲染、导图实时出图、
 * 测验逐题出现、HTML 看源码尾部、播客先脚本后合成进度）；底部计数条的数字在涨就是在干活。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, RotateCw, Square } from "lucide-react";
import { useThrottle } from "ahooks";
import { Button, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import {
  ReasoningBlock,
  ToolCallBlock,
  formatElapsed,
  useChatMarkdownComponents,
} from "@/components/ChatUI";
import useTheme from "@/hooks/useTheme";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import MarkdownRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownRenderer";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { GENERATE_APPS, NOTE_ICONS } from "../appMeta";
import { cancelVLTask, retryVLTask } from "../tasks/runner";
import type { VLTask, VLTaskKind, VLTaskTurn } from "../tasks/store";
import { StageHeader } from "./StageHeader";

const DOC_KINDS: VLTaskKind[] = ["outline", "highlights", "article"];
const HTML_KINDS: VLTaskKind[] = ["ppt", "report", "ppt_edit", "report_edit"];

const kindLabel = (kind: VLTaskKind) =>
  kind === "ppt_edit" || kind === "report_edit"
    ? "AI 编辑"
    : (GENERATE_APPS.find(a => a.key === kind)?.label ?? "生成");

const kindIcon = (kind: VLTaskKind) =>
  kind === "ppt_edit"
    ? NOTE_ICONS.ppt
    : kind === "report_edit"
      ? NOTE_ICONS.report
      : (GENERATE_APPS.find(a => a.key === kind)?.icon ?? FileText);

const fmt = (n: number) => n.toLocaleString("zh-CN");

/** 运行中每秒刷新的计时 */
function useElapsed(task: VLTask) {
  const [now, setNow] = useState(() => Date.now());
  const running = task.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return (task.finishedAt ?? now) - task.startedAt;
}

function Markdown({ text, className }: { text: string; className?: string }) {
  const { isDark } = useTheme();
  const components = useChatMarkdownComponents({ isDark, idPrefix: "vl-task" });
  return (
    <div className={className}>
      <MarkdownProvider isDark={isDark} isVisible>
        <MarkdownRenderer content={text} markdownComponents={components} shouldRender />
      </MarkdownProvider>
    </div>
  );
}

/** 输出区的小标题：「正在写」时带一个呼吸点 */
function OutputTitle({ running, children }: { running: boolean; children: ReactNode }) {
  return (
    <div className="text-tau-sm text-ink-3 mb-2 mt-5 flex items-center gap-1.5">
      {running && <span className="bg-accent size-1.5 animate-pulse rounded-full" />}
      {children}
    </div>
  );
}

/** 按产物类型呈现输出的中间态 */
function OutputView({ task }: { task: VLTask }) {
  const running = task.status === "running";
  // 导图 / 代码尾部重绘成本高，节流到 0.6s
  const throttled = useThrottle(task.output, { wait: 600 });
  const output = running && !DOC_KINDS.includes(task.kind) ? throttled : task.output;

  if (task.kind === "quiz") {
    const prompts = task.quizPrompts ?? [];
    if (prompts.length === 0 && !task.output) return null;
    return (
      <>
        <OutputTitle running={running}>
          {running ? `已出 ${prompts.length} 题，还在写…` : `共 ${prompts.length} 题`}
        </OutputTitle>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {prompts.map((prompt, i) => (
            <li key={i} className="text-tau-body text-ink-1 flex gap-3 leading-relaxed">
              <span className="text-ink-3 w-6 shrink-0 text-right tabular-nums">{i + 1}.</span>
              <span className="min-w-0">{prompt || "（题干为空）"}</span>
            </li>
          ))}
        </ol>
      </>
    );
  }

  if (!output) return null;

  if (DOC_KINDS.includes(task.kind)) {
    return <Markdown text={output} className="text-tau-body-lg text-ink-1 mt-4 leading-[1.85]" />;
  }

  if (task.kind === "mindmap") {
    return (
      <>
        <OutputTitle running={running}>导图</OutputTitle>
        <div className="border-line-1 rounded-tau-md h-[420px] overflow-hidden border">
          <ErrorBoundary>
            <MindMapRenderer code={output} fillContainer />
          </ErrorBoundary>
        </div>
      </>
    );
  }

  if (HTML_KINDS.includes(task.kind)) {
    const lines = output.split("\n");
    const tail = lines.slice(-18).join("\n");
    return (
      <>
        <OutputTitle running={running}>
          HTML 源码 · {fmt(lines.length)} 行{running ? "（显示最新部分）" : ""}
        </OutputTitle>
        <pre className="border-line-1 rounded-tau-md font-tau-mono text-ink-2 relative m-0 max-h-[360px] overflow-hidden whitespace-pre-wrap break-all border px-3.5 py-3 text-[12px] leading-[1.65] [mask-image:linear-gradient(to_bottom,transparent,black_48px)]">
          {tail}
        </pre>
      </>
    );
  }

  if (task.kind === "podcast") {
    const rows = output
      .split("\n")
      .map(line => line.match(/^([^:：]{1,20})[：:]\s*(.+)$/))
      .filter((m): m is RegExpMatchArray => !!m);
    return (
      <>
        <OutputTitle running={running && !task.progress}>脚本 · {rows.length} 句</OutputTitle>
        <div className="flex flex-col gap-2">
          {rows.map((m, i) => (
            <p key={i} className="text-tau-body m-0 leading-relaxed">
              <span className="text-ink-1 font-semibold">{m[1].trim()}</span>
              <span className="text-ink-3">：</span>
              <span className="text-ink-2">{m[2]}</span>
            </p>
          ))}
        </div>
        {task.progress && (
          <div className="mt-5">
            <div className="text-tau-sm text-ink-2 mb-1.5 flex justify-between">
              <span>{task.phase}</span>
              <span className="tabular-nums">
                {task.progress.done} / {task.progress.total}
              </span>
            </div>
            <div className="bg-hover h-1 overflow-hidden rounded-full">
              <div
                className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-300"
                style={{ width: `${(task.progress.done / task.progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

/** 一轮的过程：推理 → 工具调用 → 过渡性正文（最后一轮的正文算产物，交给 OutputView） */
function TurnView({ turn, isOutputTurn }: { turn: VLTaskTurn; isOutputTurn: boolean }) {
  const { isDark } = useTheme();
  return (
    <>
      {turn.reasoning && (
        <ReasoningBlock startTime={turn.reasoningStart} endTime={turn.reasoningEnd}>
          <Markdown text={turn.reasoning} className="text-tau-meta" />
        </ReasoningBlock>
      )}
      {turn.tools.map(execution => (
        <ToolCallBlock key={execution.toolCallId} execution={execution} isDark={isDark} />
      ))}
      {!isOutputTurn && turn.text && (
        <Markdown text={turn.text} className="text-tau-meta text-ink-2 my-1.5" />
      )}
    </>
  );
}

/** 底部计数条：状态点 + 阶段 + 字数 + token + 用时 */
function LiveBar({ task, elapsed }: { task: VLTask; elapsed: number }) {
  const running = task.status === "running";
  const reasoningChars = task.turns.reduce((n, t) => n + t.reasoning.length, 0);
  const parts = [
    task.output.length > 0 && `已写 ${fmt(task.output.length)} 字`,
    task.output.length === 0 && reasoningChars > 0 && `思考 ${fmt(reasoningChars)} 字`,
    task.outputTokens > 0 && `${fmt(task.outputTokens)} tokens`,
    formatElapsed(elapsed),
  ].filter(Boolean);
  return (
    <div className="text-tau-sm flex h-[40px] shrink-0 items-center gap-2 px-5">
      <span
        className={cn(
          "size-2 rounded-full",
          running
            ? "bg-accent animate-pulse"
            : task.status === "succeeded"
              ? "bg-ok"
              : task.status === "failed"
                ? "bg-danger"
                : "bg-ink-3"
        )}
      />
      <span className={cn(task.status === "failed" ? "text-danger" : "text-ink-1")}>
        {task.phase}
      </span>
      <span className="text-ink-3 tabular-nums">{parts.join(" · ")}</span>
    </div>
  );
}

interface TaskStageProps {
  task: VLTask;
  chatOpen: boolean;
  onToggleChat: () => void;
  onClose: () => void;
  /** 有可看的产物时：切回产物本身 */
  onShowProduct?: () => void;
  /** 测验完成后直接开始 */
  onStartQuiz?: () => void;
}

export function TaskStage({
  task,
  chatOpen,
  onToggleChat,
  onClose,
  onShowProduct,
  onStartQuiz,
}: TaskStageProps) {
  const Icon = kindIcon(task.kind);
  const elapsed = useElapsed(task);
  const running = task.status === "running";
  const lastTurn = task.turns[task.turns.length - 1];
  const outputTurnId = lastTurn && lastTurn.tools.length === 0 ? lastTurn.id : null;
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  // 运行中贴底跟随（用户往上翻就不打扰）
  const stick = useRef(true);
  useEffect(() => {
    if (!scrollEl) return;
    const onScroll = () => {
      stick.current = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 80;
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [scrollEl, stick]);
  useEffect(() => {
    if (running && scrollEl && stick.current) scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  const retry = () => void retryVLTask(task.id).catch(e => toast.error((e as Error).message));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StageHeader
        icon={<Icon className="size-4" strokeWidth={1.75} />}
        title={task.title}
        meta={`${kindLabel(task.kind)} · 生成过程`}
        chatOpen={chatOpen}
        onToggleChat={onToggleChat}
        onClose={onClose}
        actions={
          <>
            {running && (
              <Button variant="ghost" size="sm" icon={Square} onClick={() => cancelVLTask(task.id)}>
                停止
              </Button>
            )}
            {(task.status === "failed" || task.status === "cancelled") && (
              <Button variant="ghost" size="sm" icon={RotateCw} onClick={retry}>
                重新生成
              </Button>
            )}
            {task.status === "succeeded" && onStartQuiz && (
              <Button variant="soft" size="sm" onClick={onStartQuiz}>
                开始测验
              </Button>
            )}
            {!running && onShowProduct && (
              <Button variant="soft" size="sm" onClick={onShowProduct}>
                查看{task.kind === "quiz" ? "测验" : "产物"}
              </Button>
            )}
          </>
        }
      />
      <FadeScroll scrollRef={setScrollEl} className="min-h-0 flex-1">
        <div className="mx-auto max-w-[760px] px-10 pb-10 pt-1">
          <p className="text-tau-sm text-ink-3 m-0 mb-3 leading-relaxed">
            基于 {task.resourceNames.length > 0 ? task.resourceNames.join("、") : "已有内容"}
            {task.userPrompt && <span className="text-ink-2"> · 要求：{task.userPrompt}</span>}
          </p>
          {task.turns.length === 0 && running && (
            <p className="text-tau-meta text-ink-3 m-0">正在连接模型…</p>
          )}
          {task.turns.map(turn => (
            <TurnView key={turn.id} turn={turn} isOutputTurn={turn.id === outputTurnId} />
          ))}
          <OutputView task={task} />
          {task.error && (
            <div className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm mt-5 px-4 py-2.5">
              {task.error}
            </div>
          )}
        </div>
      </FadeScroll>
      <LiveBar task={task} elapsed={elapsed} />
    </div>
  );
}
