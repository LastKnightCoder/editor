import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AiGenerationResult, AiGenerationRequest } from "@tau/ai/runtime";
import type { SettingCompat } from "../../../types";
import { useAnswerJudgement } from "../useAnswerJudgement";
import { ReviewCardBack } from "../ReviewCard";
import type { Flashcard } from "../types";

const mocks = vi.hoisted(() => ({ start: vi.fn(), abort: vi.fn() }));
vi.mock("../../../services/ai", () => ({
  getMobileAiService: () => ({ generation: { start: mocks.start } }),
}));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({ syncSettings: { safeSetting: setting } }),
}));
let setting: SettingCompat;
let root: Root;
let container: HTMLDivElement;
let judgement: ReturnType<typeof useAnswerJudgement>;
const card = {
  type: "qa",
  prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "题目" }] }],
  data: { answer: "参考答案" },
  detail: [],
  references: [],
} as unknown as Flashcard;
function Probe() {
  judgement = useAnswerJudgement();
  return (
    <ReviewCardBack
      card={card}
      answer={{ qa: "用户回答" }}
      isCorrect={judgement.result ? judgement.result.score >= 6 : null}
      judgement={judgement}
    />
  );
}
function response(content: string): AiGenerationResult {
  return { outcome: "completed", response: { role: "assistant", content } } as AiGenerationResult;
}
beforeEach(async () => {
  vi.clearAllMocks();
  setting = {
    database: { active: "review.db" },
    llmProviders: [{ id: "p", models: [{ id: "flashcard" }, { id: "chat" }] }],
    llmUsageSettings: {
      flashcardGeneration: { providerId: "p", modelId: "flashcard" },
      chat: { providerId: "p", modelId: "chat" },
    },
  } as unknown as SettingCompat;
  mocks.start.mockResolvedValue({
    result: Promise.resolve(
      response('{"score":8,"comment":"核心正确","missingPoints":["补充细节"]}')
    ),
    abort: mocks.abort,
  });
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it.each([8, 3])("简答题使用闪卡模型，依据 %s 分显示对错和反馈", async score => {
  mocks.start.mockResolvedValueOnce({
    result: Promise.resolve(
      response(JSON.stringify({ score, comment: "评判反馈", missingPoints: ["补充细节"] }))
    ),
    abort: mocks.abort,
  });
  expect(container.textContent).not.toContain("回答正确");
  await act(async () => judgement.judge("用户回答", card));
  const request = mocks.start.mock.calls[0][0] as AiGenerationRequest;
  expect(request.model).toEqual({ providerId: "p", modelId: "flashcard" });
  expect(request.databaseName).toBe("review.db");
  expect(request.messages[0].content).toContain("参考答案");
  expect(container.textContent).toContain(score >= 6 ? "回答正确" : "回答错误");
  expect(container.textContent).toContain(`${score} / 10`);
  expect(container.textContent).toContain("补充细节");
});

it.each(["换卡", "切换模型"])("%s 会中止在途评判并丢弃迟到结果", async operation => {
  let finish!: (value: AiGenerationResult) => void;
  mocks.start.mockResolvedValueOnce({
    result: new Promise<AiGenerationResult>(resolve => {
      finish = resolve;
    }),
    abort: mocks.abort,
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = judgement.judge("用户回答", card);
    await Promise.resolve();
  });
  await act(async () => {
    if (operation === "换卡") judgement.reset();
    else {
      setting.llmUsageSettings = { flashcardGeneration: { providerId: "p", modelId: "chat" } };
      root.render(<Probe />);
    }
  });
  expect(mocks.abort).toHaveBeenCalledOnce();
  await act(async () => {
    finish(response('{"score":10}'));
    await pending;
  });
  expect(judgement.status).toBe("idle");
  expect(judgement.result).toBeNull();
  expect(container.textContent).not.toContain("回答正确");
});

it("没有分配闪卡模型时保留自评，不能回退到对话模型", async () => {
  setting.llmUsageSettings = { chat: { providerId: "p", modelId: "chat" } };
  await act(async () => root.render(<Probe />));
  expect(judgement.isConfigured).toBe(false);
  await act(async () => judgement.judge("用户回答", card));
  expect(mocks.start).not.toHaveBeenCalled();
  expect(container.textContent).toContain("自评");
});

it("模型输出错误时不预判对错并提供重试", async () => {
  mocks.start.mockResolvedValueOnce({
    result: Promise.resolve(response('{"score":8,"comment":{"bad":true}}')),
    abort: mocks.abort,
  });
  await act(async () => judgement.judge("用户回答", card));
  expect(judgement.status).toBe("error");
  expect(container.textContent).not.toContain("回答正确");
  expect(container.textContent).toContain("重新评判");
});
