import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor } from "slate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ASRTranscript, SpeechInputService } from "@tau/asr";

const mocks = vi.hoisted(() => ({
  runtime: { asr: {} },
  begin: vi.fn(),
  restore: vi.fn(),
  start: vi.fn(),
}));
vi.mock("../../../app/plugins/context", () => ({ useMobilePlugins: () => mocks.runtime }));
vi.mock("../../../router/pageLifecycle", () => ({ useOptionalPageInstanceContext: () => null }));
vi.mock("../../../services/speechInput", () => ({
  createMobileSpeechInputService: () => ({ start: mocks.start }) satisfies SpeechInputService,
}));
vi.mock("../../../components/toast", () => ({ toast: vi.fn() }));
vi.mock("../useDictationKeyboardSwap", () => ({
  useDictationKeyboardSwap: () => ({
    begin: mocks.begin,
    restore: mocks.restore,
    panelHeight: 300,
  }),
}));

import { useEditorDictation, type EditorDictation } from "../useEditorDictation";

let root: Root;
let host: HTMLDivElement;
let dictation: EditorDictation;
let resolveResult: (transcript: ASRTranscript) => void;
let rejectResult: (error: Error) => void;
const editor = createEditor();
editor.children = [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }];
editor.selection = {
  anchor: { path: [0, 0], offset: 1 },
  focus: { path: [0, 0], offset: 1 },
};

function Harness() {
  dictation = useEditorDictation({ getEditor: () => editor, mode: "point" });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  const result = new Promise<ASRTranscript>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => undefined);
  mocks.start.mockResolvedValue({
    result,
    stop: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
  mocks.restore.mockClear();
});
afterEach(() => {
  act(() => {
    dictation.cancel();
    root.unmount();
  });
  host.remove();
});

const begin = async () => {
  await act(async () => dictation.begin());
  expect(mocks.begin).toHaveBeenCalledWith(editor);
  expect(dictation.phase).toBe("listening");
  expect(mocks.restore).not.toHaveBeenCalled();
};

it("握手或权限失败后恢复键盘", async () => {
  mocks.start.mockRejectedValueOnce(new Error("连接失败"));
  await act(async () => dictation.begin());
  expect(dictation.phase).toBe("error");
  expect(mocks.restore).toHaveBeenCalled();
});

it("识别中服务失败后恢复键盘", async () => {
  await begin();
  await act(async () => rejectResult(new Error("服务断开")));
  expect(dictation.phase).toBe("error");
  expect(mocks.restore).toHaveBeenCalled();
});

it("服务自动停止时恢复键盘，不依赖手指松开", async () => {
  await begin();
  await act(async () => resolveResult({ text: "", segments: [] }));
  expect(dictation.phase).toBe("idle");
  expect(mocks.restore).toHaveBeenCalled();
});

it("松手即恢复键盘，不等待尾句返回", async () => {
  await begin();
  act(() => dictation.finish());
  expect(dictation.phase).toBe("committing");
  expect(mocks.restore).toHaveBeenCalled();
});
