import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useChatEntryLocation } from "../useChatEntryLocation";

type Options = Parameters<typeof useChatEntryLocation>[0];
let root: ReturnType<typeof createRoot>, options: Options;
const Probe = ({ value }: { value: Options }) => {
  useChatEntryLocation(value);
  return null;
};
beforeEach(() => {
  vi.useFakeTimers();
  root = createRoot(document.createElement("div"));
  options = {
    sessionKey: "db:chat",
    entry: "b",
    visible: true,
    busy: false,
    messages: [{ piEntryIds: ["a"] }, { piEntryIds: ["b"] }],
    findBranch: vi.fn(async () => "b-tail"),
    switchBranch: vi.fn(async () => undefined),
    scrollTo: vi.fn(),
    onLocated: vi.fn(),
    onError: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});
const render = async () => {
  await act(async () => root.render(<Probe value={{ ...options }} />));
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
};

it("定位后手动切兄弟分支不被拉回，清除 entry 后可以再次发起定位", async () => {
  await render();
  expect(options.scrollTo).toHaveBeenCalledWith(1);
  expect(options.onLocated).toHaveBeenCalledTimes(1);
  options.messages = [{ piEntryIds: ["c"] }];
  await render();
  expect(options.findBranch).not.toHaveBeenCalled();
  options.visible = false;
  await render();
  options.visible = true;
  await render();
  expect(options.findBranch).not.toHaveBeenCalled();
  options.entry = undefined;
  await render();
  options.entry = "b";
  await render();
  expect(options.switchBranch).toHaveBeenCalledWith("b-tail");
});
it("运行中等待；隐藏页面后忽略迟到的分支查找", async () => {
  options.messages = [];
  options.busy = true;
  await render();
  expect(options.findBranch).not.toHaveBeenCalled();
  let resolve!: (value: string) => void;
  options.findBranch = vi.fn(
    () =>
      new Promise<string>(done => {
        resolve = done;
      })
  );
  options.busy = false;
  await render();
  options.visible = false;
  await render();
  await act(async () => resolve("b-tail"));
  expect(options.switchBranch).not.toHaveBeenCalled();
});
