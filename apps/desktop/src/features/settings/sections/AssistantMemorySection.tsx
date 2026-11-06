import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Panel, PanelTitle } from "@tau/ui";
import { useSettingsStore } from "@/app/settingsStore";
import { assistantMemoryRequest } from "@/commands/assistant-memory";
import { on } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { queryClient } from "@/queryClient";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import useSettingStore from "@/stores/useSettingStore";
import {
  MEMORY_KINDS,
  type AssistantMemory,
  type AssistantMemoryStatus,
  type MemoryCorrection,
  type MemoryEvidence,
  type MemoryKind,
  type MemorySearch,
  type MemorySearchResult,
} from "@/types/assistant-memory";

const KEY = "assistant-memory";
const KIND_LABEL: Record<MemoryKind, string> = {
  event: "经历",
  fact: "事实",
  preference: "偏好",
  routine: "做事方法",
  intention: "计划",
};
const STATE_LABEL = { current: "当前", history: "历史", observation: "待确认" } as const;
const FIELD =
  "bg-surface text-ink-1 border-line-1 rounded-tau-sm text-tau-body w-full border px-2.5 py-1.5";

on("assistant-memory:changed", () => {
  void queryClient.invalidateQueries({ queryKey: [KEY] });
});

async function openEvidence(ref: MemoryEvidence) {
  useSettingsStore.getState().closeSettings();
  if (ref.kind === "chat") return openPage("chat", { id: ref.id, entry: ref.messageId });
  if (ref.kind === "todo") return openPage("todos", { selectedId: ref.id });
  if (ref.kind === "calendar") return openPage("schedule", { eventId: Number(ref.id) });
  if (ref.target)
    return openEntity(
      ref.target,
      ref.block === undefined ? undefined : { at: { block: ref.block } }
    );
}

export function AssistantMemorySection() {
  const database = useSettingStore(s => s.setting.database.active);
  const open = useSettingsStore(s => s.open);
  const connected = useDatabaseConnected();
  return <MemoryPanel key={database} database={database} enabled={connected && open} />;
}

