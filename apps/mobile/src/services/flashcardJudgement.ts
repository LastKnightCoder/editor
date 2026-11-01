import {
  ANSWER_JUDGEMENT_SYSTEM_PROMPT,
  buildAnswerJudgementUserPrompt,
  parseAnswerJudgementResponse,
} from "@tau/ai/flashcards";
import type { AiModelRef } from "@tau/ai/contracts";
import { waitForSignal } from "@tau/ai/tools";
import { Node, type Descendant } from "slate";
import type { Flashcard } from "../features/flashcard/types";

const plainText = (nodes: unknown[]) =>
  nodes
    .map(node => Node.string(node as Descendant))
    .join("\n")
    .trim();

export async function judgeFlashcardAnswer(
  card: Flashcard,
  userAnswer: string,
  databaseName: string,
  model: AiModelRef,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const referenceMaterial =
    card.references
      .flatMap(reference => (reference.content ? [plainText(reference.content.content)] : []))
      .join("\n\n") || card.referenceSummary;
  const user = buildAnswerJudgementUserPrompt(
    plainText(card.prompt),
    userAnswer,
    card.data.answer || "未设置参考答案",
    referenceMaterial || undefined
  );
  const service = await waitForSignal(
    import("./ai").then(module => module.getMobileAiService()),
    signal
  );
  const handle = await service.generation.start({
    requestId: crypto.randomUUID(),
    databaseName,
    model,
    system: ANSWER_JUDGEMENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: user }],
  });
  const abort = () => handle.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try {
    const outcome = await waitForSignal(handle.result, signal);
    signal.throwIfAborted();
    if (outcome.outcome !== "completed" || !outcome.response?.content.trim())
      throw new Error(outcome.error?.message ?? "AI 评判未完整返回结果");
    return parseAnswerJudgementResponse(outcome.response.content);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
