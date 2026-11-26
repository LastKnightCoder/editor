import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWhiteboardSession, type Board, type WebviewElement } from "@tau/whiteboard";
import { createServiceRegistry, createWebviewExtension } from "@tau/whiteboard/extensions";
import { IResourceService } from "@tau/shared/host-services";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { useImageCapabilities } from "@/services/image-capabilities";
import ImageUrlModal from "../components/ImageSelectorModal/ImageUrlModal";
import ImageAIGenerateModal from "../components/ImageSelectorModal/ImageAIGenerateModal";
import WebviewSelectorModal from "../components/WebviewSelectorModal";
import WebviewElementComponent from "../components/WebviewElement";
import { imageWebviewTranslator } from "../image-webview.i18n";

const mocks = vi.hoisted(() => ({
  selectFile: vi.fn(),
  readTextFile: vi.fn(),
  getFileBaseName: vi.fn(),
  upload: vi.fn(),
  resolveResource: vi.fn(),
  board: null as Board | null,
  movingStore: { subscribe: () => () => undefined, getBoardMoving: () => false },
}));
vi.mock("@/commands", () => ({
  selectFile: mocks.selectFile,
  readTextFile: mocks.readTextFile,
  getFileBaseName: mocks.getFileBaseName,
  convertFileSrc: async () => "about:blank",
  getHomeDir: async () => "/test-home",
}));
vi.mock("@/services/image-generation", () => ({ generateImageResources: vi.fn() }));
// Geometry/pointer contexts are outside this host UI contract; board mutations and Webview resolution stay real.
vi.mock("@tau/whiteboard", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/whiteboard")>()),
  ArrowConnectPointGroup: () => null,
  useBoard: () => mocks.board,
  useBoardState: () => ({ movingStore: mocks.movingStore }),
  useSelectState: () => ({ isSelected: false }),
  useSelection: () => null,
  useSketch: () => ({ enabled: false }),
  useDropArrow: () => ({
    isMoveArrowClosing: false,
    activeConnectId: null,
    arrowConnectPoints: [],
    arrowConnectExtendPoints: [],
  }),
}));

let host: HTMLDivElement;
let root: Root;
const sessions: ReturnType<typeof createWhiteboardSession>[] = [];
const locales = ["zh-TW", "en-US"] as const;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const render = (node: React.ReactNode) =>
  act(async () =>
    root.render(<I18nRuntimeProvider runtime={desktopI18n}>{node}</I18nRuntimeProvider>)
  );
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    node => node.textContent?.trim() === text
  );
const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const prototype =
      input instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
function boardWith(children: WebviewElement[] = []) {
  const session = createWhiteboardSession(
    {
      children,
      viewPort: { minX: 0, minY: 0, width: 1000, height: 800, zoom: 1 },
      selection: { selectedElements: [], selectArea: null },
      version: 2,
    },
    [createWebviewExtension({})]
  );
  sessions.push(session);
  const resources = createServiceRegistry(register =>
    register(IResourceService, {
      upload: mocks.upload,
      remoteResourceToLocal: mocks.resolveResource,
    })
  );
  // Inject only the host resource boundary while preserving the real session's accessors and commands.
  const board: Board = Object.create(session.api);
  Object.defineProperty(board, "getService", { value: resources.get });
  return { board, session };
}
beforeEach(() => {
  vi.clearAllMocks();
  desktopLocaleSource.setLocale("zh-CN");
  useImageCapabilities.setState({ canGenerate: true, canEdit: true });
  mocks.resolveResource.mockResolvedValue("/cached/page.html");
  mocks.selectFile.mockResolvedValue(["/picked/original.html"]);
  mocks.getFileBaseName.mockResolvedValue("original.html");
  mocks.readTextFile.mockResolvedValue("<html><body>用户原始 HTML 字节</body></html>");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  sessions.splice(0).forEach(session => session.dispose());
  host.remove();
  mocks.board = null;
  desktopLocaleSource.setLocale("zh-CN");
});

