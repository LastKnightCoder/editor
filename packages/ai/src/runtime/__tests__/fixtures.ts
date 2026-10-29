import type { Model } from "@earendil-works/pi-ai";
import { AiError, type AiRunStartRequest, type AiSessionRow } from "../../contracts";
import {
  appendSessionEntries,
  createSessionFile,
  parseSessionFile,
  serializeSessionFile,
  type SessionDocument,
  type SessionEntry,
} from "../../session";
import type { AiResolvedModel, AiSessionStore, AiStoredSession } from "../types";

export const session = { databaseName: "validation.db", sessionId: "session-1" };
export const row: AiSessionRow = {
  id: session.sessionId,
  scope: "main-chat",
  domainRef: null,
  sessionFile: "validation_session-1.jsonl",
  cwd: "",
  title: "验证",
  titleDirty: false,
  groupId: null,
  orderNum: null,
  archived: false,
  source: "mobile",
  messageCount: 0,
  createTime: 1,
  updateTime: 1,
};
export const model: Model<"openai-completions"> = {
  id: "validation-model",
  name: "验证模型",
  api: "openai-completions",
  provider: "validation",
  baseUrl: "https://validation.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 16000,
  maxTokens: 1000,
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function memoryStore(
  options: {
    document?: SessionDocument;
    rejectAppend?: (entries: SessionEntry[]) => boolean;
    beforeAppend?: (entries: SessionEntry[]) => Promise<void>;
  } = {}
) {
  let document = options.document ?? createSessionFile({ id: session.sessionId });
  let revision = "revision-0";
  let counter = 0;
  let active = false;
  let releases = 0;
  const commits: SessionEntry[][] = [];
  const operations = new Map<string, AiStoredSession>();
  const read = (): AiStoredSession => ({
    document: structuredClone(document),
    row: { ...row },
    revision,
  });
  const store: AiSessionStore = {
    async read() {
      return read();
    },
    async beginRun() {
      if (active) throw new AiError("AI_SESSION_BUSY", "会话已有租约");
      active = true;
      return async () => {
        active = false;
        releases++;
      };
    },
    async append(_ref, expectedRevision, entries, operationId) {
      const previous = operations.get(operationId);
      if (previous) return structuredClone(previous);
      if (revision !== expectedRevision)
        throw new AiError("AI_SESSION_REVISION_CONFLICT", "版本变化");
      await options.beforeAppend?.(entries);
      if (options.rejectAppend?.(entries)) throw new AiError("AI_STORAGE_FAILED", "模拟持久化失败");
      document = parseSessionFile(
        serializeSessionFile({ ...document, entries: [...document.entries, ...entries] })
      );
      revision = `revision-${++counter}`;
      commits.push(structuredClone(entries));
      const value = read();
      operations.set(operationId, value);
      return value;
    },
  };
  return { store, read, commits, releases: () => releases };
}

export type Turn =
  | { text: string }
  | { tool: string; args: Record<string, unknown>; callId?: string };
export function encodeTurn(turn: Turn) {
  const chunk = (delta: unknown, finish_reason: string | null = null) =>
    `data: ${JSON.stringify({
      id: "validation-chat",
      object: "chat.completion.chunk",
      created: 1,
      model: "validation-model",
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`;
  return (
    chunk({ role: "assistant" }) +
    ("text" in turn
      ? chunk({ content: turn.text }) + chunk({}, "stop")
      : chunk({
          tool_calls: [
            {
              index: 0,
              id: turn.callId ?? crypto.randomUUID(),
              type: "function",
              function: { name: turn.tool, arguments: "" },
            },
          ],
        }) +
        chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(turn.args) } }] }) +
        chunk({}, "tool_calls")) +
    "data: [DONE]\n\n"
  );
}

export function streamResponse(text: string) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) return controller.close();
        const end = Math.min(offset + 7, bytes.length);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
    }),
    { headers: { "content-type": "text/event-stream" } }
  );
}

export function network(
  turns: Turn[],
  beforeRequest?: (index: number, body: Record<string, unknown>) => void
) {
  const requests: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const index = requests.length;
    const body = JSON.parse(String(init?.body));
    beforeRequest?.(index, body);
    requests.push(body);
    if (!turns[index]) throw new Error("出现预期外的模型调用");
    return streamResponse(encodeTurn(turns[index]));
  };
  return { fetch, requests };
}

export function request(
  revision: string,
  patch: Partial<AiRunStartRequest> = {}
): AiRunStartRequest {
  return {
    runId: "validation-run-1",
    session,
    expectedRevision: revision,
    message: [{ type: "text", text: "整理卡片" }],
    model: { providerId: "validation", modelId: model.id },
    toolIds: [],
    skillIds: [],
    interactionMode: "none",
    ...patch,
  };
}

export function resolved(
  fetch: typeof globalThis.fetch,
  dispose: () => Promise<void> = async () => undefined
): AiResolvedModel {
  return { model, fetch, dispose };
}

export function historyDocument() {
  return appendSessionEntries(createSessionFile({ id: session.sessionId }), [
    { type: "message", message: { role: "user", content: "上次的问题", timestamp: 1 } },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "上次的回答" }],
        api: "openai-completions",
        provider: "validation",
        model: model.id,
        stopReason: "stop",
        timestamp: 1,
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    },
  ]);
}
