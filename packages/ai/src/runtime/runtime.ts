import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import {
  getCurrentTools,
  normalizeContext,
  type AssistantMessage,
  type Message,
} from "@earendil-works/pi-ai";
import {
  normalizeAskQuestionPayload,
  buildAskQuestionToolResult,
  type AskQuestionPayload,
  type AskQuestionSubmission,
  type ResponseMessage,
  type ToolCallExecutionState,
} from "@tau/shared/chat-core";
import type { TSchema } from "typebox";
import {
  AiError,
  type AiRunStartRequest,
  type AiSessionRef,
  type AiToolExecutionContext,
  type AiToolResult,
} from "../contracts";
import {
  appendSessionEntries,
  buildSessionContext,
  convertSessionMessagesToLlm,
  DISPLAY_ENTRY_TYPE,
  projectSessionMessages,
  projectTranscriptMessages,
  getSessionTranscript,
  isRecord,
  type SessionEntryInput,
  type PiTranscriptMessage,
} from "../session/index";
import {
  assertImageSupport,
  prepareInlineImages,
  prepareUserContent,
  userModelText,
} from "./input";
import { createModelStream } from "./stream";
import type {
  AiApproval,
  AiResolvedModel,
  AiRunHandle,
  AiRunResult,
  AiRunSnapshot,
  AiRuntimeNotification,
  AiRuntimeOptions,
  AiStoredSession,
  AiGenerationRequest,
  AiGenerationHandle,
  AiGenerationResult,
  AiQuestion,
  AiRetryRunRequest,
} from "./types";
import type { AiToolApprovalChoice, AiToolApprovalRequest } from "../tools/index";

const keyOf = (ref: AiSessionRef) => JSON.stringify([ref.databaseName, ref.sessionId]);
const errorOf = (error: unknown, storage = false) =>
  error instanceof AiError
    ? error
    : new AiError(
        storage ? "AI_STORAGE_FAILED" : "AI_TRANSPORT_FAILED",
        error instanceof Error ? error.message : String(error),
        false
      );

