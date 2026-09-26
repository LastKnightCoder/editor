/**
 * <think> 标签流式剥离重写器（兜底中间件，定位对齐 Vercel AI SDK 的 extractReasoningMiddleware）。
 * 仅服务于「推理混在 content 正文」的 OpenAI 兼容端点（裸 vLLM/SGLang 等未开 reasoning-parser 的自建服务）；
 * 结构化 reasoning_content 字段由 pi 原生处理，不经本层。
 * 按模型级开关启用（LLMModelSetting.stripThinkTags，默认关——正文合法出现标签字样会被误切）。
 *
 * 切分器与渲染端 utils/thinkTagNormalizer 同源（半标签跨 chunk 挂起、未闭合归 thinking、
 * 标签前正文保留），但输出为按出现顺序的片段序列——聚合式返回会丢失 text/thinking 的交错顺序。
 *
 * 行为契约：
 *  - text 流重排为 thinking/text 交错段；contentIndex 全局重分配（含 toolcall 块），
 *    与重建后的 done.message.content 下标一致；
 *  - 每个输出事件携带重排后的 partial 全量快照（与 pi 原生事件语义一致）。
 */
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type PiRewrittenEvent = DistributiveOmit<AssistantMessageEvent, "partial">;

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

interface Piece {
  kind: "thinking" | "text";
  text: string;
}

/** 序列式切分器：push/flush 返回按出现顺序的完整片段 */
function createThinkTagSplitter() {
  let mode: "text" | "think" = "text";
  let pending = "";

  const pendingPrefixLength = (text: string, tag: string): number => {
    const maxLength = Math.min(text.length, tag.length - 1);
    for (let len = maxLength; len > 0; len -= 1) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  };

  const split = (chunk: string): Piece[] => {
    const pieces: Piece[] = [];
    const emit = (kind: Piece["kind"], text: string) => {
      if (!text) return;
      const last = pieces[pieces.length - 1];
      if (last?.kind === kind) last.text += text;
      else pieces.push({ kind, text });
    };

    let rest = `${pending}${chunk}`;
    pending = "";
    while (rest.length > 0) {
      if (mode === "text") {
        const openIndex = rest.indexOf(OPEN_TAG);
        if (openIndex >= 0) {
          emit("text", rest.slice(0, openIndex));
          rest = rest.slice(openIndex + OPEN_TAG.length);
          mode = "think";
          continue;
        }
        const hold = pendingPrefixLength(rest, OPEN_TAG);
        emit("text", rest.slice(0, rest.length - hold));
        pending = rest.slice(rest.length - hold);
        break;
      }
      const closeIndex = rest.indexOf(CLOSE_TAG);
      if (closeIndex >= 0) {
        emit("thinking", rest.slice(0, closeIndex));
        rest = rest.slice(closeIndex + CLOSE_TAG.length);
        mode = "text";
        continue;
      }
      const hold = pendingPrefixLength(rest, CLOSE_TAG);
      emit("thinking", rest.slice(0, rest.length - hold));
      pending = rest.slice(rest.length - hold);
      break;
    }
    return pieces;
  };

  const flush = (): Piece[] => {
    if (!pending) return [];
    const piece: Piece = { kind: mode === "think" ? "thinking" : "text", text: pending };
    pending = "";
    return [piece];
  };

  return { split, flush };
}

interface Segment {
  kind: "thinking" | "text";
  text: string;
}

interface TextBlock {
  splitter: ReturnType<typeof createThinkTagSplitter>;
  segments: Segment[];
  open: { kind: "thinking" | "text"; index: number } | null;
  sawTag: boolean;
}

export interface ThinkTagRewriter {
  process(event: AssistantMessageEvent): AssistantMessageEvent[];
}

