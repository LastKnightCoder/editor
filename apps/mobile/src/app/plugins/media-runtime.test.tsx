import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { mobileMediaRuntime } from "./media-runtime";

const fixture = vi.hoisted(() => ({
  readOnly: false,
  upload: vi.fn(),
  resolve: vi.fn(),
  local: vi.fn(),
}));
vi.mock("slate-react", () => ({ useReadOnly: () => fixture.readOnly }));
vi.mock("@tau/editor", () => ({
  useOptionalService: () => ({ upload: fixture.upload, remoteResourceToLocal: fixture.resolve }),
}));
vi.mock("../../services/editorRegistry", () => ({ mobileEditorSlots: {} }));
vi.mock("../../components/editor/localMedia", () => ({
  resolveLocalMediaSource: (url: string) => fixture.local(url),
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
  fixture.readOnly = false;
});

it("上传走当前文档服务，只读不向插件暴露写入口", async () => {
  let upload: ReturnType<typeof mobileMediaRuntime.useResourceUpload>;
  function Probe() {
    upload = mobileMediaRuntime.useResourceUpload();
    return null;
  }
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
  expect(upload!).toBe(fixture.upload);
  fixture.readOnly = true;
  await act(async () => root.render(<Probe />));
  expect(upload!).toBeUndefined();
});

it("资源按当前文档解析，切换地址后忽略旧请求", async () => {
  let finishOld: (value: string) => void = () => {};
  fixture.resolve.mockImplementation((url: string) =>
    url === "old"
      ? new Promise<string>(resolve => {
          finishOld = resolve;
        })
      : Promise.resolve("new-local")
  );
  fixture.local.mockImplementation(async (url: string) => `blob:${url}`);
  function Probe({ url }: { url: string }) {
    const state = mobileMediaRuntime.useResource(url, { kind: "image" });
    return <span>{state.src}</span>;
  }
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<Probe url="old" />));
  await act(async () => root.render(<Probe url="new" />));
  expect(container.textContent).toBe("blob:new-local");
  await act(async () => finishOld("old-local"));
  expect(container.textContent).toBe("blob:new-local");
});
