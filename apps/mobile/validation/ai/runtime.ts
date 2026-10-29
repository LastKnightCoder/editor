import {
  Agent,
  type AgentOptions,
  type AgentState,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { streamSimple as completions } from "@earendil-works/pi-ai/api/openai-completions";
import { streamSimple as responses } from "@earendil-works/pi-ai/api/openai-responses";
import { streamSimple as anthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import { Type, type TSchema } from "typebox";
import { Assert } from "typebox/value";
import type * as tauri from "../../src/services/tauri";

export type ValidationApi = "openai-completions" | "openai-responses" | "anthropic-messages";
export type CardCommands = Pick<
  typeof tauri,
  "getCardsOverview" | "getCardDetail" | "getContentDetail" | "updateContent"
>;

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  details: undefined,
});

function defineValidationTool<Schema extends TSchema>(tool: AgentTool<Schema>): AgentTool {
  return {
    ...tool,
    async execute(id, args, signal, onUpdate) {
      Assert(tool.parameters, args);
      return tool.execute(id, args, signal, onUpdate);
    },
  };
}

/** 仅验证普通本地卡片的追加写入，不接入生产入口与真实用户数据。 */
export function createValidationTools(commands: CardCommands) {
  const snapshots = new Map<number, Awaited<ReturnType<CardCommands["getContentDetail"]>>>();
  const search = Type.Object({ query: Type.String() }, { additionalProperties: false });
  const read = Type.Object({ id: Type.Integer({ minimum: 1 }) });
  const edit = Type.Object({ id: Type.Integer({ minimum: 1 }), text: Type.String() });
  const skill = Type.Object({ name: Type.Literal("card-summary") });
  return [
    defineValidationTool({
      name: "search_cards",
      label: "搜索卡片",
      description: "分页搜索本机卡片，最多返回十条",
      parameters: search,
      async execute(_id, args, signal) {
        signal?.throwIfAborted();
        const cards = await commands.getCardsOverview({ page: 1, pageSize: 10, query: args.query });
        signal?.throwIfAborted();
        return result(cards.items.map(card => ({ id: card.id, excerpt: card.excerpt })));
      },
    } satisfies AgentTool<typeof search>),
    defineValidationTool({
      name: "read_card",
      label: "读取卡片",
      description: "读取一张卡片并保存供条件写入使用的快照",
      parameters: read,
      async execute(_id, args, signal) {
        signal?.throwIfAborted();
        const card = await commands.getCardDetail(args.id);
        signal?.throwIfAborted();
        const document = await commands.getContentDetail(card.contentId);
        signal?.throwIfAborted();
        snapshots.set(args.id, document);
        return result({ id: args.id, content: document.content });
      },
    } satisfies AgentTool<typeof read>),
    defineValidationTool({
      name: "edit_card",
      label: "追加卡片正文",
      description: "向已读取的普通本地卡片追加一段纯文本",
      parameters: edit,
      executionMode: "sequential",
      async execute(_id, args, signal) {
        signal?.throwIfAborted();
        const document = snapshots.get(args.id);
        if (!document?.revision || !document.documentId || !document.librarySourceId)
          throw new Error("必须先读取具有完整版本身份的本地卡片");
        snapshots.delete(args.id);
        const updated = await commands.updateContent({
          contentId: document.contentId,
          content: [
            ...document.content,
            { type: "paragraph", children: [{ type: "formatted", text: args.text }] },
          ],
          contracts: document.contracts ?? undefined,
          count: 0,
          expectedRevision: document.revision,
          expectedDocumentId: document.documentId,
          expectedSourceId: document.librarySourceId,
        });
        return result({ contentId: updated.contentId, saved: true });
      },
    } satisfies AgentTool<typeof edit>),
    defineValidationTool({
      name: "load_skill",
      label: "加载技能",
      description: "加载内置的 card-summary 技能说明",
      parameters: skill,
      async execute(_id, _args, signal) {
        signal?.throwIfAborted();
        return result({ instructions: "先搜索并读取卡片，再将行动项追加到正文末尾。" });
      },
    } satisfies AgentTool<typeof skill>),
  ];
}

export function createValidationAgent(options: {
  api: ValidationApi;
  fetch: typeof globalThis.fetch;
  tools?: AgentState["tools"];
  beforeToolCall?: AgentOptions["beforeToolCall"];
  baseUrl?: string;
}) {
  const model: Model<ValidationApi> = {
    id: "validation-model",
    name: "验证专用模型",
    provider: "validation",
    api: options.api,
    baseUrl: options.baseUrl ?? "https://validation.invalid/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 16000,
    maxTokens: 1000,
  };
  let turns = 0;
  return new Agent({
    initialState: {
      model,
      systemPrompt: "使用本机工具处理卡片。需要整理行动项时先加载 card-summary 技能。",
      tools: options.tools ?? [],
    },
    toolExecution: "sequential",
    beforeToolCall: options.beforeToolCall,
    finishTurn: () => (++turns >= 8 ? { action: "end" } : undefined),
    streamFn(model, context, settings) {
      const request = {
        ...settings,
        apiKey: "validation-only-not-a-real-key",
        fetch: options.fetch,
        maxRetries: 0,
        temperature: 0,
      };
      switch (options.api) {
        case "openai-completions":
          return completions(model as Model<"openai-completions">, context, request);
        case "openai-responses":
          return responses(model as Model<"openai-responses">, context, request);
        case "anthropic-messages":
          return anthropic(model as Model<"anthropic-messages">, context, request);
      }
    },
  });
}
