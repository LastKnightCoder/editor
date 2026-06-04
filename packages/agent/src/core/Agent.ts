import { createBuiltinSkillTools } from "../builtins/skillTools";
import { createSkillMessageContributor } from "../contributors/SkillMessageContributor";
import { isAbortError } from "./abort";
import { createAgentRuntimeAPI } from "./AgentRuntime";
import { logAgentTokenBudget } from "./tokenBudgetDebug";
import { ToolSnapshot } from "./ToolSnapshot";
import type {
  AgentConfig,
  AgentErrorPayload,
  AgentEvent,
  AgentHookBaseContext,
  AgentMessage,
  AgentMessageContributor,
  AgentNotice,
  AgentRuntimeHook,
  AgentRunRequest,
  AgentRunResult,
  AgentSkill,
  AgentTool,
  AgentToolCall,
  AgentTraceSpan,
  AgentToolExecutionState,
  AgentToolSource,
  AgentMutableState,
  AgentSystemState,
} from "../types";

const DEFAULT_MAX_TOOL_CALL_LOOPS = 15;
const DEFAULT_MAX_TOOL_RETRIES = 2;
const DEFAULT_TOOL_TIMEOUT_MS = 30000;

const createId = (prefix: string) => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
};

const cloneExecution = (execution: AgentToolExecutionState) => ({
  ...execution,
});

const cloneExecutions = (executions: AgentToolExecutionState[]) =>
  executions.map(cloneExecution);

const toErrorPayload = (error: unknown): AgentErrorPayload => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
};

const buildTextMessageContent = (text: string): AgentMessage["content"] =>
  text ? [{ type: "text", text }] : "";

const buildAssistantToolCallMessage = (
  toolCalls: AgentToolCall[],
  options?: {
    content?: string;
    reasoningContent?: string;
  },
): AgentMessage => ({
  role: "assistant",
  content: buildTextMessageContent(options?.content ?? ""),
  tool_calls: toolCalls,
  reasoning_content: options?.reasoningContent ?? "",
});

const buildToolResultMessage = (
  call: AgentToolCall,
  content: string,
  modelContent?: AgentMessage["content"],
): AgentMessage => ({
  role: "tool",
  content: modelContent ?? [{ type: "text", text: content }],
  tool_call_id: call.id,
  name: call.function.name,
});

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    setTimeout(resolve, ms);
  });

const mergeTools = (...groups: AgentTool[][]): AgentTool[] => {
  const tools = new Map<string, AgentTool>();

  groups.forEach((group) => {
    group.forEach((tool) => {
      if (!tools.has(tool.name)) {
        tools.set(tool.name, tool);
      }
    });
  });

  return Array.from(tools.values());
};

const resolveConfiguredTools = async (
  source?: AgentTool[] | AgentToolSource,
): Promise<AgentTool[]> => {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source;
  }

  return source.getTools();
};

const sortByOrder = <T extends { order?: number }>(items: T[]): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        (left.item.order ?? 0) - (right.item.order ?? 0) ||
        left.index - right.index,
    )
    .map(({ item }) => item);

const resolveContributors = (
  skills: AgentSkill[] | undefined,
  contributors: AgentMessageContributor[] | undefined,
) => {
  const skillContributors =
    skills?.flatMap((skill) => skill.contributors ?? []) ?? [];
  const builtinContributors = skills?.length
    ? [createSkillMessageContributor(skills)]
    : [];

  return sortByOrder([
    ...builtinContributors,
    ...skillContributors,
    ...(contributors ?? []),
  ]);
};

const resolveRuntimeHooks = (
  skills: AgentSkill[] | undefined,
  hooks: AgentRuntimeHook[] | undefined,
) =>
  sortByOrder([
    ...(skills?.flatMap((skill) => skill.hooks ?? []) ?? []),
    ...(hooks ?? []),
  ]);

export class Agent {
  constructor(private readonly config: AgentConfig) {}

