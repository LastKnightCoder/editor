import useAnswerJudgement from "@/hooks/useAnswerJudgement";
import { chatLLM } from "@/hooks/useChatLLM";
import type { Flashcard } from "@/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/hooks/useChatLLM", () => ({ chatLLM: vi.fn() }));
vi.mock("@/hooks/useLLMConfig", () => ({
  default: () => ({ providerConfig: {}, modelConfig: {} }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;
let judgement: ReturnType<typeof useAnswerJudgement>;
function Probe() {
  judgement = useAnswerJudgement();
  return null;
}
beforeEach(async () => {
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it("换卡重置后丢弃上一张迟到的 AI 评判", async () => {
  let finish!: (value: string) => void;
  vi.mocked(chatLLM).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const card = { prompt: [], data: { answer: "答案" }, references: [] } as unknown as Flashcard;
  let pending!: Promise<void>;
  await act(async () => {
    pending = judgement.judge("回答", card);
  });
  expect(judgement.status).toBe("loading");
  await act(async () => judgement.reset());
  await act(async () => {
    finish(JSON.stringify({ score: 10 }));
    await pending;
  });
  expect(judgement.status).toBe("idle");
  expect(judgement.result).toBeNull();
});
