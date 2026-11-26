// 输入区：麦克风切到语音模式（微信式「按住 说话」），按住录音松手发送；键盘图标切回打字并聚焦。

import { act } from "react";
import { mobileLocaleSource } from "../../../services/i18n";
import { workspaceT } from "../workspace.binding";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HOLD_DELAY_MS } from "../../speechInput/useHoldGesture";

const speech = vi.hoisted(() => {
  let resolve: (value: { text: string }) => void = () => undefined;
  return {
    get resolve() {
      return resolve;
    },
    service: {
      start: vi.fn(async () => ({
        result: new Promise(done => {
          resolve = done as typeof resolve;
        }),
        stop: vi.fn(async () => resolve({ text: "明天提醒我交周报" })),
        cancel: vi.fn(async () => undefined),
      })),
    },
    unavailable: null as string | null,
  };
});
vi.mock("../../speechInput/speechService", () => ({
  useSpeechInputService: () => speech.service,
  useSpeechUnavailableReason: () => speech.unavailable,
}));
vi.mock("../../../components/toast", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock("../../cards/editorExtensions/ContentLinkPickerSheet", () => ({
  ContentLinkPickerSheet: () => null,
}));

const images = vi.hoisted(() => ({ convert: vi.fn<(file: File) => Promise<string>>() }));
vi.mock("../attachments", async importOriginal => ({
  ...(await importOriginal<object>()),
  imageFileToDataUrl: images.convert,
}));

import { ChatComposer } from "../ChatComposer";
import { ChatEmpty } from "../ChatEmpty";
import { KeyboardViewportProvider } from "../../../components/KeyboardViewportProvider";
import { toast } from "../../../components/toast";

let host: HTMLDivElement;
let root: Root;
const onSend = vi.fn();

function mount() {
  act(() => root.render(<ChatComposer running={false} onSend={onSend} onStop={vi.fn()} />));
}
const byLabel = (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const textarea = () => host.querySelector("textarea")!;

/** jsdom 没有 PointerEvent，用 MouseEvent 补上 pointerId（与 useHoldGesture 测试同法） */
function pointer(target: HTMLElement, type: string) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 700,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  act(() => {
    (type === "pointerdown" ? target : window).dispatchEvent(event);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  speech.unavailable = null;
  images.convert.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => mobileLocaleSource.setLocale("zh-CN"));
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it("点麦克风只切到语音模式，不开始录音；键盘图标切回并聚焦输入框", () => {
  mount();
  act(() => byLabel("切换到语音输入")!.click());
  expect(speech.service.start).not.toHaveBeenCalled();
  expect(byLabel("按住说话")?.textContent).toBe("按住 说话");
  expect(textarea().hidden).toBe(true);
  expect(textarea().classList.contains("hidden")).toBe(true);

  const input = textarea();
  const focus = vi.spyOn(input, "focus").mockImplementation(() => {
    // 模拟浏览器：隐藏的输入框无法聚焦。
    if (!input.hidden && !input.classList.contains("hidden")) {
      HTMLTextAreaElement.prototype.focus.call(input);
    }
  });
  act(() => byLabel("切换到键盘")!.click());
  expect(byLabel("按住说话")).toBeNull();
  expect(textarea().hidden).toBe(false);
  expect(document.activeElement).toBe(textarea());
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  focus.mockRestore();
});

it("语音模式下按住录音，松手把识别结果直接发送", async () => {
  mount();
  act(() => byLabel("切换到语音输入")!.click());
  const bar = byLabel("按住说话")!;
  pointer(bar, "pointerdown");
  expect(speech.service.start).toHaveBeenCalledTimes(1);
  expect(bar.textContent).toBe("松开 发送");
  const recording = await speech.service.start.mock.results[0].value;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(byLabel(workspaceT("voice.hold"))).toBe(bar);
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    expect(speech.service.start).toHaveBeenCalledTimes(1);
    expect(recording.cancel).not.toHaveBeenCalled();
    expect(recording.stop).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  }
  await act(async () => vi.advanceTimersByTimeAsync(HOLD_DELAY_MS + 10));
  pointer(bar, "pointerup");
  await act(async () => vi.advanceTimersByTimeAsync(10));
  expect(onSend).toHaveBeenCalledWith({
    text: "明天提醒我交周报",
    mentions: [],
    images: [],
  });
});

it("短按取消录音、不发送并提示手势；识别服务不可用时按下不录音并提示原因", async () => {
  mount();
  act(() => byLabel("切换到语音输入")!.click());
  const bar = byLabel("按住说话")!;
  pointer(bar, "pointerdown");
  pointer(bar, "pointerup");
  await act(async () => vi.advanceTimersByTimeAsync(10));
  expect(speech.service.start).toHaveBeenCalledTimes(1);
  expect(onSend).not.toHaveBeenCalled();
  expect(bar.textContent).toBe("按住 说话");
  expect(toast.info).toHaveBeenCalledWith(expect.objectContaining({ text: "按住说话，松手发送" }));

  speech.service.start.mockClear();
  speech.unavailable = "识别插件账号尚未配置";
  mount();
  pointer(byLabel("按住说话")!, "pointerdown");
  expect(speech.service.start).not.toHaveBeenCalled();
  expect(toast.info).toHaveBeenLastCalledWith(
    expect.objectContaining({ text: "识别插件账号尚未配置" })
  );
});

it("输入区不参与键盘自动露出，聚焦时不把整页往上卷", () => {
  mount();
  expect(textarea().closest('[data-kb-optout="true"]')).not.toBeNull();
});

it("两行卡片：引用挂在卡片第一行可删除，下排是 ＋、引用笔记与右下角主按钮", () => {
  const onMentionsChange = vi.fn();
  act(() =>
    root.render(
      <ChatComposer
        running={false}
        onSend={onSend}
        onStop={vi.fn()}
        mentions={[
          {
            entityType: "diary",
            entityId: 3,
            contentId: 9,
            title: "10 月 29 日",
            previewText: "",
          },
        ]}
        onMentionsChange={onMentionsChange}
      />
    )
  );
  const card = textarea().parentElement!;
  expect(card.textContent).toContain("10 月 29 日 · 日记");
  expect(card.contains(byLabel("引用笔记"))).toBe(true);
  expect(card.contains(byLabel("添加图片或引用"))).toBe(true);
  expect(card.contains(byLabel("切换到语音输入"))).toBe(true);
  act(() => byLabel("去掉引用")!.click());
  expect(onMentionsChange).toHaveBeenCalledWith([]);
});

/** jsdom 的 TouchEvent 不带坐标，用 Event 补上 touches / changedTouches */
function touch(target: HTMLElement, type: "touchstart" | "touchend", clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = [{ clientX: 100, clientY }];
  Object.defineProperty(event, type === "touchstart" ? "touches" : "changedTouches", {
    value: point,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it("点按输入框在抬手时收起外壳并聚焦，按下与滑动不移动输入框", () => {
  act(() =>
    root.render(
      <KeyboardViewportProvider>
        <ChatComposer running={false} onSend={onSend} onStop={vi.fn()} />
      </KeyboardViewportProvider>
    )
  );
  const kbHeight = () => document.documentElement.style.getPropertyValue("--kb-height");
  expect(kbHeight()).toBe("0px");
  // 按下时输入框不能移动，否则抬手按原落点命中别处
  touch(textarea(), "touchstart", 700);
  expect(kbHeight()).toBe("0px");
  // 滑动不接管
  expect(touch(textarea(), "touchend", 640).defaultPrevented).toBe(false);
  expect(kbHeight()).toBe("0px");
  touch(textarea(), "touchstart", 700);
  const tapEnd = touch(textarea(), "touchend", 702);
  expect(tapEnd.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(textarea());
  expect(Number.parseInt(kbHeight(), 10)).toBeGreaterThan(0);
  // 键盘尚未升起就切到语音，不保留预计键盘高度。
  act(() => byLabel("切换到语音输入")!.click());
  expect(kbHeight()).toBe("0px");
  act(() => byLabel("切换到键盘")!.click());
  expect(Number.parseInt(kbHeight(), 10)).toBeGreaterThan(0);
  act(() => textarea().blur());
  expect(kbHeight()).toBe("0px");
});

it("换语保留输入选区、显式空占位与在途图片读取，发送原附件和引用", async () => {
  const mention = {
    entityType: "card" as const,
    entityId: 8,
    contentId: 20,
    title: "新对话",
    previewText: "原始引用",
  };
  const changeMentions = vi.fn();
  act(() =>
    root.render(
      <ChatComposer
        running={false}
        placeholder=""
        imageInput
        mentions={[mention]}
        onMentionsChange={changeMentions}
        onSend={onSend}
        onStop={vi.fn()}
      />
    )
  );
  const input = textarea();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setter) throw new Error("missing native textarea setter");
  act(() => {
    setter.call(input, "用户草稿 :content[id]");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  let finish!: (value: string) => void;
  images.convert.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const picker = host.querySelector<HTMLInputElement>('input[type="file"][multiple]');
  if (!picker) throw new Error("missing image picker");
  const file = new File(["image"], "用户原图.png", { type: "image/png" });
  Object.defineProperty(picker, "files", { configurable: true, value: [file] });
  act(() => picker.dispatchEvent(new Event("change", { bubbles: true })));
  input.focus();
  input.setSelectionRange(2, 5);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(textarea()).toBe(input);
    expect(input.value).toBe("用户草稿 :content[id]");
    expect(input.placeholder).toBe("");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(images.convert).toHaveBeenCalledTimes(1);
    expect(changeMentions).not.toHaveBeenCalled();
    expect(speech.service.start).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  }
  const url = "data:image/jpeg;base64,ORIGINAL";
  await act(async () => finish(url));
  await act(async () => mobileLocaleSource.setLocale("en-US"));
  expect(host.querySelector("img")?.getAttribute("src")).toBe(url);
  act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(onSend).toHaveBeenCalledTimes(1);
  expect(onSend).toHaveBeenCalledWith({
    text: "用户草稿 :content[id]",
    mentions: [mention],
    images: [url],
  });
});

it("建议问题换语只更新显示，点击仍发送原始提问文本", async () => {
  vi.setSystemTime(new Date(2026, 10, 27, 9));
  const pick = vi.fn();
  act(() => root.render(<ChatEmpty onPick={pick} />));
  const suggestion = host.querySelector("button");
  if (!suggestion) throw new Error("missing suggestion");
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(host.querySelector("button")).toBe(suggestion);
    expect(pick).not.toHaveBeenCalled();
  }
  act(() => suggestion.click());
  expect(pick).toHaveBeenCalledTimes(1);
  expect(pick).toHaveBeenCalledWith("今天有哪些日程");
});
