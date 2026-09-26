/**
 * pi 会话开发面板：PiSessionHost 端到端验证（模型注册→会话装配→流式/工具/重试事件→abort/steer）。
 * 模型源为旧 llmConfigs 现场经 migrateLlmSettingsToV2 转换（store v2 上线后移除该桥接）。
 * M4 主聊天接入 session store 后本面板退役。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { usePiSessionStore } from "@/stores/usePiSessionStore";
import { migrateLlmSettingsToV2 } from "@/services/llmSettingsMigration";
import type { PiSessionVM, PiTranscriptItem } from "@/services/piSessionModel";

const TRANSCRIPT_ITEM_STYLE =
  "rounded-tau-md border border-line-2 bg-surface px-3 py-2 text-tau-sm";

const AssistantBlocks = ({ vm }: { vm: PiSessionVM }) => {
  const assistantItems = vm.transcript.filter(item => item.kind === "assistant");
  const last = assistantItems[assistantItems.length - 1];
  if (!last || last.kind !== "assistant") return null;
  return (
    <div className="space-y-1">
      {last.content.map((block, index) => {
        if (block.type === "thinking") {
          return (
            <details key={index} className="text-ink-3">
              <summary className="text-tau-xs cursor-pointer select-none">思考过程</summary>
              <pre className="text-tau-xs mt-1 whitespace-pre-wrap font-mono">
                {String(block.thinking ?? "")}
              </pre>
            </details>
          );
        }
        if (block.type === "toolCall") {
          return (
            <div
              key={index}
              className="rounded-tau-sm border-line-2 bg-accent-soft text-tau-xs border px-2 py-1 font-mono"
            >
              工具调用 {String(block.name ?? "")}(
              {JSON.stringify(block.arguments ?? {}).slice(0, 120)})
            </div>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {String(block.text ?? "")}
            {last.streaming && <span className="animate-pulse">▌</span>}
          </p>
        );
      })}
    </div>
  );
};

const ExecutionsPanel = ({ vm }: { vm: PiSessionVM }) => {
  if (vm.executions.length === 0) return null;
  return (
    <div className="space-y-1">
      {vm.executions.map(run => (
        <div
          key={run.toolCallId}
          className="rounded-tau-sm border-line-2 bg-page text-tau-xs border px-2 py-1 font-mono"
        >
          <span
            className={
              run.status === "error"
                ? "text-danger"
                : run.status === "running"
                  ? "text-accent-1"
                  : "text-ink-3"
            }
          >
            {run.status === "running" ? "▶" : run.status === "error" ? "✕" : "✓"}
          </span>{" "}
          {run.toolName} {run.argsPreview}
          {run.outputPreview && (
            <pre className="text-ink-3 mt-1 max-h-32 overflow-auto whitespace-pre-wrap">
              {run.outputPreview}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
};

const TranscriptItemView = ({ item }: { item: PiTranscriptItem }) => {
  if (item.kind === "user") {
    return <div className={`${TRANSCRIPT_ITEM_STYLE} ml-12 self-end`}>{item.text}</div>;
  }
  if (item.kind === "toolResult") {
    return (
      <div className={`${TRANSCRIPT_ITEM_STYLE} text-tau-xs text-ink-3 font-mono`}>
        {item.isError ? "✕" : "↳"} {item.toolName}: {item.contentText}
      </div>
    );
  }
  return null;
};

export const PiDevView = () => {
  const llmConfigs = useSettingStore(state => state.setting.llmConfigs);
  const { sessions, errors, ensureSession, sendText, steerText, abortSession, closeSession } =
    usePiSessionStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const bootstrappedRef = useRef(false);

  const providers = useMemo(
    // dev 面板只消费 providers；usage 槽位迁移与 store v2 上线一起接入
    () => migrateLlmSettingsToV2({ llmConfigs, llmUsageSettings: {} }).providers,
    [llmConfigs]
  );
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const activeProvider = providers.find(p => p.id === providerId) ?? providers[0];
  const activeModel =
    activeProvider?.models.find(m => m.id === modelId) ?? activeProvider?.models[0];

  const vm = sessionId ? sessions[sessionId] : undefined;
  const error = sessionId ? errors[sessionId] : undefined;

  const handleCreate = async () => {
    if (!activeProvider || !activeModel) return;
    const id = crypto.randomUUID();
    setSessionId(id);
    await ensureSession(id, {
      scope: "pi-dev",
      cwd: "",
      modelRef: { providerId: activeProvider.id, modelId: activeModel.id },
      persist: false,
    });
  };

  // 有可用模型时进入面板自动建会话，输入框即开即用
  useEffect(() => {
    if (bootstrappedRef.current || sessionId || !activeProvider || !activeModel) return;
    bootstrappedRef.current = true;
    void handleCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProvider?.id, activeModel?.id, sessionId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !sessionId) return;
    setInput("");
    if (vm?.status === "streaming") {
      await steerText(sessionId, text);
    } else {
      await sendText(sessionId, text);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <select
          className="rounded-tau-sm border-line-2 bg-surface text-tau-sm border px-2 py-1"
          value={activeProvider?.id ?? ""}
          onChange={e => {
            setProviderId(e.target.value);
            setModelId("");
          }}
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-tau-sm border-line-2 bg-surface text-tau-sm border px-2 py-1"
          value={activeModel?.id ?? ""}
          onChange={e => setModelId(e.target.value)}
        >
          {activeProvider?.models.map(m => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
            </option>
          ))}
        </select>
        {sessionId ? (
          <button
            className="rounded-tau-sm border-line-2 text-tau-sm hover:bg-accent-soft border px-2 py-1"
            onClick={() => {
              void closeSession(sessionId);
              setSessionId(null);
            }}
          >
            关闭会话
          </button>
        ) : (
          <button
            className="rounded-tau-sm bg-accent-1 text-tau-sm text-accent-contrast px-3 py-1 disabled:opacity-50"
            disabled={!activeProvider || !activeModel}
            onClick={() => void handleCreate()}
          >
            新建会话
          </button>
        )}
        {providers.length === 0 && (
          <span className="text-tau-xs text-ink-3">设置里没有可用的大模型配置</span>
        )}
      </div>

      {error && (
        <div className="rounded-tau-sm border-danger bg-accent-soft text-tau-sm text-danger flex items-center gap-2 border px-3 py-2">
          <span className="flex-1">{error}</span>
          <button
            className="rounded-tau-sm border-line-2 hover:bg-accent-soft border px-2 py-0.5"
            onClick={() => {
              if (sessionId) void closeSession(sessionId);
              setSessionId(null);
              bootstrappedRef.current = false;
            }}
          >
            重试
          </button>
        </div>
      )}
      {vm?.retrying && (
        <div className="text-tau-xs text-ink-3">
          自动重试 {vm.retrying.attempt}/{vm.retrying.maxAttempts}…
        </div>
      )}
      {vm?.lastError && (
        <div className="rounded-tau-sm border-danger bg-accent-soft text-tau-sm text-danger border px-3 py-2">
          模型返回错误：{vm.lastError}
        </div>
      )}
      {vm &&
        vm.status === "streaming" &&
        !vm.transcript.some(item => item.kind === "assistant" && item.content.length > 0) && (
          <div className="text-tau-xs text-ink-3">等待模型响应…</div>
        )}
      {vm && (vm.queuedInput.steering.length > 0 || vm.queuedInput.followUp.length > 0) && (
        <div className="text-tau-xs text-ink-3">
          排队中：
          {[
            ...vm.queuedInput.steering.map(t => `插话「${t}」`),
            ...vm.queuedInput.followUp.map(t => `追问「${t}」`),
          ].join("、")}
        </div>
      )}

      <div className="rounded-tau-md border-line-2 bg-page flex-1 space-y-2 overflow-auto border p-3">
        {vm?.transcript
          .filter(item => item.kind !== "assistant")
          .map(item => (
            <TranscriptItemView key={item.seq} item={item} />
          ))}
        {vm && (
          <div className={`${TRANSCRIPT_ITEM_STYLE} mr-12`}>
            <AssistantBlocks vm={vm} />
          </div>
        )}
        {vm && <ExecutionsPanel vm={vm} />}
        {vm && vm.transcript.length === 0 && vm.executions.length === 0 && (
          <div className="text-tau-xs text-ink-3">新建会话后发送消息，验证流式输出与工具执行。</div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          autoFocus
          className="rounded-tau-sm border-line-2 bg-surface text-tau-sm flex-1 border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder={vm?.status === "streaming" ? "会话进行中：Enter 插话（steer）" : "发送消息"}
          value={input}
          disabled={!sessionId}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleSend();
          }}
        />
        <button
          className="rounded-tau-sm border-line-2 text-tau-sm hover:bg-accent-soft border px-3 py-2"
          disabled={!sessionId || vm?.status !== "streaming"}
          onClick={() => sessionId && void abortSession(sessionId)}
        >
          停止
        </button>
        <button
          className="rounded-tau-sm bg-accent-1 text-tau-sm text-accent-contrast px-3 py-2 disabled:opacity-50"
          disabled={!sessionId || !input.trim()}
          onClick={() => void handleSend()}
        >
          {vm?.status === "streaming" ? "插话" : "发送"}
        </button>
      </div>
    </div>
  );
};