function MemoryPanel({ database, enabled }: { database: string; enabled: boolean }) {
  const cache = useQueryClient();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<MemorySearch["state"]>("all");
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const status = useQuery({
    queryKey: [KEY, database, "status"],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: () => assistantMemoryRequest<AssistantMemoryStatus>("status"),
  });
  const list = useQuery({
    queryKey: [KEY, database, "list", query, state, before],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: () =>
      assistantMemoryRequest<MemorySearchResult>("search", { query, state, before, limit: 12 }),
  });
  const refresh = () => cache.invalidateQueries({ queryKey: [KEY, database] });
  const retry = useMutation({
    mutationFn: () => assistantMemoryRequest("retry"),
    onSuccess: refresh,
  });
  const error = status.error ?? list.error ?? retry.error;

  return (
    <div className="space-y-4">
      <Panel variant="outline" pad="compact">
        <PanelTitle>后台整理</PanelTitle>
        <p className="text-ink-2 text-tau-meta">
          {status.data?.configured
            ? `${status.data.running ? "正在处理" : status.data.scanning ? "等待后台补录" : "已就绪"} · 已检查 ${status.data.checked} 个来源 · 待处理 ${status.data.pending} 个`
            : "在大语言模型设置中分配「个人助手记忆」模型，开启自动整理和聊天召回。"}
        </p>
        {status.data?.lastDreamAt && (
          <p className="text-ink-3 text-tau-meta">
            最近整理 · {new Date(status.data.lastDreamAt).toLocaleString("zh-CN")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => useSettingsStore.setState({ section: "llm", llmTab: "assignment" })}
          >
            配置模型
          </Button>
          {!!status.data?.failed && (
            <Button
              size="sm"
              variant="secondary"
              disabled={!status.data.configured || retry.isPending}
              onClick={() => retry.mutate()}
            >
              重试 {status.data.failed} 个失败来源
            </Button>
          )}
        </div>
      </Panel>
      <div className="flex gap-2">
        <input
          className={FIELD}
          aria-label="搜索记忆"
          placeholder="搜索记忆"
          maxLength={240}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setCursors([]);
          }}
        />
        <select
          className={FIELD + " max-w-32"}
          aria-label="记忆状态"
          value={state}
          onChange={e => {
            setState(e.target.value as MemorySearch["state"]);
            setCursors([]);
          }}
        >
          <option value="all">全部状态</option>
          {Object.entries(STATE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-tau-meta text-danger">
          {error.message}
        </p>
      )}
      {list.data && list.data.memories.length === 0 && (
        <p className="text-ink-2 text-tau-meta">没有找到记忆</p>
      )}
      {list.data?.memories.map(item => (
        <MemoryRow key={item.id} item={item} refresh={refresh} />
      ))}
      {(before !== undefined || list.data?.nextBefore) && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={before === undefined}
            onClick={() => setCursors(old => old.slice(0, -1))}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!list.data?.nextBefore}
            onClick={() => {
              const cursor = list.data?.nextBefore;
              if (cursor) setCursors(old => [...old, cursor]);
            }}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}

function MemoryRow({ item, refresh }: { item: AssistantMemory; refresh: () => Promise<unknown> }) {
  const [draft, setDraft] = useState<MemoryCorrection>();
  const [forget, setForget] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const save = useMutation({
    mutationFn: (input: MemoryCorrection) => assistantMemoryRequest("correct", item.id, input),
    onSuccess: async result => {
      if (!result) throw new Error("记忆已不存在，请刷新");
      setDraft(undefined);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => assistantMemoryRequest("forget", item.id),
    onSuccess: refresh,
  });
  const error = save.error ?? remove.error;
  return (
    <Panel variant="outline" pad="compact">
      <PanelTitle>{item.topic}</PanelTitle>
      <p className="text-ink-3 text-tau-meta">
        {KIND_LABEL[item.kind]} · {STATE_LABEL[item.state]}
        {item.manual ? " · 已手动更正" : ""}
      </p>
      {draft ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={e => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <input
            className={FIELD}
            aria-label="记忆主题"
            maxLength={80}
            required
            value={draft.topic}
            onChange={e => setDraft({ ...draft, topic: e.target.value })}
          />
          <textarea
            className={FIELD}
            aria-label="记忆内容"
            maxLength={360}
            required
            value={draft.text}
            onChange={e => setDraft({ ...draft, text: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <select
              className={FIELD}
              aria-label="记忆类别"
              value={draft.kind}
              onChange={e => setDraft({ ...draft, kind: e.target.value as MemoryKind })}
            >
              {MEMORY_KINDS.map(kind => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
            <select
              className={FIELD}
              aria-label="生效状态"
              value={draft.state}
              onChange={e =>
                setDraft({ ...draft, state: e.target.value as MemoryCorrection["state"] })
              }
            >
              {Object.entries(STATE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={save.isPending}>
              保存
            </Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setDraft(undefined)}>
              取消
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-tau-body text-ink-1 my-2 break-words">{item.text}</p>
          {item.evidence.length > 0 && (
            <ul className="my-2 space-y-1">
              {item.evidence.map(ref => (
                <li key={JSON.stringify([ref.kind, ref.id, ref.anchor, ref.quote])}>
                  <button
                    className="text-accent-text text-tau-meta text-left break-words hover:underline"
                    onClick={() => {
                      setSourceError(false);
                      void openEvidence(ref).catch(() => setSourceError(true));
                    }}
                  >
                    {item.manual ? "原记忆出处" : "查看出处"} · {ref.title || ref.kind} ·{" "}
                    {ref.quote}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setDraft({ kind: item.kind, topic: item.topic, text: item.text, state: item.state })
              }
            >
              更正
            </Button>
            {forget ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  确认忘记
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={remove.isPending}
                  onClick={() => setForget(false)}
                >
                  取消
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setForget(true)}>
                忘记
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-danger text-tau-meta mt-2">
          {error.message}
        </p>
      )}
      {sourceError && (
        <p role="alert" className="text-danger text-tau-meta mt-2">
          来源暂不可打开
        </p>
      )}
    </Panel>
  );
}
