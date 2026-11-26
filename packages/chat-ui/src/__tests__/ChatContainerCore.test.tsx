import { act, forwardRef, useImperativeHandle, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import type { ChatInputAreaHandle } from "@tau/shared";
import ChatContainerCore, {
  type ChatContainerCoreInputRendererParams,
  type ChatContainerCoreProps,
} from "../ChatContainerCore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const InputBoundary = forwardRef<
  ChatInputAreaHandle,
  ChatContainerCoreInputRendererParams["inputProps"]
>((props, ref) => {
  const [draft, setDraft] = useState("");
  useImperativeHandle(ref, () => ({
    getValue: () => (draft ? [{ type: "text", text: draft }] : []),
    clear: () => setDraft(""),
    setValue: setDraft,
    focusEnd: () => undefined,
  }));
  return (
    <>
      <textarea
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder={props.placeholder}
        data-model={props.currentModelName}
      />
      <button onClick={props.onPressEnter} disabled={!props.contentEditable} />
    </>
  );
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const inputRenderer = ({ chatInputRef, inputProps }: ChatContainerCoreInputRendererParams) => (
  <InputBoundary ref={chatInputRef} {...inputProps} />
);
const base: ChatContainerCoreProps = {
  isConnected: true,
  messages: [],
  isLoading: false,
  renderMessage: () => null,
  renderChatInputArea: inputRenderer,
};

it("换语保留输入实例、草稿选区与发送载荷，显式空字符串继续覆盖默认值", async () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const send = vi.fn();
  const userSend = vi.fn();
  const render = (props: Partial<ChatContainerCoreProps> = {}) =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <ChatContainerCore {...base} onSendMessageContent={send} onUserSend={userSend} {...props} />
      </I18nRuntimeProvider>
    );
  await act(async () => render());
  const input = container.querySelector("textarea");
  if (!input) throw new Error("missing input boundary");
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setValue) throw new Error("missing native textarea setter");
  await act(async () => {
    setValue.call(input, "用户原文与 :tool[id] 协议");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.focus();
  input.setSelectionRange(2, 6);
  const placeholder = input.placeholder;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => source.setLocale(locale));
    expect(container.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("用户原文与 :tool[id] 协议");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
    expect(document.activeElement).toBe(input);
    expect(send).not.toHaveBeenCalled();
    expect(userSend).not.toHaveBeenCalled();
  }
  expect(input.placeholder).not.toBe(placeholder);
  await act(async () => render({ placeholder: "", currentModelName: "" }));
  expect(input.placeholder).toBe("");
  expect(input.dataset.model).toBe("");
  await act(async () => source.setLocale("en-US"));
  expect(input.placeholder).toBe("");
  expect(input.dataset.model).toBe("");
  await act(async () => container.querySelector("button")?.click());
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith([{ type: "text", text: "用户原文与 :tool[id] 协议" }]);
  expect(userSend).toHaveBeenCalledTimes(1);
  expect(input.value).toBe("");
  runtime.dispose();
});

it("换语不重启连接延时，连接恢复只切换展示", async () => {
  vi.useFakeTimers();
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const send = vi.fn();
  const render = (isConnected: boolean) =>
    root.render(
      <I18nRuntimeProvider runtime={runtime}>
        <ChatContainerCore
          {...base}
          isConnected={isConnected}
          showConnectingDelayMs={800}
          onSendMessageContent={send}
        />
      </I18nRuntimeProvider>
    );
  await act(async () => render(false));
  await act(async () => vi.advanceTimersByTime(500));
  expect(container.childElementCount).toBe(0);
  await act(async () => source.setLocale("en-US"));
  await act(async () => vi.advanceTimersByTime(300));
  expect(container.childElementCount).toBeGreaterThan(0);
  expect(container.querySelector("textarea")).toBeNull();
  await act(async () => render(true));
  expect(container.querySelector("textarea")).not.toBeNull();
  expect(send).not.toHaveBeenCalled();
  runtime.dispose();
});