it("图片地址草稿和预览跨语言保留，在途插入只提交一次原URL且保留原诊断", async () => {
  const pending = deferred<void>();
  const confirm = vi.fn(() => pending.promise);
  await render(<ImageUrlModal open onCancel={vi.fn()} onConfirm={confirm} />);
  const input = document.querySelector("input");
  if (!input) throw new Error("image URL input missing");
  await type(input, " https://example.com/raw-image.png?value=原文 ");
  input.focus();
  input.setSelectionRange(4, 9);
  const preview = document.querySelector("img");
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe(" https://example.com/raw-image.png?value=原文 ");
    expect([input.selectionStart, input.selectionEnd]).toEqual([4, 9]);
    expect(document.activeElement).toBe(input);
    expect(document.querySelector("img")).toBe(preview);
    expect(confirm).not.toHaveBeenCalled();
  }
  await act(async () => button(imageWebviewTranslator.t("insert"))?.click());
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(confirm).toHaveBeenCalledExactlyOnceWith("https://example.com/raw-image.png?value=原文");
    expect(document.querySelector("input")).toBe(input);
  }
  const cause = new Error("original insertion diagnostic");
  await act(async () => pending.reject(cause));
  expect(document.body.textContent).toContain(cause.message);
});

it("AI描述和进行中的signal跨语言保留，不重发生成或提前取消", async () => {
  const pending = deferred<void>();
  const confirm = vi.fn<(prompt: string, signal: AbortSignal) => Promise<void>>(
    () => pending.promise
  );
  await render(<ImageAIGenerateModal open onCancel={vi.fn()} onConfirm={confirm} />);
  const input = document.querySelector("textarea");
  if (!input) throw new Error("image prompt missing");
  await type(input, "  用户自己的生成要求  ");
  input.focus();
  input.setSelectionRange(2, 6);
  await act(async () => desktopLocaleSource.setLocale("zh-TW"));
  expect(document.querySelector("textarea")).toBe(input);
  expect(input.value).toBe("  用户自己的生成要求  ");
  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => button(imageWebviewTranslator.t("image.generateInsert"))?.click());
  const signal = confirm.mock.calls[0][1];
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(confirm).toHaveBeenCalledExactlyOnceWith("用户自己的生成要求", signal);
    expect(signal.aborted).toBe(false);
    expect(document.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("  用户自己的生成要求  ");
  }
  await act(async () => pending.resolve());
});

it.each([true, false])(
  "本地HTML在途跨语言保留原字节和上传参数，提交目标有效=%s时遵守原守卫",
  async active => {
    const pending = deferred<string>();
    mocks.upload.mockReturnValue(pending.promise);
    const { board, session } = boardWith();
    const close = vi.fn();
    await render(<WebviewSelectorModal open onClose={close} board={board} />);
    const input = document.querySelector("input");
    if (!input) throw new Error("web URL input missing");
    await type(input, "example.com/raw?value=原文");
    await act(async () => button(imageWebviewTranslator.t("webview.selectHtml"))?.click());
    await act(async () => vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce()));
    const file = mocks.upload.mock.calls[0][0] as File;
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(file);
    });
    expect([file.name, file.type, content]).toEqual([
      "original.html",
      "text/html",
      "<html><body>用户原始 HTML 字节</body></html>",
    ]);
    for (const locale of locales) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector("input")).toBe(input);
      expect(input.value).toBe("example.com/raw?value=原文");
      expect(mocks.upload).toHaveBeenCalledOnce();
      expect(mocks.selectFile).toHaveBeenCalledOnce();
      expect(board.children).toEqual([]);
      expect(close).not.toHaveBeenCalled();
    }
    if (!active) session.setActive(false);
    await act(async () => pending.resolve("tau-collab-asset:original-html"));
    if (active) {
      expect(board.children).toHaveLength(1);
      expect(board.children[0]).toMatchObject({
        type: "webview",
        url: "tau-collab-asset:original-html",
        sourceType: "local",
        width: 600,
        height: 400,
      });
      expect(close).toHaveBeenCalledOnce();
    } else {
      expect(board.children).toEqual([]);
      expect(close).not.toHaveBeenCalled();
    }
  }
);

it("已加载网页跨语言保持同一iframe和资源解析，不重新下载或写回白板", async () => {
  const element: WebviewElement = {
    id: "original-webview",
    type: "webview",
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    url: "tau-collab-asset:original-html",
    sourceType: "local",
  };
  const { board } = boardWith([element]);
  mocks.board = board;
  const original = board.children[0];
  await render(
    <svg>
      <WebviewElementComponent element={element} onResize={vi.fn()} />
    </svg>
  );
  await act(async () =>
    vi.waitFor(() =>
      expect(document.querySelector("iframe")?.getAttribute("src")).toBe("about:blank")
    )
  );
  const frame = document.querySelector("iframe");
  for (const locale of locales) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("iframe")).toBe(frame);
    expect(frame?.getAttribute("src")).toBe("about:blank");
    expect(mocks.resolveResource).toHaveBeenCalledExactlyOnceWith(element.url);
    expect(board.children[0]).toBe(original);
  }
});
