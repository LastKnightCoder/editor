import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PiChatResult } from "@/services/piLLM";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";

const runs = vi.hoisted(
  () =>
    [] as Array<{
      emit: (event: { text: string }) => void;
      finish: (result: PiChatResult) => void;
      cancel: ReturnType<typeof vi.fn>;
    }>
);
vi.mock("@/utils/markdown", () => ({ getMarkdown: () => "正文" }));
vi.mock("@/services/piLLM", () => ({
  piStreamText: (_options: unknown, emit: (event: { text: string }) => void) => {
    let finish!: (value: PiChatResult) => void;
    const result = new Promise<PiChatResult>(resolve => {
      finish = resolve;
    });
    const cancel = vi.fn();
    runs.push({ emit, finish, cancel });
    return { result, cancel };
  },
}));

import useFlashcardGeneration from "../hooks/useFlashcardGeneration";
const provider: LLMProviderSetting = {
  id: "p",
  name: "测试",
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://example.test",
  models: [],
};
const model: LLMModelSetting = { id: "m", reasoning: false, input: ["text"] };
const output = (text: string) =>
  JSON.stringify([{ type: "qa", prompt: text, data: { answer: "答案" } }]);
const result = (text: string): PiChatResult => ({
  ok: true,
  aborted: false,
  text,
  reasoning: "",
  message: null,
});
let generation: ReturnType<typeof useFlashcardGeneration>;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  runs.length = 0;
});
function Probe() {
  generation = useFlashcardGeneration(provider, model);
  return null;
}
function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Probe />));
}

describe("闪卡生成生命周期", () => {
  it("重置后丢弃旧流和迟到成功结果，不恢复已取消的数据", async () => {
    mount();
    act(() => generation.startGeneration([]));
    const previous = runs[0];
    act(() => generation.reset());
    expect(previous.cancel).toHaveBeenCalledOnce();
    await act(async () => {
      previous.emit({ text: output("旧题") });
      previous.finish(result(output("旧题")));
    });
    expect(generation.generatedCards).toEqual([]);
    expect(generation.rawOutput).toBe("");
    expect(generation.isGenerating).toBe(false);
  });

  it("新一轮生成替换旧请求，卸载释放仍在运行的请求", async () => {
    mount();
    act(() => generation.startGeneration([]));
    const previous = runs[0];
    act(() => generation.startGeneration([]));
    expect(previous.cancel).toHaveBeenCalledOnce();
    await act(async () => previous.finish(result(output("旧题"))));
    expect(generation.generatedCards).toEqual([]);
    act(() => root?.unmount());
    root = undefined;
    expect(runs[1].cancel).toHaveBeenCalledOnce();
  });
});
