// 对话控制器：页面之外持有运行订阅，离开对话页生成照常进行；页面与对话记录订阅同一份状态。
// 消息以运行快照为准（已投影成 ChatSessionMessage），收尾后重读会话文件校正。

import { create } from "zustand";
import type { ChatSessionMessage } from "@tau/shared/chat-core";
import type { AskQuestionSubmission } from "@tau/shared/chat-core";
import type { AiModelRef } from "@tau/ai/contracts";
import type { AiApproval, AiQuestion, AiRunSnapshot, MobileAiService } from "../ai";
import { registerHostCapabilities } from "./hostTools";

export const CHAT_SCOPE = "main-chat";

export interface ChatState {
  sessionId: string;
  databaseName: string;
  title: string;
  revision: string;
  messages: ChatSessionMessage[];
  runId: string | null;
  status: AiRunSnapshot["status"] | "idle";
  approvals: AiApproval[];
  questions: AiQuestion[];
  error: { code: string; message: string } | null;
  model: AiModelRef | null;
}

interface Store {
  chats: Record<string, ChatState>;
  patch(sessionId: string, next: Partial<ChatState>): void;
}

export const useChatStore = create<Store>(set => ({
  chats: {},
  patch: (sessionId, next) =>
    set(state => {
      const current = state.chats[sessionId];
      if (!current) return state;
      return { chats: { ...state.chats, [sessionId]: { ...current, ...next } } };
    }),
}));

const loadService = () => import("../ai").then(module => module.getMobileAiService());

/** 每个库一份宿主能力注册，切库时由 releaseChatLibrary 释放 */
const capabilities = new Map<
  string,
  Promise<{ service: MobileAiService; toolIds: string[]; dispose(): void }>
>();

function capabilitiesFor(databaseName: string) {
  let entry = capabilities.get(databaseName);
  if (!entry) {
    entry = loadService().then(service => ({
      service,
      ...registerHostCapabilities(service, databaseName),
    }));
    entry.catch(() => capabilities.delete(databaseName));
    capabilities.set(databaseName, entry);
  }
  return entry;
}

export async function releaseChatLibrary(databaseName: string) {
  const entry = capabilities.get(databaseName);
  capabilities.delete(databaseName);
  (await entry?.catch(() => null))?.dispose();
}

const toError = (error: unknown) => {
  const record = (error ?? {}) as { code?: unknown; message?: unknown };
  return {
    code: typeof record.code === "string" ? record.code : "AI_RUN_FAILED",
    message:
      typeof record.message === "string" && record.message
        ? record.message
        : error instanceof Error
          ? error.message
          : "对话失败",
  };
};

/** 首条消息截前 24 字作为标题，用户改过（titleDirty）后不再覆盖 */
const titleFrom = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 24) || "新对话";

function setChat(state: ChatState) {
  useChatStore.setState(store => ({ chats: { ...store.chats, [state.sessionId]: state } }));
}

export async function openChat(databaseName: string, sessionId: string, model: AiModelRef | null) {
  const existing = useChatStore.getState().chats[sessionId];
  if (existing?.runId) return existing;
  const { service } = await capabilitiesFor(databaseName);
  const snapshot = await service.sessions.get({ databaseName, sessionId });
  const state: ChatState = {
    sessionId,
    databaseName,
    title: snapshot.row.title,
    revision: snapshot.revision,
    messages: snapshot.messages,
    runId: null,
    status: "idle",
    approvals: [],
    questions: [],
    error: null,
    model: existing?.model ?? model,
  };
  setChat(state);
  return state;
}

/** 新对话：先在本机建会话目录行，id 由调用方生成以便立即进入页面 */
export async function createChat(databaseName: string, sessionId: string, model: AiModelRef) {
  const { service } = await capabilitiesFor(databaseName);
  const snapshot = await service.sessions.create({
    databaseName,
    id: sessionId,
    scope: CHAT_SCOPE,
    title: "新对话",
  });
  setChat({
    sessionId,
    databaseName,
    title: snapshot.row.title,
    revision: snapshot.revision,
    messages: snapshot.messages,
    runId: null,
    status: "idle",
    approvals: [],
    questions: [],
    error: null,
    model,
  });
}

export function setChatModel(sessionId: string, model: AiModelRef) {
  useChatStore.getState().patch(sessionId, { model });
}