function validateGenerationLimits(request: { maxOutputTokens?: number; temperature?: number }) {
  if (
    request.maxOutputTokens !== undefined &&
    (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
  )
    throw new AiError("AI_SESSION_INVALID", "最大输出 token 数必须是正整数");
  if (request.temperature !== undefined && !Number.isFinite(request.temperature))
    throw new AiError("AI_SESSION_INVALID", "采样温度必须是有限数值");
}

function assertQuestionSubmission(payload: AskQuestionPayload, submission: AskQuestionSubmission) {
  if (!submission || !Array.isArray(submission.answers) || !Number.isFinite(submission.submittedAt))
    throw new AiError("AI_TOOL_ARGUMENT_INVALID", "作答格式无效");
  const seen = new Set<string>();
  for (const answer of submission.answers) {
    const question = payload.questions.find(item => item.id === answer?.questionId);
    if (
      !question ||
      seen.has(answer.questionId) ||
      !Array.isArray(answer.selectedValues) ||
      typeof answer.otherText !== "string"
    )
      throw new AiError("AI_TOOL_ARGUMENT_INVALID", "作答包含无效或重复问题");
    seen.add(answer.questionId);
    if (
      new Set(answer.selectedValues).size !== answer.selectedValues.length ||
      answer.selectedValues.some(
        value => !question.options.some(option => option.value === value)
      ) ||
      (question.type === "single" && answer.selectedValues.length > 1)
    )
      throw new AiError("AI_TOOL_ARGUMENT_INVALID", "作答选项不符合提问");
  }
  for (const question of payload.questions) {
    const answer = submission.answers.find(item => item.questionId === question.id);
    if (
      question.required &&
      (!answer || (!answer.selectedValues.length && !answer.otherText.trim()))
    )
      throw new AiError("AI_TOOL_ARGUMENT_INVALID", "请完成必答问题");
  }
}

interface Run {
  request: AiRunStartRequest;
  fingerprint: string;
  controller: AbortController;
  snapshot: AiRunSnapshot;
  stored?: AiStoredSession;
  partial?: SessionEntryInput;
  resolve(result: AiRunResult): void;
  result: Promise<AiRunResult>;
  accepted: Promise<AiRunHandle>;
  agent?: Agent;
  release?: () => Promise<void>;
  model?: AiResolvedModel;
  disposeTools?: () => void | Promise<void>;
  storageError?: AiError;
  executionError?: AiError;
  executions: Map<string, ToolCallExecutionState>;
  toolErrors: Map<string, AiError>;
  activeToolIds: Set<string>;
  limitReached: boolean;
  inputCommitted: boolean;
  retryEntryId?: string;
  timer?: ReturnType<typeof setTimeout>;
  pendingApprovals: Map<
    string,
    { request: AiApproval; finish(choice: AiToolApprovalChoice): void }
  >;
  pendingQuestions: Map<
    string,
    { request: AiQuestion; answer(submission: AskQuestionSubmission): void; cancel(): void }
  >;
}

export class AiRuntime {
  private readonly records = new Map<string, Run>();
  private readonly active = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(event: AiRuntimeNotification) => void>>();
  private readonly generations = new Map<
    string,
    { databaseName: string; controller: AbortController; result: Promise<AiGenerationResult> }
  >();
  private readonly closingLibraries = new Set<string>();
  private disposed = false;

  constructor(private readonly options: AiRuntimeOptions) {}

  subscribe(runId: string, listener: (event: AiRuntimeNotification) => void): () => void {
    const listeners = this.listeners.get(runId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    const record = this.records.get(runId);
    if (record) {
      try {
        listener(this.notification(record));
      } catch {
        /* 观察者不拥有运行生命周期。 */
      }
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(runId);
    };
  }

  getSnapshot(runId: string): AiRunSnapshot | null {
    const record = this.records.get(runId);
    return record ? structuredClone(this.snapshot(record)) : null;
  }

  async start(input: AiRunStartRequest): Promise<AiRunHandle> {
    return this.startRequest(input);
  }

  async retryLast(input: AiRetryRunRequest): Promise<AiRunHandle> {
    const { entryId, ...request } = input;
    return this.startRequest({ ...request, message: [] }, entryId);
  }

  private async startRequest(
    input: AiRunStartRequest,
    retryEntryId?: string
  ): Promise<AiRunHandle> {
    if (this.disposed || this.closingLibraries.has(input.session.databaseName))
      throw new AiError("AI_LIBRARY_CHANGED", "AI 服务或知识库正在释放");
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.runId))
      throw new AiError("AI_RUN_ID_CONFLICT", "运行标识无效");
    const request = structuredClone(input);
    validateGenerationLimits(request);
    const fingerprint = JSON.stringify([request, retryEntryId]);
    const existing = this.records.get(request.runId);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new AiError("AI_RUN_ID_CONFLICT", "相同运行标识不能用于不同请求");
      return existing.accepted;
    }
    const key = keyOf(request.session);
    if (this.active.has(key)) throw new AiError("AI_SESSION_BUSY", "当前会话仍在运行");
    let resolve!: (result: AiRunResult) => void;
    const result = new Promise<AiRunResult>(finish => {
      resolve = finish;
    });
    let accept!: (handle: AiRunHandle) => void;
    let reject!: (error: unknown) => void;
    const accepted = new Promise<AiRunHandle>((resolve, fail) => {
      accept = resolve;
      reject = fail;
    });
    const record: Run = {
      request,
      fingerprint,
      controller: new AbortController(),
      result,
      resolve,
      accepted,
      limitReached: false,
      inputCommitted: false,
      retryEntryId,
      executions: new Map(),
      toolErrors: new Map(),
      activeToolIds: new Set(),
      pendingApprovals: new Map(),
      pendingQuestions: new Map(),
      snapshot: {
        runId: request.runId,
        session: request.session,
        seq: 0,
        status: "preparing",
        revision: request.expectedRevision,
        messages: [],
        approvals: [],
        questions: [],
        interactionRevision: 0,
      },
    };
    this.records.set(request.runId, record);
    this.active.set(key, request.runId);
    void this.prepare(record).then(accept, reject);
    return record.accepted;
  }

  async abort(runId: string): Promise<void> {
    const record = this.records.get(runId);
    if (!record || record.snapshot.status === "settled") return;
    record.snapshot.status = "stopping";
    record.controller.abort(new DOMException("运行已取消", "AbortError"));
    record.agent?.abort();
    for (const pending of record.pendingApprovals.values()) pending.finish("deny");
    for (const pending of record.pendingQuestions.values()) pending.cancel();
    this.publish(record);
    await record.result;
  }

  async waitForIdle(ref?: AiSessionRef): Promise<void> {
    await Promise.all(
      [...this.records.values()]
        .filter(record => !ref || keyOf(record.request.session) === keyOf(ref))
        .map(record => record.result)
    );
    await Promise.all(
      [...this.generations.values()]
        .filter(value => !ref || value.databaseName === ref.databaseName)
        .map(value => value.result)
    );
  }

  resolveApproval(input: {
    runId: string;
    requestId: string;
    executionId: string;
    revision: number;
    choice: AiToolApprovalChoice;
  }): void {
    const record = this.records.get(input.runId);
    const pending = record?.pendingApprovals.get(input.requestId);
    if (
      !record ||
      !pending ||
      pending.request.executionId !== input.executionId ||
      pending.request.revision !== input.revision ||
      record.controller.signal.aborted
    )
      throw new AiError("AI_INTERACTION_UNAVAILABLE", "审批已过期或不属于本次执行");
    pending.finish(input.choice);
  }

  answerQuestion(input: {
    runId: string;
    requestId: string;
    executionId: string;
    revision: number;
    submission: AskQuestionSubmission;
  }): void {
    const record = this.records.get(input.runId);
    const pending = record?.pendingQuestions.get(input.requestId);
    if (
      !record ||
      !pending ||
      pending.request.executionId !== input.executionId ||
      pending.request.revision !== input.revision ||
      record.controller.signal.aborted
    )
      throw new AiError("AI_INTERACTION_UNAVAILABLE", "提问已过期或不属于本次执行");
    pending.answer(input.submission);
  }

  async requestQuestion(input: unknown, context: AiToolExecutionContext): Promise<AiToolResult> {
    const record = this.records.get(context.runId);
    if (
      !record ||
      keyOf(record.request.session) !== keyOf(context.session) ||
      record.request.interactionMode !== "host" ||
      !this.options.question ||
      context.signal.aborted
    )
      throw new AiError("AI_INTERACTION_UNAVAILABLE", "当前调用方不能承载提问");
    const normalized = normalizeAskQuestionPayload(input);
    if (!normalized.payload)
      throw new AiError("AI_TOOL_ARGUMENT_INVALID", normalized.error ?? "提问内容无效");
    const request: AiQuestion = {
      requestId: crypto.randomUUID(),
      executionId: context.executionId,
      toolCallId: context.toolCallId,
      payload: normalized.payload,
      revision: ++record.snapshot.interactionRevision,
    };
    const result = await new Promise<AskQuestionSubmission>((resolve, reject) => {
      const cleanup = () => {
        if (!record.pendingQuestions.delete(request.requestId)) return false;
        context.signal.removeEventListener("abort", cancel);
        record.snapshot.interactionRevision++;
        if (!record.controller.signal.aborted) record.snapshot.status = "running";
        this.publish(record);
        return true;
      };
      const cancel = () => {
        if (cleanup()) reject(new AiError("AI_INTERACTION_UNAVAILABLE", "提问已取消"));
      };
      const answer = (submission: AskQuestionSubmission) => {
        assertQuestionSubmission(request.payload, submission);
        if (cleanup()) resolve(submission);
      };
      record.pendingQuestions.set(request.requestId, { request, answer, cancel });
      record.snapshot.status = "waiting-answer";
      context.signal.addEventListener("abort", cancel, { once: true });
      this.publish(record);
      void this.options.question!(structuredClone(request), context.signal)
        .then(answer, cancel)
        .catch(cancel);
    });
    const value = buildAskQuestionToolResult(request.payload, result);
    return {
      content: JSON.stringify(value),
      metadata: { askQuestion: request.payload, askQuestionResult: value },
    };
  }

  async releaseLibrary(databaseName: string): Promise<void> {
    this.closingLibraries.add(databaseName);
    try {
      const generations = [...this.generations.values()].filter(
        value => value.databaseName === databaseName
      );
      for (const generation of generations) generation.controller.abort();
      await Promise.all(generations.map(value => value.result));
      await Promise.all(
        [...this.records.values()]
          .filter(record => record.request.session.databaseName === databaseName)
          .map(record => this.abort(record.request.runId))
      );
      for (const record of this.records.values())
        if (record.request.session.databaseName === databaseName)
          this.options.tools.revokeSession(record.request.session);
    } finally {
      this.closingLibraries.delete(databaseName);
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const generations = [...this.generations.values()];
    for (const generation of generations) generation.controller.abort();
    await Promise.all(generations.map(value => value.result));
    await Promise.all([...this.records.keys()].map(id => this.abort(id)));
    this.listeners.clear();
    this.options.tools.clearPermissions();
  }

  async generate(
    request: AiGenerationRequest,
    onSnapshot?: (response: ResponseMessage) => void
  ): Promise<AiGenerationHandle> {
    if (this.disposed || this.closingLibraries.has(request.databaseName))
      throw new AiError("AI_LIBRARY_CHANGED", "AI 服务或知识库正在释放");
    if (this.generations.has(request.requestId))
      throw new AiError("AI_RUN_ID_CONFLICT", "单次生成标识不可用");
    const controller = new AbortController();
    const result = (async (): Promise<AiGenerationResult> => {
      let model: AiResolvedModel | undefined;
      let release: (() => Promise<void>) | undefined;
      let last: AssistantMessage | undefined;
      let failure: AiError | undefined;
      try {
        validateGenerationLimits(request);
        if (!request.messages.length || request.messages.at(-1)?.role !== "user")
          throw new AiError("AI_SESSION_INVALID", "单次生成必须以用户消息结束");
        const ref = { databaseName: request.databaseName, sessionId: request.requestId };
        release = await this.options.store.beginRun(ref, request.requestId);
        model = await this.options.resolveModel(request.model, ref);
        controller.signal.throwIfAborted();
        if (
          request.messages.some(
            message =>
              message.role !== "user" && "images" in message && message.images !== undefined
          )
        )
          throw new AiError("AI_ATTACHMENT_UNAVAILABLE", "助手历史消息不接受图片字段");
        const messages: Message[] = request.messages.map(message =>
          message.role === "user"
            ? {
                role: "user",
                content: message.images?.length
                  ? [
                      ...(message.content
                        ? [{ type: "text" as const, text: message.content }]
                        : []),
                      ...prepareInlineImages(message.images),
                    ]
                  : message.content,
                timestamp: Date.now(),
              }
            : {
                role: "assistant",
                content: [{ type: "text", text: message.content }],
                api: model!.model.api,
                provider: model!.model.provider,
                model: model!.model.id,
                timestamp: Date.now(),
                stopReason: "stop",
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              }
        );
        assertImageSupport(model.model, messages);
        const thinkingLevel = request.thinkingLevel ?? model.defaultThinkingLevel;
        const stream = await createModelStream(model.fetch, model.stripThinkTags, {
          maxTokens: request.maxOutputTokens,
          temperature: request.temperature,
        })(model.model, normalizeContext({ systemPrompt: request.system, messages }), {
          signal: controller.signal,
          reasoning: thinkingLevel === "off" ? undefined : thinkingLevel,
        });
        for await (const event of stream) {
          if ("partial" in event) last = event.partial;
          if (event.type === "done") last = event.message;
          if (event.type === "error") {
            last = event.error;
            if (event.reason !== "aborted")
              failure = errorOf(new Error(event.error.errorMessage ?? "模型请求失败"));
          }
          const response = this.generationResponse(
            request.requestId,
            last,
            event.type !== "done" && event.type !== "error"
          );
          if (response && onSnapshot) {
            try {
              onSnapshot(response);
            } catch {
              /* 观察者不拥有运行生命周期。 */
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) failure = errorOf(error);
      } finally {
        for (const cleanup of [model ? () => model!.dispose() : undefined, release]) {
          try {
            await cleanup?.();
          } catch (error) {
            failure ??= errorOf(error);
          }
        }
        this.generations.delete(request.requestId);
      }
      return {
        outcome: controller.signal.aborted ? "aborted" : failure ? "failed" : "completed",
        response: this.generationResponse(request.requestId, last),
        ...(failure ? { error: failure.toJSON() } : {}),
      };
    })();
    this.generations.set(request.requestId, {
      databaseName: request.databaseName,
      controller,
      result,
    });
    return { requestId: request.requestId, result, abort: () => controller.abort() };
  }

  private generationResponse(
    id: string,
    message?: AssistantMessage,
    streaming = false
  ): ResponseMessage | null {
    if (!message) return null;
    const projected = projectTranscriptMessages([
      { id, message: message as unknown as PiTranscriptMessage },
    ]);
    const response =
      (projected.find(value => value.role === "assistant") as ResponseMessage | undefined) ?? null;
    if (streaming) for (const block of response?.assistant_blocks ?? []) block.state = "streaming";
    return response;
  }

  private async prepare(record: Run): Promise<AiRunHandle> {
    try {
      const request = record.request;
      let tools = this.options.tools.capture(request.toolIds);
      record.release = await this.options.store.beginRun(request.session, request.runId);
      record.controller.signal.throwIfAborted();
      record.stored = await this.options.store.read(request.session);
      record.snapshot.messages = projectSessionMessages(record.stored.document);
      if (record.stored.revision !== request.expectedRevision)
        throw new AiError("AI_SESSION_REVISION_CONFLICT", "会话已变化，请重新读取");
      if (
        record.stored.document.entries.some(
          entry =>
            entry.id === `${request.runId}-user` ||
            (entry.type === "custom_message" &&
              isRecord(entry.details) &&
              entry.details.runId === request.runId)
        )
      )
        throw new AiError("AI_RUN_ID_CONFLICT", "本次运行已在持久会话中存在，不能自动重放");
      if (record.retryEntryId) {
        const last = record.snapshot.messages.at(-1);
        if (!last || last.role !== "user" || !last.piEntryIds?.includes(record.retryEntryId))
          throw new AiError(
            "AI_SESSION_INVALID",
            "这条消息已有回答或后续对话，请重新生成并保留原版本"
          );
        request.message =
          typeof last.content === "string"
            ? [{ type: "text", text: last.content }]
            : structuredClone(last.content);
      }
      record.model = await this.options.resolveModel(request.model, request.session);
      await this.closeInterruptedTools(record);
      if (this.options.prepareTools) {
        const prepared = await this.options.prepareTools(request, record.controller.signal, tools);
        tools = prepared.snapshot;
        record.disposeTools = prepared.dispose;
      }
      const content = record.retryEntryId
        ? undefined
        : await (this.options.prepareInput?.(request.message, record.controller.signal) ??
            prepareUserContent(request.message));
      assertImageSupport(record.model.model, [
        ...buildSessionContext(record.stored.document).messages,
        { content },
      ]);
      const prompt = await this.options.preparePrompt?.(request, record.controller.signal);
      record.controller.signal.throwIfAborted();
      const inputs: SessionEntryInput[] = [];
      const previous = buildSessionContext(record.stored.document);
      const previousTools = getCurrentTools(convertSessionMessagesToLlm(previous.messages));
      const selectedTools = tools.specs.map(spec => ({
        name: spec.name,
        description: spec.description,
        parameters: spec.inputSchema,
      }));
      if (JSON.stringify(previousTools) !== JSON.stringify(selectedTools))
        inputs.push({
          type: "message",
          message: {
            role: "system",
            content: "",
            timestamp: Date.now(),
            toolsRemoved: previousTools.map(tool => ({ name: tool.name })),
            toolsAdded: selectedTools,
          },
        });
      if (
        previous.model?.provider !== request.model.providerId ||
        previous.model.modelId !== request.model.modelId
      )
        inputs.push({
          type: "model_change",
          provider: request.model.providerId,
          modelId: request.model.modelId,
        });
      const thinkingLevel = request.thinkingLevel ?? record.model.defaultThinkingLevel ?? "off";
      if (previous.thinkingLevel !== thinkingLevel)
        inputs.push({ type: "thinking_level_change", thinkingLevel });
      if (record.retryEntryId) {
        const transcript = getSessionTranscript(record.stored.document);
        const index = transcript.findIndex(entry => entry.id === record.retryEntryId);
        for (const entry of transcript.slice(index + 1))
          if (entry.message.role === "assistant")
            inputs.push({ type: "context_edit", targetId: entry.id, replacement: null });
      }
      if (prompt !== undefined)
        inputs.push({
          type: "message",
          message: {
            role: "system",
            ...(typeof prompt === "string" ? {} : prompt),
            content: typeof prompt === "string" ? prompt : (prompt.content ?? ""),
            timestamp: Date.now(),
          },
        });
      if (record.retryEntryId)
        inputs.push({
          type: "custom_message",
          customType: "desktop-retry",
          content: "请重试上一条用户请求。",
          display: false,
          details: { runId: request.runId, entryId: record.retryEntryId },
        });
      else if (content !== undefined)
        inputs.push(
          {
            type: "message",
            id: `${request.runId}-user`,
            message: { role: "user", content, timestamp: Date.now() },
          },
          {
            type: "custom",
            id: `${request.runId}-display`,
            customType: DISPLAY_ENTRY_TYPE,
            data: {
              modelText: userModelText(content),
              content: request.message,
              clientId: request.runId,
              runId: request.runId,
            },
          }
        );
      await this.append(record, inputs, `${request.runId}-input`);
      record.inputCommitted = true;
      const context = buildSessionContext(record.stored.document);
      let turns = 0;
      const sdkTools: AgentTool[] = tools.specs.map(spec => ({
        name: spec.name,
        label: spec.name,
        description: spec.description,
        parameters: spec.inputSchema as TSchema,
        execute: async (toolCallId, args, signal) => {
          record.controller.signal.throwIfAborted();
          const executionId = crypto.randomUUID();
          let output;
          try {
            output = await tools.execute(
              spec.id,
              args,
              {
                session: request.session,
                runId: request.runId,
                toolCallId,
                executionId,
                operationId: `${request.runId}:${toolCallId}`,
                signal: signal ?? record.controller.signal,
              },
              {
                interactionMode: request.interactionMode,
                permissionMode: this.options.permissionMode?.() ?? "manual",
                approve: this.options.approve
                  ? approval => this.approve(record, approval)
                  : undefined,
              }
            );
          } catch (error) {
            if (error instanceof AiError) record.toolErrors.set(toolCallId, error);
            if (error instanceof AiError && error.code === "AI_TOOL_OUTCOME_UNKNOWN") {
              record.executionError = error;
              record.agent?.abort();
            }
            throw error;
          }
          return {
            content: [{ type: "text" as const, text: output.modelContent ?? output.content }],
            details: { ...output.metadata, displayContent: output.content },
          };
        },
      }));
      const agent = new Agent({
        initialState: {
          model: record.model.model,
          messages: context.messages as unknown as AgentMessage[],
          tools: sdkTools,
          thinkingLevel,
        },
        convertToLlm: messages =>
          convertSessionMessagesToLlm(messages as unknown as PiTranscriptMessage[]),
        streamFn: createModelStream(record.model.fetch, record.model.stripThinkTags, {
          maxTokens: request.maxOutputTokens,
          temperature: request.temperature,
        }),
        toolExecution: "sequential",
        finishTurn: turn => {
          turns++;
          if (turns < (this.options.maxTurns ?? 20) || turn.message.stopReason !== "toolUse")
            return undefined;
          record.limitReached = true;
          return { action: "end" };
        },
      });
      record.agent = agent;
      record.controller.signal.addEventListener("abort", () => agent.abort(), { once: true });
      agent.subscribe(event => this.handleEvent(record, event));
      record.snapshot.status = "running";
      this.publish(record);
      void this.execute(record);
      return {
        runId: request.runId,
        result: record.result,
        abort: () => this.abort(request.runId),
      };
    } catch (error) {
      await this.finish(record, errorOf(error));
      throw error;
    }
  }

  private async execute(record: Run): Promise<void> {
    let failure: AiError | undefined;
    try {
      record.controller.signal.throwIfAborted();
      await record.agent!.continue();
    } catch (error) {
      failure = record.storageError ?? record.executionError ?? errorOf(error);
    }
    failure = record.storageError ?? record.executionError ?? failure;
    if (!failure && record.agent?.state.errorMessage)
      failure = errorOf(new Error(record.agent.state.errorMessage));
    if (record.limitReached)
      failure = new AiError("AI_RUN_LIMIT", "本轮达到模型调用上限，已停止继续执行");
    await this.finish(record, failure);
  }

  private async handleEvent(record: Run, event: AgentEvent): Promise<void> {
    if (event.type === "tool_execution_start") {
      record.executions.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: JSON.stringify(event.args),
        status: "executing",
        timestamp: Date.now(),
      });
      this.publish(record);
      return;
    }
    if (event.type === "tool_execution_end") {
      const execution = record.executions.get(event.toolCallId);
      if (execution) {
        execution.status = event.isError ? "failed" : "success";
        execution.duration = Date.now() - execution.timestamp;
        const result = event.result;
        const content = result.content as Array<{ type: string; text?: string }>;
        execution.output = content
          .filter(block => block.type === "text")
          .map(block => block.text ?? "")
          .join("\n\n");
        if (result.details && typeof result.details === "object")
          execution.metadata = result.details as Record<string, unknown>;
      }
      this.publish(record);
      return;
    }
    if (event.type === "message_start" && event.message.role === "assistant") {
      record.partial = { type: "message", id: crypto.randomUUID(), message: event.message };
    } else if (event.type === "message_update") {
      if (record.partial) record.partial.message = event.message;
      if (!record.timer)
        record.timer = setTimeout(() => {
          record.timer = undefined;
          this.publish(record);
        }, 50);
    } else if (event.type === "message_end") {
      if (event.message.role === "user") return;
      if (event.message.role === "assistant")
        for (const block of event.message.content)
          if (block.type === "toolCall") record.activeToolIds.add(block.id);
      const id = event.message.role === "assistant" ? record.partial?.id : undefined;
      let message: AgentMessage = event.message;
      if (message.role === "toolResult") {
        const failure = record.toolErrors.get(message.toolCallId);
        const details =
          message.details && typeof message.details === "object" && !Array.isArray(message.details)
            ? message.details
            : {};
        message = {
          ...message,
          details: {
            ...details,
            ...(failure
              ? {
                  errorCode: failure.code,
                  ...(failure.code === "AI_TOOL_OUTCOME_UNKNOWN" ? { outcomeUnknown: true } : {}),
                  ...(failure.code === "AI_TOOL_DENIED" ? { denied: true } : {}),
                }
              : {}),
            ...(record.controller.signal.aborted ? { cancelled: true } : {}),
          },
        };
      }
      await this.append(
        record,
        [{ type: "message", id, message }],
        `${record.request.runId}:${id ?? crypto.randomUUID()}`
      );
      if (event.message.role === "assistant") record.partial = undefined;
      this.publish(record);
    }
  }

  private async append(
    record: Run,
    inputs: SessionEntryInput[],
    operationId: string
  ): Promise<void> {
    const stored = record.stored!;
    try {
      const next = appendSessionEntries(stored.document, inputs);
      record.stored = await this.options.store.append(
        record.request.session,
        stored.revision,
        next.entries.slice(stored.document.entries.length),
        operationId
      );
      record.snapshot.revision = record.stored.revision;
    } catch (error) {
      record.storageError = errorOf(error, true);
      record.agent?.abort();
      throw record.storageError;
    }
  }

  private async closeInterruptedTools(record: Run): Promise<void> {
    const context = buildSessionContext(record.stored!.document).messages;
    let assistant = -1;
    for (let index = context.length - 1; index >= 0; index--) {
      if (context[index].role === "user") return;
      if (context[index].role === "assistant") {
        assistant = index;
        break;
      }
    }
    if (assistant < 0) return;
    const content = context[assistant].content;
    if (!Array.isArray(content)) return;
    const answered = new Set(
      context
        .slice(assistant + 1)
        .filter(message => message.role === "toolResult")
        .map(message => message.toolCallId)
    );
    const pending = content.filter(
      block =>
        block &&
        typeof block === "object" &&
        block.type === "toolCall" &&
        typeof block.id === "string" &&
        !answered.has(block.id)
    );
    if (!pending.length) return;
    await this.append(
      record,
      pending.map(call => ({
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: call.id,
          toolName: typeof call.name === "string" ? call.name : "",
          content: [
            {
              type: "text",
              text: "上次运行已中断，没有获得工具执行回执；写入可能已经提交，不可自动重放。",
            },
          ],
          details: { outcomeUnknown: true },
          isError: true,
          timestamp: Date.now(),
        },
      })),
      `${record.request.runId}-recover-tools`
    );
  }

  private snapshot(record: Run): AiRunSnapshot {
    if (record.stored) {
      const document = record.partial
        ? appendSessionEntries(record.stored.document, [record.partial])
        : record.stored.document;
      record.snapshot.messages = projectSessionMessages(document);
      if (record.partial?.id) {
        const turnId = `pi:jsonl:${record.partial.id}`;
        for (const message of record.snapshot.messages)
          if ("assistant_blocks" in message)
            for (const block of message.assistant_blocks ?? [])
              if (block.turnId === turnId) block.state = "streaming";
      }
      if (record.snapshot.status !== "settled")
        for (const message of record.snapshot.messages)
          if ("assistant_blocks" in message)
            for (const block of message.assistant_blocks ?? [])
              if (block.type === "tool_call") {
                const execution = record.executions.get(block.toolCall.id);
                if (execution) block.execution = structuredClone(execution);
                else if (
                  record.activeToolIds.has(block.toolCall.id) ||
                  block.turnId === `pi:jsonl:${record.partial?.id}`
                )
                  block.execution = {
                    toolCallId: block.toolCall.id,
                    toolName: block.toolCall.function.name,
                    input: block.toolCall.function.arguments ?? "",
                    status: "pending",
                    timestamp: 0,
                  };
              }
      record.snapshot.revision = record.stored.revision;
    }
    record.snapshot.approvals = [...record.pendingApprovals.values()].map(value => value.request);
    record.snapshot.questions = [...record.pendingQuestions.values()].map(value => value.request);
    return record.snapshot;
  }

  private notification(record: Run): AiRuntimeNotification {
    return {
      runId: record.request.runId,
      seq: record.snapshot.seq,
      session: record.request.session,
      event: { type: "snapshot", snapshot: structuredClone(this.snapshot(record)) },
    };
  }

  private emit(record: Run, event: AiRuntimeNotification["event"]): void {
    record.snapshot.seq++;
    const notification = {
      runId: record.request.runId,
      seq: record.snapshot.seq,
      session: record.request.session,
      event,
    };
    for (const listener of this.listeners.get(record.request.runId) ?? []) {
      try {
        listener(structuredClone(notification));
      } catch {
        /* 观察者不拥有运行生命周期。 */
      }
    }
  }

  private publish(record: Run): void {
    const snapshot = structuredClone(this.snapshot(record));
    snapshot.seq = record.snapshot.seq + 1;
    this.emit(record, { type: "snapshot", snapshot });
  }

  private async approve(
    record: Run,
    approval: AiToolApprovalRequest
  ): Promise<AiToolApprovalChoice> {
    record.snapshot.interactionRevision++;
    const request: AiApproval = {
      requestId: approval.requestId,
      executionId: approval.context.executionId,
      toolCallId: approval.context.toolCallId,
      toolName: approval.tool.name,
      input: approval.input,
      revision: record.snapshot.interactionRevision,
    };
    record.snapshot.status = "waiting-approval";
    const execution = record.executions.get(approval.context.toolCallId);
    if (execution) execution.status = "awaiting-approval";
    return new Promise(resolve => {
      const finish = (choice: AiToolApprovalChoice) => {
        if (!record.pendingApprovals.delete(request.requestId)) return;
        approval.context.signal.removeEventListener("abort", abort);
        record.snapshot.interactionRevision++;
        if (!record.controller.signal.aborted) record.snapshot.status = "running";
        if (execution) execution.status = "executing";
        this.publish(record);
        resolve(choice);
      };
      const abort = () => finish("deny");
      record.pendingApprovals.set(request.requestId, { request, finish });
      approval.context.signal.addEventListener("abort", abort, { once: true });
      this.publish(record);
      void this.options.approve!(approval).then(finish, () => finish("deny"));
    });
  }

  private async finish(record: Run, error?: AiError): Promise<void> {
    if (record.snapshot.status === "settled") return;
    if (record.timer) clearTimeout(record.timer);
    record.timer = undefined;
    for (const pending of record.pendingApprovals.values()) pending.finish("deny");
    for (const pending of record.pendingQuestions.values()) pending.cancel();
    let failure = record.storageError ?? record.executionError ?? error;
    const aborted = record.controller.signal.aborted;
    record.partial = undefined;
    if (record.stored && record.inputCommitted && !record.storageError) {
      try {
        await this.append(
          record,
          [
            {
              type: "custom",
              customType: "tau-run",
              data: {
                runId: record.request.runId,
                outcome: aborted ? "aborted" : failure ? "failed" : "completed",
              },
            },
          ],
          `${record.request.runId}-settled`
        );
      } catch (storageError) {
        failure = errorOf(storageError, true);
      }
    }
    for (const release of [
      record.disposeTools,
      record.model ? () => record.model!.dispose() : undefined,
      record.release,
    ]) {
      try {
        await release?.();
      } catch (releaseError) {
        failure ??= errorOf(releaseError);
      }
    }
    record.snapshot.status = "settled";
    record.snapshot.outcome = record.storageError
      ? "failed"
      : aborted
        ? "aborted"
        : failure
          ? "failed"
          : "completed";
    record.snapshot.error = failure?.toJSON();
    this.active.delete(keyOf(record.request.session));
    this.publish(record);
    const result: AiRunResult = {
      runId: record.request.runId,
      session: record.request.session,
      outcome: record.snapshot.outcome,
      committedRevision: record.snapshot.revision,
      messages: structuredClone(record.snapshot.messages),
      ...(failure ? { error: failure.toJSON() } : {}),
    };
    this.emit(record, { type: "settled", result });
    record.resolve(result);
    record.agent = undefined;
    record.model = undefined;
    record.release = undefined;
    record.disposeTools = undefined;
    record.stored = undefined;
    record.executions.clear();
    record.toolErrors.clear();
    record.activeToolIds.clear();
    const idle = [...this.records].filter(
      ([id, value]) => value.snapshot.status === "settled" && !this.listeners.get(id)?.size
    );
    const latest = new Map<string, string>();
    for (const [id, value] of idle) {
      const key = keyOf(value.request.session);
      const previous = latest.get(key);
      if (previous) this.records.delete(previous);
      latest.set(key, id);
    }
    for (const id of [...latest.values()].slice(0, Math.max(0, latest.size - 20)))
      this.records.delete(id);
  }
}
