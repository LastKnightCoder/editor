import { useMemo, useState } from "react";
import { CheckCircle, ChevronDown, Copy, Loader2, XCircle } from "lucide-react";
import type { ToolCallCustomRendererProps } from "./types";

const CODEX_COMMAND_RENDERER_KEY = "codex.command_execution";

const getRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getRenderPayload = (
  metadata?: Record<string, unknown>,
): Record<string, unknown> | null => {
  const render = getRecord(metadata?.render);
  if (render?.rendererKey !== CODEX_COMMAND_RENDERER_KEY) {
    return null;
  }
  return getRecord(render.payload);
};

const getStringValue = (
  record: Record<string, unknown> | null,
  keys: string[],
): string => {
  if (!record) {
    return "";
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
};

const formatInputFallback = (input: unknown) => {
  if (!input) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
};

const getCommandInfo = (
  execution: ToolCallCustomRendererProps["execution"],
  parsedInput: unknown,
) => {
  const metadata = execution.metadata || {};
  const payload = getRenderPayload(metadata);
  const parsedInputRecord = getRecord(parsedInput);
  const rawItem = getRecord(metadata.rawItem);
  const command =
    getStringValue(metadata, ["command"]) ||
    getStringValue(parsedInputRecord, ["command"]) ||
    getStringValue(payload, [
      "command",
      "cmd",
      "command_line",
      "commandLine",
      "shell_command",
      "shellCommand",
    ]) ||
    getStringValue(rawItem, [
      "command",
      "cmd",
      "command_line",
      "commandLine",
      "shell_command",
      "shellCommand",
    ]) ||
    formatInputFallback(parsedInput || execution.input);

  const cwd =
    getStringValue(parsedInputRecord, ["cwd", "workingDirectory"]) ||
    getStringValue(payload, ["cwd", "working_directory", "workingDirectory"]) ||
    getStringValue(rawItem, ["cwd", "working_directory", "workingDirectory"]);

  const shell =
    getStringValue(parsedInputRecord, ["shell"]) ||
    getStringValue(payload, ["shell"]) ||
    getStringValue(rawItem, ["shell"]);

  return { command, cwd, shell };
};

const getStatusLabel = (
  status: ToolCallCustomRendererProps["execution"]["status"],
) => {
  switch (status) {
    case "pending":
      return "等待执行";
    case "executing":
      return "执行中";
    case "success":
      return "已完成";
    case "failed":
      return "执行失败";
    case "retrying":
      return "重试中";
    case "cancelled":
      return "已取消";
  }
};

const CodexCommandExecutionRenderer = ({
  execution,
  isDark,
  parsedInput,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const payload = getRenderPayload(execution.metadata);
  const [expanded, setExpanded] = useState(execution.status !== "success");
  const [copied, setCopied] = useState(false);
  const commandInfo = useMemo(
    () => getCommandInfo(execution, parsedInput),
    [execution, parsedInput],
  );

  if (!payload) {
    return renderDefault();
  }

  const isRunning =
    execution.status === "executing" || execution.status === "retrying";
  const isFailed = execution.status === "failed";
  const statusClass = isFailed
    ? "text-rose-500"
    : isRunning
      ? "text-sky-500"
      : "text-emerald-500";
  const outputText = execution.output || execution.error || "无输出";

  const copyCommand = () => {
    if (!commandInfo.command) {
      return;
    }
    void navigator.clipboard?.writeText(commandInfo.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="my-3 w-full max-w-full min-w-0 animate-fadeIn">
      <button
        type="button"
        className={`flex max-w-full items-center gap-2 text-left text-sm font-medium transition ${
          isDark
            ? "text-slate-300 hover:text-slate-100"
            : "text-slate-500 hover:text-slate-800"
        }`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={`flex h-5 w-5 flex-none items-center justify-center ${statusClass}`}
        >
          {isRunning ? (
            <Loader2 size={15} className="animate-spin" />
          ) : isFailed ? (
            <XCircle size={15} />
          ) : (
            <CheckCircle size={15} />
          )}
        </span>
        <span className="truncate">
          {isRunning ? "正在运行命令" : "已运行命令"}
        </span>
        <span
          className={`truncate text-xs font-normal ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          {commandInfo.command || "未收到命令详情"}
        </span>
        <ChevronDown
          size={15}
          className={`flex-none transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div
          className={`relative mt-3 overflow-hidden rounded-xl px-4 pb-12 pt-3.5 ${
            isDark
              ? "bg-zinc-900/80 text-slate-200"
              : "bg-zinc-100 text-zinc-800"
          }`}
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={`mb-4 text-sm font-medium ${
                  isDark ? "text-slate-300" : "text-zinc-600"
                }`}
              >
                Shell
              </div>
              <pre className="m-0 whitespace-pre-wrap wrap-break-word font-mono text-sm leading-7">
                <span className={isDark ? "text-slate-500" : "text-zinc-500"}>
                  ${" "}
                </span>
                {commandInfo.command || "未收到命令详情"}
              </pre>
            </div>
            <button
              type="button"
              title={copied ? "已复制" : "复制命令"}
              className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-md transition ${
                isDark
                  ? "text-slate-500 hover:bg-white/10 hover:text-slate-200"
                  : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
              }`}
              onClick={copyCommand}
            >
              <Copy size={14} />
            </button>
          </div>

          <pre
            className={`m-0 max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-sm leading-7 ${
              outputText === "无输出"
                ? isDark
                  ? "text-slate-500"
                  : "text-zinc-500"
                : isDark
                  ? "text-slate-300"
                  : "text-zinc-700"
            }`}
          >
            {outputText}
          </pre>

          {(commandInfo.cwd || commandInfo.shell) && (
            <div
              className={`mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs ${
                isDark ? "text-slate-500" : "text-zinc-500"
              }`}
            >
              {commandInfo.cwd ? (
                <span className="font-mono">cwd: {commandInfo.cwd}</span>
              ) : null}
              {commandInfo.shell ? (
                <span className="font-mono">shell: {commandInfo.shell}</span>
              ) : null}
            </div>
          )}

          <div
            className={`absolute bottom-3 right-4 flex items-center gap-1 text-sm font-medium ${statusClass}`}
          >
            {isFailed ? (
              <XCircle size={15} />
            ) : isRunning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle size={15} />
            )}
            <span>{getStatusLabel(execution.status)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CodexCommandExecutionRenderer;