async function follow(service: MobileAiService, state: ChatState, runId: string) {
  const { patch } = useChatStore.getState();
  const unsubscribe = service.runs.subscribe(runId, notification => {
    if (notification.event.type === "snapshot") {
      const snapshot = notification.event.snapshot;
      patch(state.sessionId, {
        messages: snapshot.messages,
        status: snapshot.status,
        approvals: snapshot.approvals,
        questions: snapshot.questions,
        revision: snapshot.revision,
      });
      return;
    }
    const result = notification.event.result;
    unsubscribe();
    patch(state.sessionId, {
      runId: null,
      status: "idle",
      approvals: [],
      questions: [],
      messages: result.messages,
      revision: result.committedRevision,
      error:
        result.outcome === "failed" || result.outcome === "interrupted"
          ? toError(result.error)
          : null,
    });
    void service.sessions
      .get({ databaseName: state.databaseName, sessionId: state.sessionId })
      .then(snapshot =>
        patch(state.sessionId, {
          messages: snapshot.messages,
          revision: snapshot.revision,
          title: snapshot.row.title,
        })
      )
      .catch(() => undefined);
  });
}

export async function sendMessage(sessionId: string, text: string) {
  const state = useChatStore.getState().chats[sessionId];
  if (!state || state.runId || !text.trim()) return;
  if (!state.model) {
    useChatStore.getState().patch(sessionId, {
      error: { code: "AI_MODEL_UNAVAILABLE", message: "还没有为对话选择模型" },
    });
    return;
  }
  const { service, toolIds } = await capabilitiesFor(state.databaseName);
  const runId = crypto.randomUUID();
  const ref = { databaseName: state.databaseName, sessionId };
  const isFirst = !state.messages.length;
  useChatStore.getState().patch(sessionId, { runId, status: "preparing", error: null });
  try {
    if (isFirst) {
      const titled = await service.sessions.patch(ref, state.revision, {
        title: titleFrom(text),
      });
      useChatStore
        .getState()
        .patch(sessionId, { title: titled.row.title, revision: titled.revision });
    }
    const current = useChatStore.getState().chats[sessionId] ?? state;
    await service.runs.start({
      runId,
      session: ref,
      expectedRevision: current.revision,
      message: [{ type: "text", text: text.trim() }],
      model: state.model,
      toolIds,
      skillIds: [],
      interactionMode: "host",
    });
    await follow(service, current, runId);
  } catch (error) {
    useChatStore
      .getState()
      .patch(sessionId, { runId: null, status: "idle", error: toError(error) });
  }
}

export async function stopRun(sessionId: string) {
  const state = useChatStore.getState().chats[sessionId];
  if (!state?.runId) return;
  const { service } = await capabilitiesFor(state.databaseName);
  await service.runs.abort(state.runId);
}

export async function resolveApproval(
  sessionId: string,
  approval: AiApproval,
  choice: "allow" | "allow-session" | "deny"
) {
  const state = useChatStore.getState().chats[sessionId];
  if (!state?.runId) return;
  const { service } = await capabilitiesFor(state.databaseName);
  service.interactions.resolveApproval({
    runId: state.runId,
    requestId: approval.requestId,
    executionId: approval.executionId,
    revision: approval.revision,
    choice,
  });
}

export async function answerQuestion(
  sessionId: string,
  question: AiQuestion,
  submission: AskQuestionSubmission
) {
  const state = useChatStore.getState().chats[sessionId];
  if (!state?.runId) return;
  const { service } = await capabilitiesFor(state.databaseName);
  service.interactions.answerQuestion({
    runId: state.runId,
    requestId: question.requestId,
    executionId: question.executionId,
    revision: question.revision,
    submission,
  });
}

export async function listChats(databaseName: string, offset = 0) {
  const { service } = await capabilitiesFor(databaseName);
  return service.sessions.list(databaseName, { scope: CHAT_SCOPE, offset, limit: 30 });
}

export async function removeChat(databaseName: string, sessionId: string) {
  const { service } = await capabilitiesFor(databaseName);
  const ref = { databaseName, sessionId };
  const snapshot = await service.sessions.get(ref);
  await service.sessions.remove(ref, snapshot.revision);
  useChatStore.setState(store => {
    const chats = { ...store.chats };
    delete chats[sessionId];
    return { chats };
  });
}
