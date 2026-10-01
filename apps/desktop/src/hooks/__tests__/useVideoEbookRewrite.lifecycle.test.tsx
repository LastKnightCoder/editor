import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { PiChatHandle } from "@/services/piLLM";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import { useVideoEbookRewrite } from "../useVideoEbookRewrite";

const stream = vi.hoisted(() => vi.fn());
vi.mock("@/services/piLLM", () => ({ piStreamText: stream }));

it("停止和重新生成后，旧流与最终结果都不能覆盖新草稿", async () => {
  const requests: Array<{
    chunk: (value: { text: string }) => void;
    finish: (value: unknown) => void;
    cancel: ReturnType<typeof vi.fn>;
  }> = [];
  stream.mockImplementation((_options, chunk) => {
    let finish!: (value: unknown) => void;
    const result = new Promise(resolve => {
      finish = resolve;
    });
    const cancel = vi.fn();
    requests.push({ chunk, finish, cancel });
    return { result, cancel } as unknown as PiChatHandle;
  });
  let current: ReturnType<typeof useVideoEbookRewrite> | undefined;
  function Harness() {
    current = useVideoEbookRewrite({} as LLMProviderSetting, {} as LLMModelSetting);
    return null;
  }
  const host = document.createElement("div"),
    root = createRoot(host);
  const input = { transcript: "原始转录", style: "magazine" as const };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => current?.startRewrite(input));
    await act(async () => requests[0].chunk({ text: "第一轮" }));
    await act(async () => current?.stopRewrite());
    await act(async () => current?.startRewrite(input));
    await act(async () => requests[1].chunk({ text: "第二轮" }));
    await act(async () => {
      requests[0].chunk({ text: "旧流迟到" });
      requests[0].finish({ ok: true, text: "旧完成结果" });
    });
    expect(requests[0].cancel).toHaveBeenCalled();
    expect(current?.streamingMarkdown).toBe("第二轮");
    expect(current?.isRewriting).toBe(true);
    await act(async () => requests[1].finish({ ok: true, text: "第二轮完成" }));
    expect(current?.finalMarkdown).toBe("第二轮完成");
    expect(current?.isRewriting).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
