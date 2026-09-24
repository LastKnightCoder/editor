import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import { WhiteboardRecordingSection } from "../sections/WhiteboardRecordingSection";

const mocks = vi.hoisted(() => ({ selectFile: vi.fn() }));
vi.mock("@/commands", () => ({ selectFile: mocks.selectFile }));

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<WhiteboardRecordingSection />));
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent?.includes(label));
const recording = () => useSettingStore.getState().setting.whiteboardRecording;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.selectFile.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("渲染录制默认值与导出分组，开关写入设置", () => {
  render();
  expect(text()).toContain("录制默认值");
  expect(text()).toContain("导出格式");
  expect(text()).toContain("未设置时使用默认目录");
  expect(button("恢复默认")).toBeUndefined();
  const before = recording().autoStartRecording;
  act(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="进入演示后自动开始录制"]')!.click()
  );
  expect(recording().autoStartRecording).toBe(!before);
});

it("选择文件夹写入保存目录，恢复默认清空", async () => {
  mocks.selectFile.mockResolvedValue(["/Users/me/Movies/tau"]);
  render();
  await act(async () => button("选择文件夹")!.click());
  expect(mocks.selectFile).toHaveBeenCalledWith({
    properties: ["openDirectory", "createDirectory"],
  });
  expect(recording().saveDirectory).toBe("/Users/me/Movies/tau");
  expect(text()).toContain("/Users/me/Movies/tau");
  act(() => button("恢复默认")!.click());
  expect(recording().saveDirectory).toBe("");
});