export function createThinkTagRewriter(): ThinkTagRewriter {
  let nextIndex = 0;
  let lastToolIndex = 0;
  const blocks = new Map<number, TextBlock>();
  let lastPartial: AssistantMessage | undefined;

  /** 基于最近一次原生 partial 重建重排后的全量快照 */
  const makePartial = (): AssistantMessage | undefined => {
    if (!lastPartial || !Array.isArray(lastPartial.content)) return undefined;
    const content: AssistantMessage["content"] = [];
    lastPartial.content.forEach((piece, originalIndex) => {
      if (piece.type !== "text") {
        content.push(piece);
        return;
      }
      const block = blocks.get(originalIndex);
      if (!block || block.segments.length === 0) {
        content.push(piece);
        return;
      }
      for (const segment of block.segments) {
        if (segment.kind === "thinking") content.push({ type: "thinking", thinking: segment.text });
        else content.push({ type: "text", text: segment.text });
      }
    });
    return { ...lastPartial, content };
  };

  const attachPartial = (event: PiRewrittenEvent): AssistantMessageEvent =>
    ({ ...event, partial: makePartial() }) as AssistantMessageEvent;

  const openSegment = (block: TextBlock, kind: "thinking" | "text"): AssistantMessageEvent => {
    const index = nextIndex++;
    block.open = { kind, index };
    block.segments.push({ kind, text: "" });
    const event: PiRewrittenEvent =
      kind === "thinking"
        ? { type: "thinking_start", contentIndex: index }
        : { type: "text_start", contentIndex: index };
    return attachPartial(event);
  };

  const closeSegment = (block: TextBlock): AssistantMessageEvent | null => {
    if (!block.open) return null;
    const { kind, index } = block.open;
    block.open = null;
    const segment = block.segments[block.segments.length - 1];
    const event: PiRewrittenEvent =
      kind === "thinking"
        ? { type: "thinking_end", contentIndex: index, content: segment.text }
        : { type: "text_end", contentIndex: index, content: segment.text };
    return attachPartial(event);
  };

  const emitPieces = (block: TextBlock, pieces: Piece[]): AssistantMessageEvent[] => {
    const out: AssistantMessageEvent[] = [];
    for (const piece of pieces) {
      if (piece.kind === "thinking") block.sawTag = true;
      if (block.open?.kind !== piece.kind) {
        const closed = closeSegment(block);
        if (closed) out.push(closed);
        out.push(openSegment(block, piece.kind));
      }
      block.segments[block.segments.length - 1].text += piece.text;
      const event: PiRewrittenEvent =
        piece.kind === "thinking"
          ? { type: "thinking_delta", contentIndex: block.open!.index, delta: piece.text }
          : { type: "text_delta", contentIndex: block.open!.index, delta: piece.text };
      out.push(attachPartial(event));
    }
    return out;
  };

  return {
    process(event) {
      lastPartial = (event as { partial?: AssistantMessage }).partial ?? lastPartial;
      if (event.type === "text_start") {
        blocks.set(event.contentIndex, {
          splitter: createThinkTagSplitter(),
          segments: [],
          open: null,
          sawTag: false,
        });
        // 段延迟到首个非空片段再开（text_start 的输出由 emitPieces 决定），空块在 text_end 补齐
        return [];
      }
      if (event.type === "text_delta") {
        const block = blocks.get(event.contentIndex);
        if (!block) return [];
        return emitPieces(block, block.splitter.split(event.delta));
      }
      if (event.type === "text_end") {
        const block = blocks.get(event.contentIndex);
        if (!block) return [];
        const tail = emitPieces(block, block.splitter.flush());
        if (!block.open) {
          // 全程无内容（空块）或首片段为空：补一对 text start/end 保持事件完整
          return [...tail, openSegment(block, "text"), closeSegment(block)!];
        }
        return [...tail, closeSegment(block)!];
      }
      if (event.type === "toolcall_start") {
        lastToolIndex = nextIndex++;
        return [attachPartial({ type: "toolcall_start", contentIndex: lastToolIndex })];
      }
      if (event.type === "toolcall_delta") {
        return [
          attachPartial({
            type: "toolcall_delta",
            contentIndex: lastToolIndex,
            delta: event.delta,
          }),
        ];
      }
      if (event.type === "toolcall_end") {
        return [
          attachPartial({
            type: "toolcall_end",
            contentIndex: lastToolIndex,
            toolCall: event.toolCall,
          }),
        ];
      }
      if (event.type === "done") {
        const content: AssistantMessage["content"] = [];
        event.message.content.forEach((piece, originalIndex) => {
          if (piece.type !== "text") {
            content.push(piece);
            return;
          }
          const block = blocks.get(originalIndex);
          if (!block || !block.sawTag) {
            content.push(piece);
            return;
          }
          for (const segment of block.segments) {
            if (segment.kind === "thinking")
              content.push({ type: "thinking", thinking: segment.text });
            else content.push({ type: "text", text: segment.text });
          }
        });
        return [
          { type: "done", reason: event.reason, message: { ...event.message, content } },
        ] as AssistantMessageEvent[];
      }
      // start / error / 原生 thinking_* 等其余事件原样透传（partial 已是原生快照）
      return [event];
    },
  };
}

/** async 流薄包装：主进程转发循环消费 */
export async function* rewriteThinkTagStream(
  stream: AsyncIterable<AssistantMessageEvent>
): AsyncGenerator<AssistantMessageEvent> {
  const rewriter = createThinkTagRewriter();
  for await (const event of stream) {
    yield* rewriter.process(event);
  }
}
