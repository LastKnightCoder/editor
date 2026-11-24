import type { Model } from "@earendil-works/pi-ai";
import type { PiApiKind } from "../models";

export const requestModel = (api: PiApiKind): Model<PiApiKind> => ({
  id: "contract-model",
  name: "Contract model",
  provider: "opencode-go",
  api,
  baseUrl: "https://opencode.ai/zen/go/v1",
  reasoning: false,
  input: ["text", "image"],
  contextWindow: 8192,
  maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

export function protocolResponse(api: PiApiKind, text = "契约验证完成") {
  const event = (type: string, value: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
  let body: string;
  if (api === "openai-completions") {
    body = `data: ${JSON.stringify({
      id: "completion-contract",
      object: "chat.completion.chunk",
      created: 0,
      choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    })}\n\ndata: [DONE]\n\n`;
  } else if (api === "openai-responses") {
    const response = {
      id: "response-contract",
      object: "response",
      status: "completed",
      output: [
        {
          id: "message-contract",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text, annotations: [] }],
        },
      ],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    };
    body =
      event("response.created", { response: { ...response, status: "in_progress", output: [] } }) +
      event("response.output_item.added", {
        output_index: 0,
        item: { ...response.output[0], content: [] },
      }) +
      event("response.output_text.delta", { output_index: 0, content_index: 0, delta: text }) +
      event("response.output_item.done", { output_index: 0, item: response.output[0] }) +
      event("response.completed", { response });
  } else {
    body =
      event("message_start", {
        message: {
          id: "message-contract",
          type: "message",
          role: "assistant",
          model: "contract-model",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 8, output_tokens: 0 },
        },
      }) +
      event("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
      event("content_block_delta", { index: 0, delta: { type: "text_delta", text } }) +
      event("content_block_stop", { index: 0 }) +
      event("message_delta", {
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 4 },
      }) +
      event("message_stop", {});
  }
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

export function protocolToolResponse(api: PiApiKind) {
  const name = "contract_add";
  const args = JSON.stringify({ left: 19, right: 23 });
  const event = (type: string, value: object) =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
  let body: string;
  if (api === "openai-completions") {
    body = `data: ${JSON.stringify({
      id: "tool-contract",
      object: "chat.completion.chunk",
      created: 0,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "call_contract",
                type: "function",
                function: { name, arguments: args },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    })}\n\ndata: [DONE]\n\n`;
  } else if (api === "openai-responses") {
    const item = {
      id: "fc_contract",
      type: "function_call",
      call_id: "call_contract",
      name,
      arguments: args,
      status: "completed",
    };
    body =
      event("response.created", {
        response: { id: "response-tool", status: "in_progress", output: [] },
      }) +
      event("response.output_item.added", { output_index: 0, item: { ...item, arguments: "" } }) +
      event("response.output_item.done", { output_index: 0, item }) +
      event("response.completed", {
        response: {
          id: "response-tool",
          status: "completed",
          output: [item],
          usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
        },
      });
  } else {
    body =
      event("message_start", {
        message: {
          id: "message-tool",
          type: "message",
          role: "assistant",
          content: [],
          stop_reason: null,
          model: "contract-model",
          usage: { input_tokens: 8, output_tokens: 0 },
        },
      }) +
      event("content_block_start", {
        index: 0,
        content_block: { type: "tool_use", id: "call_contract", name, input: {} },
      }) +
      event("content_block_delta", {
        index: 0,
        delta: { type: "input_json_delta", partial_json: args },
      }) +
      event("content_block_stop", { index: 0 }) +
      event("message_delta", {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 4 },
      }) +
      event("message_stop", {});
  }
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}
