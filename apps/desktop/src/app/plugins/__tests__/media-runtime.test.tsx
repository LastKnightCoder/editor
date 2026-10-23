import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "@tau/editor";
import { defineElement, defineExtension } from "@tau/editor/api";
import { IResourceService } from "@tau/shared/host-services";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import {
  MediaImage,
  useMediaAppearance,
  useResource,
  useResourceUpload,
  type ResourceState,
  type ResourceUpload,
} from "@tau/plugins";

const mocks = vi.hoisted(() => ({
  resolveMediaSource: vi.fn(),
  appUpload: vi.fn(async () => "app.png"),
  setting: {
    misc: { image: { autoCacheRemote: true }, audio: { autoCacheRemote: false } },
    appearance: { image: { borderRadius: "md" } },
  },
}));

vi.mock("@/utils/mediaSource", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils/mediaSource")>()),
  resolveMediaSource: mocks.resolveMediaSource,
}));
vi.mock("@/utils", () => ({ remoteResourceToLocal: vi.fn() }));
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (state: { setting: typeof mocks.setting }) => unknown) =>
    select({ setting: mocks.setting }),
}));
vi.mock("@/services/editorServiceImplementations", () => ({
  desktopEditorSlots: {
    Image: ({ url }: { url: string }) => <img data-slot="app" src={url} />,
    Video: () => null,
    Audio: () => null,
  },
  desktopResourceService: { upload: mocks.appUpload },
}));

await import("../media-runtime");

let root: Root | undefined;
let host: HTMLDivElement;
let captured: { upload?: ResourceUpload; resource?: ResourceState } = {};

function Probe({ url }: { url: string }) {
  captured = { upload: useResourceUpload(), resource: useResource(url, { kind: "image" }) };
  const appearance = useMediaAppearance();
  return (
    <span data-appearance={appearance?.borderRadius}>
      <MediaImage url={url} />
    </span>
  );
}

const probeExtension = defineExtension({
  id: "test.media-probe",
  elements: [
    defineElement({
      type: "media-probe",
      kind: "block",
      isVoid: true,
      render: ({ attributes, children }) => (
        <div {...attributes}>
          <div contentEditable={false}>
            <Probe url="doc.png" />
          </div>
          {children}
        </div>
      ),
    }),
  ],
});

const scopedResolve = vi.fn(async () => "/shared/doc.png");
const scopedUpload = vi.fn(async () => "shared.png");
const kit = createEditorKit({
  extensions: [probeExtension],
  services: [
    register =>
      register(IResourceService, { upload: scopedUpload, remoteResourceToLocal: scopedResolve }),
    register =>
      register(IEditorSlots, {
        ...createDefaultEditorSlots(),
        Image: ({ url }) => <img data-slot="scoped" src={url} />,
      }),
  ],
});

const render = async (node: React.ReactNode) => {
  await act(async () => root!.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>));
};
const editor = (readonly: boolean) => (
  <Editor
    kit={kit}
    readonly={readonly}
    initValue={[{ type: "media-probe", children: [{ type: "formatted", text: "" }] } as never]}
  />
);

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  captured = {};
  mocks.resolveMediaSource.mockReset();
  mocks.resolveMediaSource.mockImplementation(async (url: string) => ({
    url: `preview:${url}`,
    method: "app-protocol",
  }));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
});

it("编辑器内使用当前 kit 的插槽、资源解析与上传，只读时不提供上传", async () => {
  await render(editor(false));
  expect(host.querySelector("img")?.dataset.slot).toBe("scoped");
  expect(captured.upload).toBe(scopedUpload);
  expect(captured.resource).toMatchObject({ src: "preview:doc.png", status: "ready" });
  expect(mocks.resolveMediaSource).toHaveBeenCalledWith(
    "doc.png",
    expect.objectContaining({
      kind: "image",
      autoCacheRemote: true,
      resolveCollaborationResource: scopedResolve,
    })
  );

  await render(editor(true));
  expect(captured.upload).toBeUndefined();
});

it("编辑器外回落应用默认插槽与上传，外观取用户设置", async () => {
  await render(<Probe url="page.png" />);
  expect(host.querySelector("img")?.dataset.slot).toBe("app");
  expect(host.querySelector("span")?.dataset.appearance).toBe("md");
  expect(captured.upload).toBe(mocks.appUpload);
});

it("解析失败报告错误，retry 作废缓存后重新解析", async () => {
  mocks.resolveMediaSource.mockRejectedValueOnce(new Error("未共享"));
  await render(<Probe url="retry.png" />);
  expect(captured.resource).toMatchObject({ src: undefined, status: "error" });
  await act(async () => captured.resource!.retry());
  expect(mocks.resolveMediaSource).toHaveBeenCalledTimes(2);
  expect(captured.resource).toMatchObject({ src: "preview:retry.png", status: "ready" });
});
