/**
 * 页面对话：每个页面一段持续的对话（存在 Tau，按页面归档），回答经 v2 运行协议流式推来。
 * 选区快答（解释 / 翻译 / 概括）也走同一段对话，回答同时显示在选区旁的气泡里，
 * 「在面板继续」就是打开面板接着聊。
 */
import {
  applyChatStreamEvent,
  createAssistantMessage,
  createRunEventFilter,
  Role,
  type AiRunEvent,
  type AiRunEventNotification,
  type AiRunStateResult,
  type ResponseMessage,
} from "@tau/shared/chat-core";
import {
  COMPANION_METHODS,
  type ChatHistoryResult,
  type CompanionRunStartParams,
  type ModelOption,
} from "@tau/shared/browser-companion";
import { pageKeyOf } from "../../shared/messages";
import type { BackgroundBridge } from "../bridge";
import { extractPage, pageAsPrompt, type PageContent } from "../page/extract";
import {
  getState,
  initialChat,
  patchChat,
  setState,
  type QuickKind,
  type QuoteContext,
} from "./store";

export const PAGE_TOOLS: CompanionRunStartParams["browserTools"] = [
  {
    type: "function",
    function: {
      name: "read_page",
      description:
        "按段落编号读取当前网页正文（每段以 [n] 开头）。正文没有完整给出、需要后文时使用。",
      parameters: {
        type: "object",
        properties: {
          from: { type: "number", description: "起始段号（含），从 1 开始" },
          to: { type: "number", description: "结束段号（含），一次最多 40 段" },
        },
        required: ["from"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_annotations",
      description: "读取用户在当前网页上做的高亮与批注。",
      parameters: { type: "object", properties: {} },
    },
  },
];

const QUICK_PROMPTS: Record<QuickKind, string> = {
  explain: "解释这段话的意思和它在文中的作用，简洁一些。",
  translate: "把这段话翻译成中文（原文是中文就翻译成英文），只给译文。",
  summarize: "用两三句话概括这段话。",
};

export const QUICK_LABELS: Record<QuickKind, string> = {
  explain: "解释",
  translate: "翻译",
  summarize: "概括这段",
};

const randomId = (prefix: string) =>
  `${prefix}${Array.from(crypto.getRandomValues(new Uint8Array(10)), byte => byte.toString(16).padStart(2, "0")).join("")}`;

/** 用户消息正文：引用的原文以 Markdown 引用块放在前面 */
export function composeUserText(question: string, quote: QuoteContext | null): string {
  if (!quote) return question;
  const quoted = quote.text
    .split("\n")
    .map(line => `> ${line}`)
    .join("\n");
  const where = quote.block ? `\n>\n> （第 ${quote.block} 段）` : "";
  return `${quoted}${where}\n\n${question}`;
}

/** 展示用：拆出开头的引用块 */
export function splitQuote(text: string): { quote: string | null; body: string } {
  const lines = text.split("\n");
  if (!lines[0]?.startsWith("> ")) return { quote: null, body: text };
  const quoted: string[] = [];
  let i = 0;
  for (; i < lines.length && lines[i].startsWith(">"); i += 1) {
    const line = lines[i].replace(/^> ?/, "");
    if (!/^（第 \d+ 段）$/.test(line)) quoted.push(line);
  }
  return { quote: quoted.join("\n").trim(), body: lines.slice(i).join("\n").trim() };
}

export const messageText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map(item => (item as { text?: string }).text ?? "").join("")
      : "";

export class PageChat {
  private filters = new Map<string, (notification: AiRunEventNotification) => AiRunEvent | null>();
  private page: PageContent | null = null;
  private url = "";

  constructor(private readonly bridge: BackgroundBridge) {}

  /** 换页（含 SPA 路由变化）：丢掉旧对话状态，下次打开面板再拉 */
  setPage(url: string): void {
    if (pageKeyOf(url) === pageKeyOf(this.url)) return;
    this.url = url;
    this.page = null;
    this.filters.clear();
    setState({ chat: initialChat(randomId("p")) });
  }

  content(): PageContent {
    return (this.page ??= extractPage(document));
  }

  invalidateContent(): void {
    this.page = null;
  }

  /** 第一次打开面板（且已连接）时拉历史、模型列表，并接回正在跑的一轮 */
  async load(): Promise<void> {
    const { chat, status } = getState();
    if (chat.loaded || status.state !== "ready") return;
    patchChat({ loaded: true });
    const url = pageKeyOf(this.url);
    const [history, models] = await Promise.all([
      this.bridge.rpc<ChatHistoryResult>(COMPANION_METHODS.chatHistory, { url }).catch(() => null),
      this.bridge.rpc<ModelOption[]>(COMPANION_METHODS.modelsList).catch(() => []),
    ]);
    const model = models.find(item => item.isDefault) ?? models[0] ?? null;
    if (history?.sessionId) {
      patchChat({ sessionId: history.sessionId, messages: history.messages, models, model });
      await this.resume(history.sessionId, url);
    } else patchChat({ models, model });
  }

  private async resume(sessionId: string, url: string): Promise<void> {
    const state = await this.bridge
      .rpc<AiRunStateResult>(COMPANION_METHODS.runState, {
        session: { id: sessionId, pageUrl: url },
      })
      .catch(() => null);
    if (!state?.running || !state.runId || !state.snapshot) return;
    const { snapshot } = state;
    this.filters.set(state.runId, createRunEventFilter(state.runId, snapshot.lastSeq));
    patchChat({
      runId: state.runId,
      messages: [...snapshot.baseMessages, snapshot.request as never, snapshot.response],
      approvals: snapshot.interactions.approvals,
      questions: snapshot.interactions.questions,
    });
  }

  private systemPrompt(): string {
    const { chat, annotations } = getState();
    const parts: string[] = [];
    if (chat.usePage) {
      const content = this.content();
      parts.push(`网页正文（共 ${content.blocks.length} 段）：\n\n${pageAsPrompt(content)}`);
    } else parts.push("用户这次没有附上网页正文；需要时可以调用 read_page。");
    if (chat.useAnnotations && annotations.length) {
      parts.push(
        `用户在本页的标注：\n${annotations
          .map(item => `- 「${item.text}」${item.note ? `　批注：${item.note}` : ""}`)
          .join("\n")}`
      );
    }
    return parts.join("\n\n");
  }

  /** 发一轮：面板输入或快答 */
  async ask(
    question: string,
    options: { quote?: QuoteContext | null; quick?: QuickKind } = {}
  ): Promise<string | null> {
    const { chat } = getState();
    if (chat.runId) {
      patchChat({ error: "上一个回答还没结束" });
      return null;
    }
    const quote = options.quote ?? null;
    const text = composeUserText(options.quick ? QUICK_PROMPTS[options.quick] : question, quote);
    const runId = randomId("r");
    const user = { role: Role.User, content: text } as never;
    const answer = createAssistantMessage();
    this.filters.set(runId, createRunEventFilter(runId));
    patchChat(current => ({
      messages: [...current.messages, user, answer],
      runId,
      error: null,
      quote: null,
      approvals: [],
      questions: [],
    }));
    const params: CompanionRunStartParams = {
      runId,
      session: { id: chat.sessionId, pageUrl: pageKeyOf(this.url) },
      messages: [{ role: "user", content: text }],
      pageContext: { url: this.url, title: document.title },
      systemPrompt: this.systemPrompt(),
      browserTools: PAGE_TOOLS,
      ...(chat.model
        ? { model: { providerId: chat.model.providerId, modelId: chat.model.modelId } }
        : {}),
    };
    try {
      await this.bridge.rpc(COMPANION_METHODS.runStart, params);
      return runId;
    } catch (error) {
      this.filters.delete(runId);
      patchChat(current => ({
        runId: null,
        error: error instanceof Error ? error.message : String(error),
        messages: current.messages.slice(0, -2),
      }));
      return null;
    }
  }

  async abort(): Promise<void> {
    const { runId } = getState().chat;
    if (runId) await this.bridge.rpc(COMPANION_METHODS.runAbort, { runId }).catch(() => {});
  }

  /** 审批与作答经 Tau 交给 pi 宿主；失败抛给交互件提示 */
  async approve(requestId: string, choice: "allow" | "allow-session" | "deny"): Promise<void> {
    const { runId } = getState().chat;
    if (!runId) throw new Error("这轮回答已结束");
    await this.bridge.rpc(COMPANION_METHODS.runApprove, { runId, requestId, choice });
  }

  async answer(requestId: string, answers: unknown): Promise<void> {
    const { runId } = getState().chat;
    if (!runId) throw new Error("这轮回答已结束");
    await this.bridge.rpc(COMPANION_METHODS.runAnswer, { runId, requestId, answers });
  }

  /** 在 Tau 里打开这段对话（看桌面专用的工具卡片） */
  async openInTau(): Promise<void> {
    const { sessionId } = getState().chat;
    await this.bridge.rpc(COMPANION_METHODS.chatOpen, {
      session: { id: sessionId, pageUrl: pageKeyOf(this.url) },
    });
  }

  /** ai.run.event：归约进最后一条回答，并同步给快答气泡 */
  onEvent(notification: AiRunEventNotification): void {
    const filter = this.filters.get(notification.runId);
    const event = filter?.(notification);
    if (!event) return;
    if (event.type === "interactions") {
      patchChat({ approvals: event.approvals, questions: event.questions });
      return;
    }
    if (event.type === "settled") {
      this.filters.delete(notification.runId);
      patchChat({
        runId: null,
        approvals: [],
        questions: [],
        error: event.ok || event.aborted ? null : (event.error ?? "回答失败"),
      });
      const { bubble } = getState();
      if (bubble?.runId === notification.runId) {
        setState({
          bubble: {
            ...bubble,
            status: event.ok || event.aborted ? "done" : "error",
            error: event.error,
            text: bubble.text || event.lastText,
          },
        });
      }
      return;
    }
    if (event.type === "error") {
      patchChat({ error: event.message });
      return;
    }
    if (
      event.type !== "text" &&
      event.type !== "reasoning" &&
      event.type !== "tool-calls" &&
      event.type !== "turn-finish"
    )
      return;
    patchChat(current => {
      const messages = [...current.messages];
      const last = messages.at(-1) as ResponseMessage | undefined;
      if (!last || last.role !== Role.Assistant) return {};
      const next = structuredClone(last);
      applyChatStreamEvent(next, event);
      messages[messages.length - 1] = next;
      return { messages };
    });
    const { bubble, chat } = getState();
    if (bubble?.runId === notification.runId) {
      const last = chat.messages.at(-1);
      setState({ bubble: { ...bubble, text: messageText(last?.content) } });
    }
  }
}
