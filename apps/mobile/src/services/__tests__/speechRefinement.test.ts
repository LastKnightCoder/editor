import { afterEach, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../types";

const ai = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../ai", () => ({ getMobileAiService: () => ({ generation: { start: ai.start } }) }));

import { prepareSpeechRefinement } from "../speechRefinement";

const setting = (assigned: boolean, style: "light" | "paragraphs" = "light") =>
  ({
    database: { active: "data.db", databases: [] },
    llmProviders: [
      {
        id: "p",
        name: "P",
        baseUrl: "https://x.test",
        api: "openai-completions",
        models: [{ id: "m", reasoning: false, input: ["text"] }],
      },
    ],
    llmUsageSettings: {
      speechInputRefinement: assigned ? { providerId: "p", modelId: "m" } : null,
    },
    speechInput: {
      active: "native",
      language: "zh-CN",
      plugin: { id: "", configurations: {} },
      refinement: { style, instructions: "" },
    },
  }) as unknown as SettingCompat;

function handle(result: object, previews: string[] = []) {
  return async (_request: unknown, onSnapshot?: (response: { content: string }) => void) => {
    for (const content of previews) onSnapshot?.({ content });
    return { requestId: "r", result: Promise.resolve(result), abort: vi.fn() };
  };
}

afterEach(() => ai.start.mockReset());

it("未分配模型时不生成润色器", () => {
  expect(prepareSpeechRefinement(setting(false))).toBeUndefined();
  expect(prepareSpeechRefinement(null)).toBeUndefined();
});

it("用分配的模型单发生成，转发流式预览并返回正文", async () => {
  ai.start.mockImplementation(
    handle({ outcome: "completed", response: { content: "明天开会。" } }, ["明天", "明天开会"])
  );
  const onPreview = vi.fn();
  const refine = prepareSpeechRefinement(setting(true, "paragraphs"))!;
  const text = await refine("明天 开会", { signal: new AbortController().signal, onPreview });
  expect(text).toBe("明天开会。");
  expect(onPreview).toHaveBeenCalledWith("明天开会");
  const [request] = ai.start.mock.calls[0];
  expect(request).toMatchObject({
    databaseName: "data.db",
    model: { providerId: "p", modelId: "m" },
    messages: [{ role: "user", content: JSON.stringify({ transcript: "明天 开会" }) }],
  });
  expect(request.system).toContain("分段");
});

it("生成失败或返回空正文时抛错，交给上层降级为原文", async () => {
  const refine = prepareSpeechRefinement(setting(true))!;
  const options = { signal: new AbortController().signal, onPreview: vi.fn() };
  ai.start.mockImplementation(
    handle({ outcome: "failed", response: null, error: { message: "401" } })
  );
  await expect(refine("原话", options)).rejects.toThrow("401");
  ai.start.mockImplementation(handle({ outcome: "completed", response: { content: "  " } }));
  await expect(refine("原话", options)).rejects.toThrow();
});

it("录音开始时固定风格：之后设置变化不影响已生成的润色器", async () => {
  const current = setting(true, "light");
  const refine = prepareSpeechRefinement(current)!;
  current.speechInput!.refinement!.style = "paragraphs";
  ai.start.mockImplementation(handle({ outcome: "completed", response: { content: "好。" } }));
  await refine("好", { signal: new AbortController().signal, onPreview: vi.fn() });
  expect(ai.start.mock.calls[0][0].system).not.toContain("分段");
});
