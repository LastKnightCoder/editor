/**
 * 回归测试：切换音色不得清空已输入的文本。
 * 根因曾是 loadVoices 的 useCallback 依赖 selectedVoiceId，切音色 → 回调重建 →
 * 初始化 effect 重跑 → setText("")。修复后文本重置只随 open 变化。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TTSGenerateModal from "../index";

const voices = [
  {
    id: "voice-a",
    name: "音色A",
    description: "女声",
    type: "system" as const,
    provider: "minimax" as const,
  },
  {
    id: "voice-b",
    name: "音色B",
    description: "男声",
    type: "system" as const,
    provider: "minimax" as const,
  },
];

const synthesizer = {
  getVoiceList: vi.fn(async () => voices),
  synthesizeSpeech: vi.fn(async () => new ArrayBuffer(8)),
};

vi.mock("@/utils/tts/TTSProviderFactory", () => ({
  TTSProviderFactory: {
    getTTSProvider: vi.fn(() => ({
      isConfigured: () => true,
      synthesis: synthesizer,
    })),
    getSpeechSynthesizer: vi.fn(() => synthesizer),
  },
}));

let container: HTMLDivElement;
let root: Root;
const render = (open: boolean) =>
  act(async () =>
    root.render(<TTSGenerateModal open={open} onCancel={() => {}} onConfirm={() => {}} />)
  );

/** 受控 textarea 赋值（jsdom 不派生用户输入，走原生 value setter + input 事件） */
const typeText = async (value: string) => {
  const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/** 等音色列表加载并默认选中第一项（触发器回显其名称） */
const waitForVoicesLoaded = async () => {
  await act(async () => {
    await vi.waitFor(() => {
      const trigger = document.querySelector('[aria-label="音色"]');
      expect(trigger?.textContent).toContain("音色A");
    });
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("输入文本后切换音色，文本保留不被清空", async () => {
  await render(true);
  await waitForVoicesLoaded();

  await typeText("你好，世界");
  expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("你好，世界");

  // 打开音色下拉（弹层渲染在 body 的 Portal 中），选择另一项
  const trigger = document.querySelector('[aria-label="音色"]') as HTMLButtonElement;
  await act(async () => trigger.click());
  const option = await act(async () => {
    return await vi.waitFor(() => {
      const found = [...document.querySelectorAll('[role="option"]')].find(node =>
        node.textContent?.includes("音色B")
      );
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
  });
  await act(async () => option.click());

  expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("你好，世界");
  // 音色确实切换成功
  expect(document.querySelector('[aria-label="音色"]')?.textContent).toContain("音色B");
});

it("重新打开弹窗时文本才被重置", async () => {
  await render(true);
  await waitForVoicesLoaded();
  await typeText("保留我");

  await render(false);
  await render(true);
  expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
});
