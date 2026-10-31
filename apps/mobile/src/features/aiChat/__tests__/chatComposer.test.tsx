// 输入区：麦克风切到语音模式（微信式「按住 说话」），按住录音松手发送；键盘图标切回打字并聚焦。

import { act } from "react";
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

import { ChatComposer } from "../ChatComposer";
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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
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

  act(() => byLabel("切换到键盘")!.click());
  expect(byLabel("按住说话")).toBeNull();
  expect(textarea().hidden).toBe(false);
  expect(document.activeElement).toBe(textarea());
});

it("语音模式下按住录音，松手把识别结果直接发送", async () => {
  mount();
  act(() => byLabel("切换到语音输入")!.click());
  const bar = byLabel("按住说话")!;
  pointer(bar, "pointerdown");
  expect(speech.service.start).toHaveBeenCalledTimes(1);
  expect(bar.textContent).toBe("松开 发送");
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

it("按下输入框时先按预计键盘高度收起外壳，聚焦时输入框已在键盘上方，iOS 不会平移整页", () => {
  act(() =>
    root.render(
      <KeyboardViewportProvider>
        <ChatComposer running={false} onSend={onSend} onStop={vi.fn()} />
      </KeyboardViewportProvider>
    )
  );
  const kbHeight = () => document.documentElement.style.getPropertyValue("--kb-height");
  expect(kbHeight()).toBe("0px");
  pointer(textarea(), "pointerdown");
  expect(Number.parseInt(kbHeight(), 10)).toBeGreaterThan(0);
  // 键盘迟迟没升起（只是滑动、没有聚焦）：超时后释放，外壳回到原高
  act(() => vi.advanceTimersByTime(700));
  expect(kbHeight()).toBe("0px");
});
