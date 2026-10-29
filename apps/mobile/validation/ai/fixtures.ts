import type { CardDetailResponse, ContentDetailResponse } from "../../src/types";
import type { CardCommands, ValidationApi } from "./runtime";

export type Turn = { text: string } | { name: string; args: Record<string, unknown> };
const encoder = new TextEncoder();
const frame = (data: unknown, event?: string) =>
  `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;

export function encodeTurn(api: ValidationApi, turn: Turn, index: number): string {
  const tool = "name" in turn;
  if (api === "openai-completions") {
    const chunk = (delta: unknown, finish_reason: string | null = null) =>
      frame({
        id: `chat-${index}`,
        object: "chat.completion.chunk",
        created: 1,
        model: "validation-model",
        choices: [{ index: 0, delta, finish_reason }],
      });
    return (
      chunk({ role: "assistant" }) +
      (tool
        ? chunk({
            tool_calls: [
              {
                index: 0,
                id: `call-${index}`,
                type: "function",
                function: { name: turn.name, arguments: "" },
              },
            ],
          }) +
          chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(turn.args) } }] })
        : chunk({ content: turn.text })) +
      chunk({}, tool ? "tool_calls" : "stop") +
      "data: [DONE]\n\n"
    );
  }
  if (api === "anthropic-messages") {
    const event = (type: string, data: object) => frame({ type, ...data }, type);
    return (
      event("message_start", {
        message: {
          id: `message-${index}`,
          type: "message",
          role: "assistant",
          model: "validation-model",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      }) +
      event("content_block_start", {
        index: 0,
        content_block: tool
          ? { type: "tool_use", id: `call-${index}`, name: turn.name, input: {} }
          : { type: "text", text: "" },
      }) +
      event("content_block_delta", {
        index: 0,
        delta: tool
          ? { type: "input_json_delta", partial_json: JSON.stringify(turn.args) }
          : { type: "text_delta", text: turn.text },
      }) +
      event("content_block_stop", { index: 0 }) +
      event("message_delta", {
        delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null },
        usage: { output_tokens: 5 },
      }) +
      event("message_stop", {})
    );
  }
  const event = (type: string, data: object) => frame({ type, ...data });
  const item = tool
    ? {
        type: "function_call",
        id: `fc-${index}`,
        call_id: `call-${index}`,
        name: turn.name,
        arguments: JSON.stringify(turn.args),
        status: "completed",
      }
    : {
        type: "message",
        id: `msg-${index}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: turn.text, annotations: [] }],
      };
  const response = {
    id: `resp-${index}`,
    object: "response",
    model: "validation-model",
    status: "completed",
    output: [item],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
  return (
    event("response.created", { response: { ...response, status: "in_progress", output: [] } }) +
    event("response.output_item.added", {
      output_index: 0,
      item: tool
        ? { ...item, arguments: "", status: "in_progress" }
        : { ...item, content: [], status: "in_progress" },
    }) +
    (tool
      ? event("response.function_call_arguments.delta", {
          item_id: item.id,
          output_index: 0,
          delta: JSON.stringify(turn.args),
        })
      : event("response.content_part.added", {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        }) +
        event("response.output_text.delta", {
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          delta: turn.text,
        })) +
    event("response.output_item.done", { output_index: 0, item }) +
    event("response.completed", { response })
  );
}

/** 用 UTF-8 字节分片，覆盖汉字与 JSON 参数被网络分块切开的情况。 */
export function streamResponse(text: string) {
  const bytes = encoder.encode(text);
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

export function scriptedFetch(api: ValidationApi, turns: Turn[]) {
  const requests: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    const index = requests.length;
    requests.push(JSON.parse(String(init?.body)));
    if (!turns[index]) throw new Error("出现预期之外的模型请求");
    return streamResponse(encodeTurn(api, turns[index], index));
  };
  return { fetch, requests };
}

export const documentFixture: ContentDetailResponse = {
  contentId: 101,
  content: [{ type: "paragraph", children: [{ type: "formatted", text: "会议记录" }] }],
  count: 4,
  createTime: 1,
  updateTime: 1,
  revision: "revision-1",
  documentId: "local-document-101",
  librarySourceId: "validation-library",
  contracts: {},
  card: { id: 1, createTime: 1, updateTime: 1, tags: [], links: [] },
};
export const cardFixture: CardDetailResponse = {
  id: 1,
  contentId: 101,
  content: documentFixture.content,
  count: 4,
  createTime: 1,
  updateTime: 1,
  tags: [],
  links: [],
};
export const searchFixture = {
  total: 1,
  page: 1,
  pageSize: 10,
  query: "会议",
  searchMode: "like",
  items: [{ ...cardFixture, excerpt: "会议记录" }],
};
export const cardTurns: Turn[] = [
  { name: "load_skill", args: { name: "card-summary" } },
  { name: "search_cards", args: { query: "会议" } },
  { name: "read_card", args: { id: 1 } },
  { name: "edit_card", args: { id: 1, text: "行动项：周五提交方案" } },
  { text: "已整理并保存行动项。" },
];

export function memoryCommands() {
  let document = structuredClone(documentFixture);
  const writes: Parameters<CardCommands["updateContent"]>[0][] = [];
  const commands: CardCommands = {
    async getCardsOverview() {
      return structuredClone(searchFixture);
    },
    async getCardDetail() {
      return structuredClone(cardFixture);
    },
    async getContentDetail() {
      return structuredClone(document);
    },
    async updateContent(payload) {
      writes.push(payload);
      document = {
        ...document,
        content: payload.content as ContentDetailResponse["content"],
        revision: "revision-2",
      };
      return document;
    },
  };
  return { commands, writes };
}
