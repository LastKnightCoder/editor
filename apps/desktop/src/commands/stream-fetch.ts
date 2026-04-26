import { invoke, on, off } from "@/electron";
import type { ToolCallPayload } from "@/types";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";

function prettyObject(msg: any) {
  const obj = msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

const emitDebugLog = (event: string, payload: unknown) => {
  console.info(`[DEBUG] ${event} ${JSON.stringify(payload)}`);
};

const summarizeText = (text: string | undefined | null, limit = 120) => {
  const normalized = text || "";
  return {
    length: normalized.length,
    preview:
      normalized.length > limit
        ? `${normalized.slice(0, limit)}...`
        : normalized,
  };
};

type ResponseEvent = {
  id: number;
};

type StreamResponsePayload = {
  requestId?: number;
  status?: number;
  chunk?: number[] | Buffer;
};

type StreamResponse = {
  requestId: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
};

type StreamCallbacks = {
  onFinish?: (
    content: string,
    reasoning_content: string,
    res: Response,
  ) => void;
  onError?: (e: Error) => void;
  onUpdate?: (full: string, inc: string, reasoningText?: string) => void;
  onReasoning?: (full: string, inc: string) => void;
  onToolCallsDelta?: (toolCalls: ToolCallPayload[]) => void;
  deferAssistantTextUntilFinish?: boolean;
  /** 禁用 requestAnimationFrame 动画缓冲，SSE 数据直接透传回调（用于 WebSocket 转发场景） */
  disableAnimation?: boolean;
};

type ToolCallDelta = {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type ResponsesFunctionCallState = {
  id?: string;
  callId?: string;
  name?: string;
  arguments: string;
};

type ResponsesToolCallDelta = ToolCallPayload & {
  index: number;
};

interface PartialToolCall {
  id?: string;
  type?: string;
  function: {
    name?: string;
    arguments: string;
  };
}

const buildToolCallList = (
  buffer: Map<number, PartialToolCall>,
): ToolCallPayload[] => {
  return Array.from(buffer.entries())
    .sort(([a], [b]) => a - b)
    .map(([, call], index) => ({
      id: call.id ?? `call_${index}`,
      type: call.type ?? "function",
      function: {
        name: call.function.name ?? "",
        arguments: call.function.arguments ?? "",
      },
    }));
};

const buildResponsesToolCallList = (
  buffer: Map<number, ResponsesFunctionCallState>,
): ResponsesToolCallDelta[] =>
  Array.from(buffer.entries())
    .sort(([a], [b]) => a - b)
    .map(([outputIndex, call]) => ({
      id: call.callId ?? call.id ?? `call_${outputIndex}`,
      index: outputIndex,
      type: "function",
      function: {
        name: call.name ?? "",
        arguments: call.arguments,
      },
    }))
    .filter((call) => call.function.name);

export const createResponsesStreamParser = () => {
  const functionCalls = new Map<number, ResponsesFunctionCallState>();
  const upsertFunctionCall = (
    outputIndex: number,
    patch: Partial<ResponsesFunctionCallState>,
  ) => {
    const existing = functionCalls.get(outputIndex) ?? { arguments: "" };
    functionCalls.set(outputIndex, { ...existing, ...patch });
  };

  const toolCallsDelta = (argumentDeltas?: Map<number, string>) => {
    const toolCalls = buildResponsesToolCallList(functionCalls);
    return toolCalls.length > 0
      ? {
          delta: {
            tool_calls: toolCalls.map((call) => ({
              ...call,
              function: {
                ...call.function,
                arguments: argumentDeltas?.get(call.index) ?? "",
              },
            })),
          },
          finish_reason: "tool_calls" as const,
        }
      : undefined;
  };

  return {
    parse: (text: string) => {
      const event = JSON.parse(text);
      switch (event.type) {
        case "response.output_text.delta":
          return { delta: { content: event.delta as string } };
        case "response.reasoning_summary_text.delta":
        case "response.reasoning_summary.delta":
        case "response.reasoning.delta":
          return { delta: { reasoning_content: event.delta as string } };
        case "response.output_item.added":
        case "response.output_item.done": {
          const item = event.item;
          if (item?.type !== "function_call") {
            return undefined;
          }
          upsertFunctionCall(event.output_index ?? 0, {
            id: item.id,
            callId: item.call_id,
            name: item.name,
            arguments: item.arguments ?? "",
          });
          return toolCallsDelta();
        }
        case "response.function_call_arguments.delta": {
          const outputIndex = event.output_index ?? 0;
          const existing = functionCalls.get(outputIndex) ?? { arguments: "" };
          const argumentDelta = event.delta ?? "";
          upsertFunctionCall(outputIndex, {
            id: event.item_id,
            arguments: `${existing.arguments}${argumentDelta}`,
          });
          return toolCallsDelta(new Map([[outputIndex, argumentDelta]]));
        }
        case "response.function_call_arguments.done": {
          const outputIndex = event.output_index ?? 0;
          const existing = functionCalls.get(outputIndex) ?? { arguments: "" };
          const finalArguments = event.arguments ?? "";
          const missingArguments = finalArguments.startsWith(existing.arguments)
            ? finalArguments.slice(existing.arguments.length)
            : finalArguments;
          upsertFunctionCall(event.output_index ?? 0, {
            id: event.item_id,
            arguments: finalArguments,
          });
          return missingArguments
            ? toolCallsDelta(new Map([[outputIndex, missingArguments]]))
            : { finish_reason: "tool_calls" as const };
        }
        case "response.completed": {
          let addedFromCompleted = false;
          for (const [index, item] of (
            event.response?.output ?? []
          ).entries()) {
            if (item?.type === "function_call") {
              const existing = functionCalls.get(index);
              addedFromCompleted = !existing;
              upsertFunctionCall(index, {
                id: item.id,
                callId: item.call_id,
                name: item.name,
                arguments: existing?.arguments || item.arguments || "",
              });
            }
          }
          if (addedFromCompleted) {
            return toolCallsDelta(
              new Map(
                Array.from(functionCalls.entries()).map(([index, call]) => [
                  index,
                  call.arguments,
                ]),
              ),
            );
          }
          return functionCalls.size > 0
            ? { finish_reason: "tool_calls" as const }
            : { finish_reason: "stop" as const };
        }
        case "response.failed":
        case "response.incomplete":
        case "error":
          throw new Error(
            event.error?.message ??
              event.response?.error?.message ??
              "Responses API 请求失败",
          );
        default:
          return undefined;
      }
    },
  };
};

export type StreamLifecycleResult =
  | {
      type: "response";
      finishReason: string | null;
    }
  | {
      type: "tool_calls";
      finishReason: "tool_calls";
      toolCalls: ToolCallPayload[];
      content: string;
      reasoning_content: string;
    };

export const streamFetch = async (
  url: string,
  options?: RequestInit,
): Promise<Response> => {
  const {
    signal,
    method = "GET",
    headers: _headers = {},
    body = "",
  } = options || {};

  let setRequestId: ((id?: number) => void) | undefined;
  const requestIdPromise = new Promise<number | undefined>(
    (resolve) => (setRequestId = resolve),
  );
  const ts = new TransformStream();
  const writer = ts.writable.getWriter();

  let closed = false;

  const handleResponse = (_e: ResponseEvent, data: StreamResponsePayload) =>
    requestIdPromise.then((requestId) => {
      const { requestId: rid, chunk, status } = data || {};
      if (
        typeof requestId !== "number" ||
        typeof rid !== "number" ||
        requestId !== rid
      ) {
        return;
      }
      if (chunk) {
        if (!closed) {
          writer.write(new Uint8Array(chunk));
        }
      } else if (status === 0) {
        close();
      }
    });
  const close = () => {
    if (closed) return;
    off("stream-response", handleResponse);
    closed = true;
    writer.ready.then(() => {
      writer.close().catch((e) => console.error(e));
    });
  };

  const handleAbort = async () => {
    const rid = await requestIdPromise;
    if (rid) {
      try {
        await invoke("stream-fetch-cancel", { requestId: rid });
      } catch (error) {
        console.error("Failed to cancel stream request:", error);
      }
    }
  };

  if (signal) {
    signal.addEventListener("abort", handleAbort);
  }

  // 2. listen response multi times, and write to Response.body
  on("stream-response", handleResponse);

  const headers: Record<string, string> = {};
  for (const item of new Headers(_headers || {})) {
    headers[item[0]] = item[1];
  }
  try {
    const res: StreamResponse = await invoke("stream-fetch", {
      method: method.toUpperCase(),
      url,
      headers,
      body,
    });
    const { requestId, status, statusText, headers: resHeaders } = res;
    setRequestId?.(requestId);
    const response = new Response(ts.readable, {
      status,
      statusText,
      headers: resHeaders,
    });
    if (status >= 300) {
      setTimeout(close, 100);
    }
    return response;
  } catch (e) {
    console.error("stream error", e);
    return new Response("", { status: 599 });
  }
};

export function stream(
  chatPath: string,
  requestPayload: object,
  headers: Record<string, string>,
  controller: AbortController,
  parseSSE: {
    parse: (
      text: string,
    ) => { delta?: any; finish_reason?: string | null } | undefined;
    flush?: () => { delta?: any; finish_reason?: string | null } | undefined;
  },
  options: StreamCallbacks,
): Promise<StreamLifecycleResult> {
  return new Promise((resolve, reject) => {
    let responseText = "";
    let remainText = "";
    let reasoningText = "";
    let reasoningRemainText = "";
    let finished = false;
    let responseRes: Response;
    let finishReason: string | null = null;
    const toolCallBuffer = new Map<number, PartialToolCall>();
    let parserFlushed = false;
    const streamDebugState = {
      sawFirstContent: false,
      sawFirstReasoning: false,
      sawFirstToolCalls: false,
      sawDone: false,
      contentChunkCount: 0,
      reasoningChunkCount: 0,
      toolCallDeltaCount: 0,
      finishReasonHistory: [] as string[],
      eventSequence: [] as string[],
    };

    const recordEvent = (event: string) => {
      if (
        streamDebugState.eventSequence[
          streamDebugState.eventSequence.length - 1
        ] !== event
      ) {
        streamDebugState.eventSequence.push(event);
      }
    };

    const recordFinishReason = (reason: string | null | undefined) => {
      if (
        reason &&
        streamDebugState.finishReasonHistory[
          streamDebugState.finishReasonHistory.length - 1
        ] !== reason
      ) {
        streamDebugState.finishReasonHistory.push(reason);
      }
    };

    const flushRemainText = () => {
      responseText += remainText;
      if (!options.deferAssistantTextUntilFinish) {
        options.onUpdate?.(responseText, remainText, reasoningText);
      }
      remainText = "";
    };

    const flushReasoningText = () => {
      reasoningText += reasoningRemainText;
      options.onReasoning?.(reasoningText, reasoningRemainText);
      reasoningRemainText = "";
    };

    const applyParsedChunk = (
      parsed: { delta?: any; finish_reason?: string | null } | undefined,
    ) => {
      const delta =
        parsed && "delta" in parsed ? parsed.delta : (parsed as any);
      if (parsed?.finish_reason) {
        finishReason = parsed.finish_reason;
        recordFinishReason(parsed.finish_reason);
      }
      if (!delta) {
        return;
      }

      const { content, reasoning_content, tool_calls } = delta;
      if (options.disableAnimation) {
        if (content) {
          streamDebugState.contentChunkCount += 1;
          recordEvent("content");
          if (!streamDebugState.sawFirstContent) {
            streamDebugState.sawFirstContent = true;
            emitDebugLog("ChatAPI.first_content_delta", {
              finishReason,
              chunk: summarizeText(content),
            });
          }
          responseText += content;
          if (!options.deferAssistantTextUntilFinish) {
            options.onUpdate?.(responseText, content, reasoningText);
          }
        }
        if (reasoning_content) {
          streamDebugState.reasoningChunkCount += 1;
          recordEvent("reasoning");
          if (!streamDebugState.sawFirstReasoning) {
            streamDebugState.sawFirstReasoning = true;
            emitDebugLog("ChatAPI.first_reasoning_delta", {
              finishReason,
              chunk: summarizeText(reasoning_content),
            });
          }
          reasoningText += reasoning_content;
          options.onReasoning?.(reasoningText, reasoning_content);
        }
      } else {
        if (content) {
          streamDebugState.contentChunkCount += 1;
          recordEvent("content");
          if (!streamDebugState.sawFirstContent) {
            streamDebugState.sawFirstContent = true;
            emitDebugLog("ChatAPI.first_content_delta", {
              finishReason,
              chunk: summarizeText(content),
            });
          }
          remainText += content;
        }
        if (reasoning_content) {
          streamDebugState.reasoningChunkCount += 1;
          recordEvent("reasoning");
          if (!streamDebugState.sawFirstReasoning) {
            streamDebugState.sawFirstReasoning = true;
            emitDebugLog("ChatAPI.first_reasoning_delta", {
              finishReason,
              chunk: summarizeText(reasoning_content),
            });
          }
          reasoningRemainText += reasoning_content;
        }
      }
      if (Array.isArray(tool_calls)) {
        streamDebugState.toolCallDeltaCount += tool_calls.length;
        recordEvent("tool_calls");
        for (const partial of tool_calls as ToolCallDelta[]) {
          const existing = toolCallBuffer.get(partial.index) ?? {
            function: { arguments: "" },
          };
          if (partial.id) {
            existing.id = partial.id;
          }
          if (partial.type) {
            existing.type = partial.type;
          }
          if (partial.function?.name) {
            existing.function.name = partial.function.name;
          }
          if (partial.function?.arguments) {
            existing.function.arguments += partial.function.arguments;
          }
          toolCallBuffer.set(partial.index, existing);
        }
        const toolCallList = buildToolCallList(toolCallBuffer);
        if (!streamDebugState.sawFirstToolCalls) {
          streamDebugState.sawFirstToolCalls = true;
          emitDebugLog("ChatAPI.first_tool_calls_delta", {
            finishReason,
            toolCalls: toolCallList.map((call) => ({
              id: call.id,
              name: call.function.name,
              argumentLength: call.function.arguments?.length ?? 0,
            })),
          });
        }
        options.onToolCallsDelta?.(toolCallList);
      }
    };

    const flushParser = () => {
      if (parserFlushed) {
        return;
      }
      parserFlushed = true;
      applyParsedChunk(parseSSE.flush?.());
    };

    function animateResponseText() {
      if (finished || controller.signal.aborted) {
        flushReasoningText();
        flushRemainText();
        if (responseText?.length === 0 && finishReason !== "tool_calls") {
          options.onError?.(new Error("empty response from server"));
        }
        return;
      }

      if (reasoningRemainText.length > 0) {
        const fetchCount = Math.max(
          1,
          Math.round(reasoningRemainText.length / 60),
        );
        const fetchText = reasoningRemainText.slice(0, fetchCount);
        reasoningText += fetchText;
        reasoningRemainText = reasoningRemainText.slice(fetchCount);
        options.onReasoning?.(reasoningText, fetchText);
      } else if (remainText.length > 0) {
        const fetchCount = Math.max(1, Math.round(remainText.length / 60));
        const fetchText = remainText.slice(0, fetchCount);
        responseText += fetchText;
        remainText = remainText.slice(fetchCount);
        if (!options.deferAssistantTextUntilFinish) {
          options.onUpdate?.(responseText, fetchText, reasoningText);
        }
      }

      requestAnimationFrame(animateResponseText);
    }

    // 仅在启用动画时才启动 requestAnimationFrame 循环
    if (!options.disableAnimation) {
      animateResponseText();
    }

    const finish = (reason?: string) => {
      if (finished) {
        return;
      }
      flushParser();
      finished = true;
      finishReason = reason ?? finishReason;
      flushReasoningText();
      flushRemainText();

      const pendingToolCalls = toolCallBuffer.size
        ? buildToolCallList(toolCallBuffer)
        : [];

      emitDebugLog("ChatAPI.stream_finish", {
        finishReason,
        explicitReason: reason ?? null,
        sawDone: streamDebugState.sawDone,
        sawContent: streamDebugState.sawFirstContent,
        sawReasoning: streamDebugState.sawFirstReasoning,
        sawToolCalls: streamDebugState.sawFirstToolCalls,
        contentChunkCount: streamDebugState.contentChunkCount,
        reasoningChunkCount: streamDebugState.reasoningChunkCount,
        toolCallDeltaCount: streamDebugState.toolCallDeltaCount,
        finishReasonHistory: streamDebugState.finishReasonHistory,
        eventSequence: streamDebugState.eventSequence,
        responseText: summarizeText(responseText + remainText),
        reasoningText: summarizeText(reasoningText + reasoningRemainText),
        pendingToolCalls: pendingToolCalls.map((call) => ({
          id: call.id,
          name: call.function.name,
          argumentLength: call.function.arguments?.length ?? 0,
        })),
      });

      if (finishReason === "tool_calls" || pendingToolCalls.length > 0) {
        resolve({
          type: "tool_calls",
          finishReason: "tool_calls",
          toolCalls: pendingToolCalls,
          content: responseText + remainText,
          reasoning_content: reasoningText + reasoningRemainText,
        });
        return;
      }

      options.onFinish?.(
        responseText + remainText,
        reasoningText + reasoningRemainText,
        responseRes,
      );
      resolve({
        type: "response",
        finishReason: finishReason ?? null,
      });
    };

    controller.signal.onabort = () => finish("cancelled");

    const chatApi = (
      targetPath: string,
      requestHeaders: Record<string, string>,
      payload: any,
    ) => {
      const chatPayload = {
        method: "POST",
        body: payload,
        signal: controller.signal,
        headers: requestHeaders,
      };
      const requestTimeoutId = setTimeout(() => controller.abort(), 60 * 1000);
      emitDebugLog("ChatAPI.stream_start", {
        url: targetPath,
        method: "POST",
        headerKeys: Object.keys(requestHeaders),
        hasTools: Array.isArray((payload as any)?.tools),
        toolCount: Array.isArray((payload as any)?.tools)
          ? (payload as any).tools.length
          : 0,
        messageCount: Array.isArray((payload as any)?.messages)
          ? (payload as any).messages.length
          : 0,
        deferAssistantTextUntilFinish: Boolean(
          options.deferAssistantTextUntilFinish,
        ),
        disableAnimation: Boolean(options.disableAnimation),
      });
      return fetchEventSource(targetPath, {
        fetch: streamFetch as any,
        ...chatPayload,
        async onopen(res) {
          clearTimeout(requestTimeoutId);
          const contentType = res.headers.get("content-type");
          responseRes = res;

          if (contentType?.startsWith("text/plain")) {
            responseText = await res.clone().text();
            return finish();
          }

          if (
            !res.ok ||
            !res.headers
              .get("content-type")
              ?.startsWith(EventStreamContentType) ||
            res.status !== 200
          ) {
            const responseTexts = [responseText];
            let extraInfo = await res.clone().text();
            try {
              const resJson = await res.clone().json();
              extraInfo = prettyObject(resJson);
            } catch (error) {
              console.error("[Request] parse json error", {
                error,
                status: res.status,
                statusText: res.statusText,
                rawBody: extraInfo,
              });
            }

            if (res.status === 401) {
              responseTexts.push("无权限");
            }

            if (extraInfo) {
              responseTexts.push(extraInfo);
            }

            responseText = responseTexts.join("\n\n");

            return finish();
          }
        },
        onmessage(msg) {
          if (msg.data === "[DONE]" || finished) {
            streamDebugState.sawDone = true;
            recordEvent("done");
            return finish();
          }
          const text = msg.data;
          if (text == null || text === "") {
            return;
          }
          try {
            applyParsedChunk(parseSSE.parse(msg.data));
          } catch (error) {
            if (/^\s+$/.test(text)) {
              return;
            }
            console.error("[Request] parse error", text, msg, error);
          }
        },
        onclose() {
          recordEvent("close");
          finish();
        },
        onerror(e) {
          options?.onError?.(e);
          throw e;
        },
        openWhenHidden: true,
      }).finally(() => {
        clearTimeout(requestTimeoutId);
      });
    };
    chatApi(chatPath, headers, requestPayload)
      .then(() => {
        if (!finished) {
          finish();
        }
      })
      .catch((error: Error) => {
        if (!finished) {
          finished = true;
          options?.onError?.(error as Error);
          reject(error);
        }
      });
  });
}