  async *run(request: AgentRunRequest): AsyncGenerator<AgentEvent> {
    const traceId = createId("trace");
    const runId = createId("run");
    const sessionId = this.config.session?.id;
    const conversationKey =
      request.conversationKey ?? this.config.session?.conversationKey;
    const snapshot = await this.resolveSnapshot();
    const hasTools = snapshot.getTools().length > 0;
    const state: AgentMutableState = {
      messages: [...request.messages],
      toolModeActive: Boolean(request.enableTools) && hasTools,
      metadata: request.metadata,
      reasoningEffort: request.reasoningEffort,
    };
    let toolLoopCount = 0;
    let toolModeFallbackNotified = false;
    const controller = request.controller ?? new AbortController();
    const contributors = resolveContributors(
      this.config.skills,
      this.config.contributors,
    );
    const runtimeHooks = resolveRuntimeHooks(
      this.config.skills,
      this.config.hooks,
    );
    const runtime = createAgentRuntimeAPI(this.config.runtime);
    const pendingNotices: AgentNotice[] = [];

    const emit = async (event: AgentEvent) => {
      for (const observer of this.config.observers || []) {
        try {
          await observer.onEvent(event);
        } catch {
          // 观察者失败不影响主执行流
        }
      }
      return event;
    };

    const buildBaseEvent = () => ({
      traceId,
      runId,
      sessionId,
      conversationKey,
      timestamp: Date.now(),
    });

    const buildSystemState = (turnId?: string): AgentSystemState => ({
      traceId,
      runId,
      turnId,
      sessionId,
      session: this.config.session,
      conversationKey,
      loopIndex: toolLoopCount,
      request,
      tools: snapshot.getTools(),
      toolSchemas: snapshot.getToolSchemas(),
    });

    const publishNotice = (notice: AgentNotice) => {
      pendingNotices.push(notice);
    };

    const recordTelemetry = async (
      name: string,
      attributes?: Record<string, unknown>,
    ) => {
      await runtime.telemetry.record({
        name,
        attributes,
      });
    };

    const closeSpan = async (
      span: AgentTraceSpan | null | undefined,
      attributes?: Record<string, unknown>,
    ) => {
      if (!span) {
        return;
      }
      await span.end(attributes);
    };

    const flushPublishedNotices = async function* (turnId?: string) {
      while (pendingNotices.length > 0) {
        yield await emit({
          type: "notice",
          ...buildBaseEvent(),
          ...(turnId ? { turnId } : {}),
          notice: pendingNotices.shift()!,
        });
      }
    };

    const runContributors = async (
      stage: "run-init" | "before-turn",
      context: AgentHookBaseContext,
    ) => {
      for (const contributor of contributors) {
        if ((contributor.stage ?? "run-init") !== stage) {
          continue;
        }
        await contributor.contribute(context);
      }
    };

    const runRuntimeHooks = async <TContext>(
      select: (
        hook: AgentRuntimeHook,
      ) => ((context: TContext) => void | Promise<void>) | undefined,
      context: TContext,
    ) => {
      for (const hook of runtimeHooks) {
        const handler = select(hook);
        if (!handler) {
          continue;
        }
        await handler(context);
      }
    };

    const emitRunError = async function* (
      error: AgentErrorPayload,
      runSpan: AgentTraceSpan | null,
      turnSpan?: AgentTraceSpan | null,
      turnId?: string,
    ) {
      await runRuntimeHooks((hook) => hook.onRunError, {
        system: buildSystemState(turnId),
        state,
        runtime,
        publishNotice,
        turnId,
        error,
      });
      if (turnSpan) {
        await closeSpan(turnSpan, {
          status: "error",
          errorName: error.name,
          errorMessage: error.message,
        });
      }
      await recordTelemetry("agent.run.error", {
        turnId,
        errorName: error.name,
        errorMessage: error.message,
      });
      await closeSpan(runSpan, {
        status: "error",
        errorName: error.name,
        errorMessage: error.message,
      });
      yield* flushPublishedNotices(turnId);
      yield await emit({
        type: "run-error",
        ...buildBaseEvent(),
        ...(turnId ? { turnId } : {}),
        error,
      });
    };

    const initContext: AgentHookBaseContext = {
      system: buildSystemState(),
      state,
      runtime,
      publishNotice,
    };
    const runSpan = await runtime.tracing.startSpan({
      name: "agent.run",
      attributes: {
        traceId,
        runId,
        sessionId,
        conversationKey,
      },
    });
    await runContributors("run-init", initContext);
    await runRuntimeHooks((hook) => hook.onRunInit, initContext);

    await recordTelemetry("agent.run.start", {
      traceId,
      runId,
      sessionId,
      conversationKey,
    });
    yield await emit({
      type: "run-start",
      ...buildBaseEvent(),
    });
    yield* flushPublishedNotices();

    while (true) {
      const turnId = `${runId}:turn-${toolLoopCount}`;
      let text = "";
      let reasoningContent = "";
      let streamedToolCalls: AgentToolCall[] = [];
      let turnResult:
        | {
            type: "response";
            content: string;
            reasoningContent: string;
            finishReason: string | null;
          }
        | {
            type: "tool_calls";
            content: string;
            reasoningContent: string;
            finishReason: "tool_calls";
            toolCalls: AgentToolCall[];
          }
        | null = null;
      const turnSpan = await runtime.tracing.startSpan({
        name: "agent.turn",
        attributes: {
          traceId,
          runId,
          turnId,
          loopIndex: toolLoopCount,
          toolModeActive: state.toolModeActive,
        },
      });
      const turnContext: AgentHookBaseContext = {
        system: buildSystemState(turnId),
        state,
        runtime,
        publishNotice,
      };
      await runContributors("before-turn", turnContext);
      await runRuntimeHooks((hook) => hook.onBeforeTurn, {
        ...turnContext,
        turnId,
      });

      yield await emit({
        type: "turn-start",
        ...buildBaseEvent(),
        turnId,
        toolModeActive: state.toolModeActive,
        loopIndex: toolLoopCount,
      });
      await recordTelemetry("agent.turn.start", {
        turnId,
        loopIndex: toolLoopCount,
        toolModeActive: state.toolModeActive,
      });
      yield* flushPublishedNotices(turnId);

      try {
        const turnToolSchemas = state.toolModeActive
          ? turnContext.system.toolSchemas
          : undefined;
        logAgentTokenBudget({
          traceId,
          runId,
          turnId,
          conversationKey,
          loopIndex: toolLoopCount,
          toolModeActive: state.toolModeActive,
          messages: state.messages,
          tools: turnToolSchemas,
        });
        for await (const event of this.config.model.streamTurn({
          messages: state.messages,
          tools: turnToolSchemas,
          controller,
          signal: controller.signal,
          traceId,
          runId,
          turnId,
          conversationKey,
          reasoningEffort: state.reasoningEffort,
          metadata: state.metadata,
          deferAssistantTextUntilFinish: request.deferAssistantTextUntilFinish,
          disableAnimation: request.disableAnimation,
        })) {
          if (event.type === "text-delta") {
            text += event.delta;
            yield await emit({
              type: "text-delta",
              ...buildBaseEvent(),
              turnId,
              delta: event.delta,
              text,
              reasoningContent,
            });
            continue;
          }

          if (event.type === "reasoning-delta") {
            reasoningContent += event.delta;
            yield await emit({
              type: "reasoning-delta",
              ...buildBaseEvent(),
              turnId,
              delta: event.delta,
              reasoningContent,
            });
            continue;
          }

          if (event.type === "tool-calls-delta") {
            streamedToolCalls = event.toolCalls;
            yield await emit({
              type: "tool-call-planned",
              ...buildBaseEvent(),
              turnId,
              phase: "streaming",
              toolCalls: streamedToolCalls,
            });
            continue;
          }

          if (event.type === "notice") {
            yield await emit({
              type: "notice",
              ...buildBaseEvent(),
              turnId,
              notice: event.notice,
            });
            continue;
          }

          turnResult = event.result;
          text = turnResult.content;
          reasoningContent = turnResult.reasoningContent;
        }
      } catch (error) {
        if (isAbortError(error)) {
          yield* emitRunError(toErrorPayload(error), runSpan, turnSpan, turnId);
          return;
        }

        if (
          state.toolModeActive &&
          this.config.policies?.toolModeFallback !== false &&
          !toolModeFallbackNotified
        ) {
          toolModeFallbackNotified = true;
          state.toolModeActive = false;
          yield await emit({
            type: "notice",
            ...buildBaseEvent(),
            turnId,
            notice: {
              level: "warning",
              code: "tool_mode_disabled",
              message: "当前模型不支持工具调用，已自动关闭 MCP 功能",
            },
          });
          continue;
        }

        yield* emitRunError(toErrorPayload(error), runSpan, turnSpan, turnId);
        return;
      }

      if (!turnResult) {
        yield* emitRunError(
          {
            name: "AgentRuntimeError",
            message: "模型回合未返回完成结果",
          },
          runSpan,
          turnSpan,
          turnId,
        );
        return;
      }

      await runRuntimeHooks((hook) => hook.onAfterModelTurn, {
        ...turnContext,
        turnId,
        result: turnResult,
        streamedToolCalls,
      });
      text = turnResult.content;
      reasoningContent = turnResult.reasoningContent;
      yield* flushPublishedNotices(turnId);

      yield await emit({
        type: "turn-finished",
        ...buildBaseEvent(),
        turnId,
        finishReason: turnResult.finishReason,
        resultType: turnResult.type,
        content: turnResult.content,
        reasoningContent: turnResult.reasoningContent,
        toolCalls:
          turnResult.type === "tool_calls" ? turnResult.toolCalls : undefined,
      });
      await recordTelemetry("agent.turn.finish", {
        turnId,
        finishReason: turnResult.finishReason,
        resultType: turnResult.type,
      });
      await closeSpan(turnSpan, {
        status: "ok",
        finishReason: turnResult.finishReason,
        resultType: turnResult.type,
      });

      if (turnResult.type === "response") {
        const finalMessage: AgentMessage = {
          role: "assistant",
          content: buildTextMessageContent(turnResult.content),
          reasoning_content: turnResult.reasoningContent || undefined,
        };
        state.messages = [...state.messages, finalMessage];
        const result: AgentRunResult = {
          traceId,
          runId,
          turnId,
          finishReason: turnResult.finishReason,
          content: turnResult.content,
          reasoningContent: turnResult.reasoningContent,
          finalMessage,
        };
        await runRuntimeHooks((hook) => hook.onRunFinish, {
          ...turnContext,
          turnId,
          result,
        });
        yield* flushPublishedNotices(turnId);

        await recordTelemetry("agent.run.finish", {
          turnId: result.turnId,
          finishReason: result.finishReason,
        });
        await closeSpan(runSpan, {
          status: "ok",
          turnId: result.turnId,
          finishReason: result.finishReason,
        });
        yield await emit({
          type: "run-finished",
          ...buildBaseEvent(),
          turnId: result.turnId,
          finishReason: result.finishReason,
          content: result.content,
          reasoningContent: result.reasoningContent,
          finalMessage: result.finalMessage,
        });
        return;
      }

      if (!state.toolModeActive) {
        yield* emitRunError(
          {
            name: "AgentRuntimeError",
            message: "模型请求了工具调用，但工具功能已被禁用",
          },
          runSpan,
          turnSpan,
          turnId,
        );
        return;
      }

      if (
        toolLoopCount >=
        (this.config.policies?.maxToolCallLoops ?? DEFAULT_MAX_TOOL_CALL_LOOPS)
      ) {
        yield* emitRunError(
          {
            name: "AgentRuntimeError",
            message: "工具调用次数过多",
          },
          runSpan,
          turnSpan,
          turnId,
        );
        return;
      }

      const currentToolCalls = turnResult.toolCalls;
      let executions = currentToolCalls.map<AgentToolExecutionState>((call) => {
        const tool = snapshot.findTool(call.function.name);
        return {
          toolCallId: call.id,
          toolName: call.function.name,
          source: tool?.source ?? "unknown",
          status: "pending",
          input: call.function.arguments || "",
          timestamp: Date.now(),
        };
      });

      yield await emit({
        type: "tool-call-planned",
        ...buildBaseEvent(),
        turnId,
        phase: "preview",
        toolCalls: currentToolCalls,
      });

      state.messages = [
        ...state.messages,
        buildAssistantToolCallMessage(currentToolCalls, {
          content: turnResult.content,
          reasoningContent: turnResult.reasoningContent,
        }),
      ];

      for (const call of currentToolCalls) {
        const execIndex = executions.findIndex(
          (execution) => execution.toolCallId === call.id,
        );
        const executionStartTime = Date.now();
        const toolSpan = await runtime.tracing.startSpan({
          name: "agent.tool_call",
          attributes: {
            traceId,
            runId,
            turnId,
            toolCallId: call.id,
            toolName: call.function.name,
          },
        });
        const currentExecution = executions[execIndex];
        await runRuntimeHooks((hook) => hook.onBeforeToolCall, {
          ...turnContext,
          turnId,
          call,
          execution: currentExecution,
          executions,
        });
        const resolvedTool = snapshot.findTool(call.function.name);
        const nextExecution = {
          ...currentExecution,
          toolName: call.function.name,
          source: resolvedTool?.source ?? currentExecution.source,
          input: call.function.arguments || "",
          status: "executing" as const,
        };
        executions = executions.map((execution, index) =>
          index === execIndex ? nextExecution : execution,
        );
        const defaultTimeoutMs =
          this.config.policies?.defaultToolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
        const toolExecutionPolicy = resolvedTool?.execution;
        const toolTimeoutOverride = toolExecutionPolicy?.timeoutMs;
        const shouldSkipTimeoutByPolicy =
          this.config.policies?.shouldSkipToolTimeout?.(call.function.name) ??
          false;
        const shouldSkipTimeout =
          toolTimeoutOverride === null || shouldSkipTimeoutByPolicy;
        const timeoutMs =
          typeof toolTimeoutOverride === "number"
            ? toolTimeoutOverride
            : (this.config.policies?.getToolTimeoutMs?.(
                call.function.name,
                defaultTimeoutMs,
              ) ?? defaultTimeoutMs);
        const maxRetry = shouldSkipTimeoutByPolicy
          ? 0
          : (this.config.policies?.maxToolRetries ?? DEFAULT_MAX_TOOL_RETRIES);

        yield* flushPublishedNotices(turnId);
        yield await emit({
          type: "tool-call-started",
          ...buildBaseEvent(),
          turnId,
          toolCalls: currentToolCalls,
          execution: cloneExecution(executions[execIndex]),
          executions: cloneExecutions(executions),
        });
        await recordTelemetry("agent.tool_call.start", {
          turnId,
          toolCallId: call.id,
          toolName: call.function.name,
          source: executions[execIndex]?.source,
        });

        let handled = false;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
          try {
            const toolResult = shouldSkipTimeout
              ? await snapshot.executeToolCall(call, {
                  signal: controller.signal,
                  conversationKey,
                  toolContext: request.toolContext,
                })
              : await Promise.race([
                  snapshot.executeToolCall(call, {
                    signal: controller.signal,
                    conversationKey,
                    toolContext: request.toolContext,
                  }),
                  new Promise<never>((_, reject) => {
                    setTimeout(() => {
                      reject(new Error("工具执行超时"));
                    }, timeoutMs);
                  }),
                ]);

            const content =
              toolResult?.content ?? "工具没有返回内容，已返回默认提示。";
            const duration = Date.now() - executionStartTime;
            state.messages = [
              ...state.messages,
              buildToolResultMessage(call, content, toolResult?.modelContent),
            ];

            executions = executions.map((execution, index) =>
              index === execIndex
                ? {
                    ...execution,
                    status: toolResult?.isCancelled
                      ? "cancelled"
                      : toolResult?.isParameterError
                        ? "failed"
                        : "success",
                    output:
                      toolResult?.isParameterError || toolResult?.isCancelled
                        ? undefined
                        : content,
                    error:
                      toolResult?.isParameterError || toolResult?.isCancelled
                        ? content
                        : undefined,
                    errorType: toolResult?.isParameterError
                      ? "parameter"
                      : undefined,
                    metadata: toolResult?.metadata,
                    duration,
                  }
                : execution,
            );
            await runRuntimeHooks((hook) => hook.onAfterToolCall, {
              ...turnContext,
              turnId,
              call,
              execution: executions[execIndex],
              executions,
            });

            yield* flushPublishedNotices(turnId);
            yield await emit({
              type: "tool-call-finished",
              ...buildBaseEvent(),
              turnId,
              toolCalls: currentToolCalls,
              execution: cloneExecution(executions[execIndex]),
              executions: cloneExecutions(executions),
            });
            await recordTelemetry("agent.tool_call.finish", {
              turnId,
              toolCallId: call.id,
              toolName: call.function.name,
              status: executions[execIndex]?.status,
              duration,
            });
            await closeSpan(toolSpan, {
              status: executions[execIndex]?.status,
              duration,
            });

            handled = true;
            break;
          } catch (error) {
            lastError = error as Error;
            const currentError = lastError;
            if (isAbortError(currentError)) {
              await closeSpan(toolSpan, {
                status: "cancelled",
                errorName: currentError.name,
                errorMessage: currentError.message,
                duration: Date.now() - executionStartTime,
              });
              yield* emitRunError(
                toErrorPayload(currentError),
                runSpan,
                undefined,
                turnId,
              );
              return;
            }
            const isTransient =
              this.config.policies?.isTransientToolError?.(
                currentError,
                call,
              ) ?? false;

            if (attempt < maxRetry && isTransient) {
              executions = executions.map((execution, index) =>
                index === execIndex
                  ? {
                      ...execution,
                      status: "retrying",
                      error: currentError.message,
                      errorType: "execution",
                      retryCount: attempt + 1,
                      duration: Date.now() - executionStartTime,
                    }
                  : execution,
              );

              yield await emit({
                type: "tool-call-updated",
                ...buildBaseEvent(),
                turnId,
                toolCalls: currentToolCalls,
                execution: cloneExecution(executions[execIndex]),
                executions: cloneExecutions(executions),
              });

              const retryDelay =
                this.config.policies?.retryDelayMs?.(
                  attempt + 1,
                  currentError,
                  call,
                ) ?? 1000 * (attempt + 1);
              await delay(retryDelay);

              executions = executions.map((execution, index) =>
                index === execIndex
                  ? {
                      ...execution,
                      status: "executing",
                    }
                  : execution,
              );

              yield await emit({
                type: "tool-call-updated",
                ...buildBaseEvent(),
                turnId,
                toolCalls: currentToolCalls,
                execution: cloneExecution(executions[execIndex]),
                executions: cloneExecutions(executions),
              });
              continue;
            }

            break;
          }
        }

        if (!handled && lastError) {
          state.messages = [
            ...state.messages,
            buildToolResultMessage(call, `工具执行失败: ${lastError.message}`),
          ];

          executions = executions.map((execution, index) =>
            index === execIndex
              ? {
                  ...execution,
                  status: "failed",
                  error: lastError!.message,
                  errorType: "execution",
                  retryCount: maxRetry,
                  duration: Date.now() - executionStartTime,
                }
              : execution,
          );
          await runRuntimeHooks((hook) => hook.onAfterToolCall, {
            ...turnContext,
            turnId,
            call,
            execution: executions[execIndex],
            executions,
          });

          yield* flushPublishedNotices(turnId);
          yield await emit({
            type: "tool-call-finished",
            ...buildBaseEvent(),
            turnId,
            toolCalls: currentToolCalls,
            execution: cloneExecution(executions[execIndex]),
            executions: cloneExecutions(executions),
          });
          await recordTelemetry("agent.tool_call.finish", {
            turnId,
            toolCallId: call.id,
            toolName: call.function.name,
            status: executions[execIndex]?.status,
            errorMessage: lastError.message,
            duration: executions[execIndex]?.duration,
          });
          await closeSpan(toolSpan, {
            status: executions[execIndex]?.status,
            errorMessage: lastError.message,
            duration: executions[execIndex]?.duration,
          });
        }
      }

      toolLoopCount += 1;
    }
  }

  async runToCompletion(request: AgentRunRequest): Promise<AgentRunResult> {
    let result: AgentRunResult | null = null;

    for await (const event of this.run(request)) {
      if (event.type === "run-error") {
        throw new Error(event.error.message);
      }

      if (event.type === "run-finished") {
        result = {
          traceId: event.traceId,
          runId: event.runId,
          turnId: event.turnId,
          finishReason: event.finishReason,
          content: event.content,
          reasoningContent: event.reasoningContent,
          finalMessage: event.finalMessage,
        };
      }
    }

    if (!result) {
      throw new Error("Agent 未返回完成结果");
    }

    return result;
  }

  private async resolveSnapshot(): Promise<ToolSnapshot> {
    const builtinTools = this.config.skills?.length
      ? createBuiltinSkillTools(this.config.skills)
      : [];
    const configuredTools = await resolveConfiguredTools(this.config.tools);

    return new ToolSnapshot(mergeTools(builtinTools, configuredTools));
  }
}
