import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  createWhiteboardSession,
  WHITEBOARD_DOCUMENT_VERSION,
  AudioUtil,
  VideoUtil,
} from "@tau/whiteboard";
import { toast } from "@tau/ui";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
vi.mock("../media", () => ({ whiteboardMedia: () => ({}) }));
import AudioSelectorModal from "../components/AudioSelectorModal";
import VideoSelectorModal from "../components/VideoSelectorModal";
let root: Root | undefined;
let host: HTMLDivElement;
let session: ReturnType<typeof createWhiteboardSession>;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  session?.dispose();
  desktopLocaleSource.setLocale("zh-CN");
  vi.restoreAllMocks();
});
it.each(["audio", "video"] as const)(
  "%s插入挂起期间换语不再选择文件或插入，原文件/白板与关闭结算保持",
  async kind => {
    session = createWhiteboardSession({
      children: [],
      viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      selection: { selectedElements: [], selectArea: null },
      version: WHITEBOARD_DOCUMENT_VERSION,
    });
    let finish!: () => void;
    const pending = () =>
      new Promise<void>(resolve => {
        finish = resolve;
      });
    const operation =
      kind === "audio"
        ? vi.spyOn(AudioUtil, "insertAudio").mockImplementation(pending)
        : vi.spyOn(VideoUtil, "insertVideo").mockImplementation(pending);
    const loading = vi.spyOn(toast, "loading");
    const dismiss = vi.spyOn(toast, "dismiss");
    const closed = vi.fn();
    function View() {
      useSyncExternalStore(desktopI18n.subscribe, desktopI18n.getSnapshot, desktopI18n.getSnapshot);
      const Selector = kind === "audio" ? AudioSelectorModal : VideoSelectorModal;
      return <Selector open action="local" board={session.api} onClose={closed} />;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<View />));
    const input = host.querySelector<HTMLInputElement>(`input[accept="${kind}/*"]`);
    if (!input) throw new Error("missing file input");
    const chooser = vi.spyOn(input, "click");
    const file = new File(["original bytes"], kind === "audio" ? "用户录音.wav" : "用户视频.mp4", {
      type: kind === "audio" ? "audio/wav" : "video/mp4",
    });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation.mock.calls[0][0]).toBe(file);
    expect(operation.mock.calls[0][1]).toBe(session.api);
    expect(loading).toHaveBeenCalledTimes(1);
    const reader = toast
      .items()
      .find(item => item.id === loading.mock.results[0].value)?.getMessage;
    if (!reader) throw new Error("missing loading presentation reader");
    const original = reader();
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("input")).toBe(input);
      expect(chooser).not.toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(1);
      expect(loading).toHaveBeenCalledTimes(1);
      expect(reader()).not.toBe(original);
      expect(dismiss).not.toHaveBeenCalled();
      expect(closed).not.toHaveBeenCalled();
    }
    await act(async () => finish());
    expect(closed).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith(loading.mock.results[0].value);
    expect(operation).toHaveBeenCalledTimes(1);
  }
);
