import { act, createRef, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import type { MessageContentItem } from "@tau/shared";
const host = vi.hoisted(() => ({
  props: null as null | {
    currentChat: unknown;
    customSystemPrompt?: string;
    prepareUserContent?: (content: MessageContentItem[]) => MessageContentItem[];
  },
  currentChat: { id: "raw-session", title: "用户视频会话", messages: [] },
  mounted: vi.fn(),
  unmounted: vi.fn(),
  send: vi.fn(),
  focus: vi.fn(),
  rename: vi.fn(),
  select: vi.fn(),
  newChat: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ isDark: false }) }));
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));
vi.mock("@/hooks/useScopedChat", () => ({
  useScopedChat: () => ({
    rows: [],
    loaded: true,
    currentChat: host.currentChat,
    select: host.select,
    newChat: host.newChat,
    rename: host.rename,
    remove: host.remove,
  }),
}));
vi.mock("@/components/ChatUI", () => ({ useChatMarkdownComponents: () => ({}) }));
vi.mock("@/components/ChatDropdownSelector", () => ({ default: () => null }));
// Run/stream is an external boundary; the panel retains its real quote and prompt preparation.
vi.mock("@/components/ChatSidebar/ChatContainer", async () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef, useState } = await import("react");
  return {
    default: forwardRef<
      ChatContainerHandle,
      ComponentProps<typeof import("@/components/ChatSidebar/ChatContainer").default>
    >(function Chat(props, ref) {
      host.props = props;
      const input = useRef<HTMLTextAreaElement>(null);
      const [draft, setDraft] = useState("");
      useEffect(() => {
        host.mounted();
        return () => {
          host.unmounted();
        };
      }, []);
      useImperativeHandle(ref, () => ({
        setInputValue: setDraft,
        focusInput: () => {
          host.focus();
          input.current?.focus();
        },
        scrollToTop: () => undefined,
        appendMentions: () => undefined,
        sendUserMessage: async content => {
          host.send(content);
          return true;
        },
      }));
      return (
        <div>
          <div data-slot="accessory">{props.composerAccessory}</div>
          <div data-slot="empty">{props.emptyState}</div>
          <textarea ref={input} value={draft} onChange={event => setDraft(event.target.value)} />
          <button
            data-send
            onClick={() =>
              host.send(host.props?.prepareUserContent?.([{ type: "text", text: draft }]))
            }
          >
            send
          </button>
        </div>
      );
    }),
  };
});
import VideoNoteChatPanel, { type VideoNoteChatPanelHandle } from "../VideoNoteChatPanel";
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
  vi.clearAllMocks();
});
async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const ref = createRef<VideoNoteChatPanelHandle>();
  await act(async () =>
    root?.render(
      <VideoNoteChatPanel
        ref={ref}
        videoNoteId={73}
        toolScope="raw-tool-scope"
        transcript="视频字幕原文"
      />
    )
  );
  return ref;
}
it("带引用换语保留草稿与引用身份，发送仍使用原引用协议和用户原文", async () => {
  vi.useFakeTimers();
  const ref = await mount();
  await act(async () => ref.current?.attachQuote({ text: "引用原句", time: 12.5 }));
  await act(async () => vi.advanceTimersByTimeAsync(60));
  const input = container.querySelector("textarea");
  if (!input) throw new Error("missing composer");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) throw new Error("missing native setter");
    setter.call(input, "手写 question");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    input.setSelectionRange(2, 5);
  });
  const systemPrompt = host.props?.customSystemPrompt;
  const prepare = host.props?.prepareUserContent;
  const focusCalls = host.focus.mock.calls.length;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(container.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("手写 question");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(host.props?.currentChat).toBe(host.currentChat);
    expect(host.props?.customSystemPrompt).toBe(systemPrompt);
    expect(host.props?.prepareUserContent).toBe(prepare);
    expect(host.focus).toHaveBeenCalledTimes(focusCalls);
    expect(host.send).not.toHaveBeenCalled();
    expect(host.mounted).toHaveBeenCalledTimes(1);
    expect(host.unmounted).not.toHaveBeenCalled();
  }
  const send = container.querySelector<HTMLButtonElement>("[data-send]");
  if (!send) throw new Error("missing send action");
  await act(async () => send.click());
  expect(host.send).toHaveBeenCalledWith([
    { type: "text", text: "> 视频 00:12\n> 引用原句\n\n手写 question" },
  ]);
  expect(container.querySelector('[data-slot="accessory"]')?.textContent).toBe("");
});
it("英文快捷问法与建议仅翻译标签，传入模型的提示仍为原数据", async () => {
  vi.useFakeTimers();
  desktopLocaleSource.setLocale("en-US");
  const ref = await mount();
  const suggestions = container.querySelectorAll<HTMLButtonElement>('[data-slot="empty"] button');
  if (!suggestions.length) throw new Error("missing suggestions");
  await act(async () => suggestions[0].click());
  expect(host.send).toHaveBeenCalledWith([{ type: "text", text: "总结这个视频的核心观点" }]);
  await act(async () => ref.current?.attachQuote({ text: "原句", time: 0 }));
  await act(async () => vi.advanceTimersByTimeAsync(60));
  const shortcut = container.querySelector<HTMLButtonElement>(
    '[data-slot="accessory"] button:not([aria-label])'
  );
  if (!shortcut) throw new Error("missing quick ask");
  await act(async () => shortcut.click());
  expect(container.querySelector("textarea")?.value).toBe("解释一下这句话");
  expect(host.send).toHaveBeenCalledTimes(1);
  expect(host.newChat).not.toHaveBeenCalled();
  expect(host.select).not.toHaveBeenCalled();
});
