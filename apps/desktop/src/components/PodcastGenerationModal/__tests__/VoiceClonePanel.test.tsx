import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { VoiceClonePanel } from "../VoiceClonePanel";
import type { CloneVoiceItem } from "../types";
const mocks = vi.hoisted(() => ({ clone: vi.fn(), add: vi.fn(), notify: vi.fn() }));
vi.mock("@/utils/tts", () => ({
  TTSProviderFactory: { getVoiceCloner: () => ({ cloneVoice: mocks.clone }) },
}));
let closeForm: () => void;
function Harness() {
  const [items, setItems] = useState<CloneVoiceItem[]>(
    ["a", "b"].map(id => ({ id, voiceId: "", voiceIdError: "", audioFile: null }))
  );
  const [open, setOpen] = useState(true),
    [loading, setLoading] = useState(false);
  closeForm = () => setOpen(false);
  return (
    <VoiceClonePanel
      showCloneForm={open}
      setShowCloneForm={setOpen}
      cloneItems={items}
      setCloneItems={setItems}
      cloneLoading={loading}
      setCloneLoading={setLoading}
      voices={[]}
      addVoiceToList={mocks.add}
      notify={mocks.notify}
    />
  );
}
it("每音色只保留一个参考文件，仍可批量创建且使用返回的真实ID", async () => {
  mocks.clone.mockImplementation(async (file: File) => ({
    id: "voice-" + file.name,
    name: file.name,
    type: "cloned",
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    const files = () => container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect([...files()].every(input => !input.multiple)).toBe(true);
    const select = async (index: number, name: string) =>
      act(async () => {
        const input = files()[index];
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File(["audio"], name, { type: "audio/wav" })],
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await select(0, "old.wav");
    await select(0, "new.wav");
    await select(1, "second.wav");
    expect(container.textContent).not.toContain("old.wav");
    const button = [...container.querySelectorAll("button")].find(button =>
      button.textContent?.includes("开始批量克隆")
    )!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(mocks.clone.mock.calls.map(call => call[0].name)).toEqual(["new.wav", "second.wav"]);
    expect(mocks.add.mock.calls).toEqual([
      ["voice-new.wav", "new.wav", undefined],
      ["voice-second.wav", "second.wav", undefined],
    ]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("关闭复刻表单取消当前文件，并丢弃迟到结果及后续批次", async () => {
  vi.clearAllMocks();
  let complete!: (value: { id: string; name: string; type: string }) => void;
  mocks.clone.mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    for (const input of container.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
      await act(async () => {
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File(["audio"], "voice.wav", { type: "audio/wav" })],
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    const button = [...container.querySelectorAll("button")].find(item =>
      item.textContent?.includes("开始批量克隆")
    )!;
    await act(async () => button.click());
    expect(mocks.clone).toHaveBeenCalledTimes(1);
    await act(async () => closeForm());
    expect(mocks.clone.mock.calls[0][2].aborted).toBe(true);
    await act(async () => {
      complete({ id: "late", name: "late", type: "cloned" });
      await Promise.resolve();
    });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.clone).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
