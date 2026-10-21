import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openPage: vi.fn(), setAssistOpen: vi.fn() }));
vi.mock("@/services/page-navigation", () => ({ openPage: mocks.openPage }));
vi.mock("@/app/shellStore", () => ({
  useShellStore: { getState: () => ({ setAssistOpen: mocks.setAssistOpen }) },
}));

import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import { startChat, useChatStartConsumer, useChatStartStore } from "../chatStart";

const mention = {
  entityType: "card",
  entityId: 3,
  contentId: 8,
  title: "卡",
  previewText: "",
} as const;
const handle = {
  setInputValue: vi.fn(),
  appendMentions: vi.fn(),
  focusInput: vi.fn(),
};

let controls: { switchTo(id: string): void; create(id: string): void };

/** 模拟一个对话面板：草稿 id 从 d1 递增，登记后 sessionFile 非空 */
function Panel({ active = true }: { active?: boolean }) {
  const [current, setCurrent] = useState({ id: "c0", draft: false });
  const draftSeq = useRef(0);
  const container = useRef<ChatContainerHandle | null>(handle as unknown as ChatContainerHandle);
  const onCreated = useChatStartConsumer("page", {
    active,
    currentChatId: current.id,
    isDraft: current.draft,
    newChat: () => setCurrent({ id: `d${++draftSeq.current}`, draft: true }),
    container,
  });
  controls = {
    switchTo: id => setCurrent({ id, draft: false }),
    create: id => {
      setCurrent({ id, draft: false });
      onCreated(id);
    },
  };
  return null;
}

let host: HTMLDivElement;
let root: Root;
// act 结束时才执行 effect，预填在其后的定时器里：等两拍
const frame = async () => {
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
};

beforeEach(() => {
  vi.clearAllMocks();
  useChatStartStore.setState({ request: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("从外部发起对话", () => {
  it("打开对话页，换新草稿并预填；首次发送登记后交回会话 ID", async () => {
    await act(async () => root.render(<Panel />));
    const started = startChat(
      { placement: "page", prompt: "聊聊这个", mentions: [mention] },
      new AbortController().signal
    );
    expect(mocks.openPage).toHaveBeenCalledWith("chat");
    await frame();
    expect(handle.setInputValue).toHaveBeenCalledWith("聊聊这个");
    expect(handle.appendMentions).toHaveBeenCalledWith([mention]);
    await act(async () => controls.create("d1"));
    expect(await started).toBe("d1");
    expect(useChatStartStore.getState().request).toBeNull();
  });

  it("没发送就切到别的对话、面板隐藏或发起方取消时交回 null", async () => {
    await act(async () => root.render(<Panel />));
    const switched = startChat(
      { placement: "page", prompt: "", mentions: [] },
      new AbortController().signal
    );
    await frame();
    await act(async () => controls.switchTo("c9"));
    expect(await switched).toBeNull();

    const hidden = startChat(
      { placement: "page", prompt: "", mentions: [] },
      new AbortController().signal
    );
    await frame();
    await act(async () => root.render(<Panel active={false} />));
    expect(await hidden).toBeNull();

    const controller = new AbortController();
    const aborted = startChat({ placement: "page", prompt: "", mentions: [] }, controller.signal);
    controller.abort();
    expect(await aborted).toBeNull();
  });

  it("同一时间只能有一个待发起的请求；停靠栏的请求打开停靠栏", async () => {
    const pending = startChat(
      { placement: "dock", prompt: "", mentions: [] },
      new AbortController().signal
    );
    expect(mocks.setAssistOpen).toHaveBeenCalledWith(true);
    expect(() =>
      startChat({ placement: "page", prompt: "", mentions: [] }, new AbortController().signal)
    ).toThrow("请先发送或关闭");
    // 对话页面板不认领停靠栏的请求
    await act(async () => root.render(<Panel />));
    await frame();
    expect(handle.setInputValue).not.toHaveBeenCalled();
    useChatStartStore.getState().request?.settle(null);
    expect(await pending).toBeNull();
  });
});
