import type { WhiteboardAPI } from "@tau/whiteboard";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { WhiteBoardProps, WhiteBoardRef } from "@tau/whiteboard";
import { IWhiteboardRichText } from "@tau/whiteboard/extensions";
import { IResourceService } from "@tau/shared/host-services";
import { DesktopWhiteboard } from "../DesktopWhiteboard";

const mocks = vi.hoisted(() => ({
  active: "a",
  renders: vi.fn(),
  updateContent: vi.fn(async () => null),
  decrementContentRefCount: vi.fn(async () => {}),
  settingsReads: 0,
}));
vi.mock("@tau/whiteboard", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/whiteboard")>()),
  default: (props: WhiteBoardProps) => {
    mocks.renders(props);
    return null;
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: {
    getState: () => {
      if (++mocks.settingsReads > 30) throw new Error("桌面白板递归挂载");
      return { setting: { database: { active: mocks.active } } };
    },
  },
}));
vi.mock("../outlineStore", () => ({
  useWhiteboardOutlineStore: () => ({ open: true, width: 260, setWidth: vi.fn() }),
}));
vi.mock("@/commands/content", () => ({
  updateContent: mocks.updateContent,
  decrementContentRefCount: mocks.decrementContentRefCount,
}));
vi.mock("@/services/editorKit", () => ({
  getContentKit: vi.fn(),
  getDescriptionKit: vi.fn(),
  getArrowLabelKit: vi.fn(),
}));
vi.mock("@/hooks/useCollaborationKit", () => ({ collaborationKit: vi.fn() }));
vi.mock("@/services/contentBindings", () => ({ getContentBinding: vi.fn() }));
vi.mock("@/utils", () => ({ getImageInfo: vi.fn(), getVideoInfo: vi.fn() }));
vi.mock("@/utils/markdown", () => ({ importFromMarkdown: vi.fn() }));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: vi.fn() }));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn() }));
vi.mock("@/utils/snapdom-export", () => ({ captureBlobWithSnapdom: vi.fn() }));
vi.mock("@/components/ContentEditor", () => ({ default: () => null }));
vi.mock("@/components/ContentSelectorModal", () => ({ default: () => null }));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));
vi.mock("@/hooks/useContentDocument", () => ({ default: () => ({ article: null }) }));
vi.mock("../NoteLayers", () => ({ NoteLayers: () => null }));
vi.mock("../RichTextActionsLayer", () => ({ RichTextActionsLayer: () => null }));
vi.mock("../components/Document/DocumentSelectorModal", () => ({
  DocumentSelectorModal: () => null,
}));
vi.mock("../components/ImageSelectorModal", () => ({ default: () => null }));
vi.mock("../components/VideoSelectorModal", () => ({ default: () => null }));
vi.mock("../components/AudioSelectorModal", () => ({ default: () => null }));
vi.mock("../components/WebviewSelectorModal", () => ({ default: () => null }));
vi.mock("../components/WhiteBoardSelectorModal", () => ({ default: () => null }));
vi.mock("../components/Document/DocumentCard", () => ({ DocumentCard: () => null }));
vi.mock("../components/Document/DocumentReader", () => ({ DocumentReaderLayer: () => null }));
vi.mock("../components/WhiteBoardCard", () => ({ default: () => null }));
vi.mock("../components/VideoElement", () => ({ default: () => null }));
vi.mock("../components/WebviewElement", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Image", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Video", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Audio", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Document", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Webview", () => ({ default: () => null }));
vi.mock("../components/Toolbar/WhiteBoard", () => ({ default: () => null }));

afterEach(() => {
  vi.clearAllMocks();
  mocks.active = "a";
  mocks.settingsReads = 0;
});

it("真实桌面适配器只挂载一次包组件，并传递 ref、初始值和宿主能力", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const initial: WhiteBoardProps["initData"] = [];
  const ref = createRef<WhiteBoardRef>();
  const changed = vi.fn();
  try {
    await act(async () =>
      root.render(<DesktopWhiteboard ref={ref} initData={initial} onChange={changed} />)
    );
    expect(mocks.renders).toHaveBeenCalledTimes(1);
    const props = mocks.renders.mock.calls[0][0] as WhiteBoardProps & { ref: typeof ref };
    expect(props.initData).toBe(initial);
    expect(props.ref).toBe(ref);
    expect(props.onChange).toBe(changed);
    expect(props.extensions.map(extension => extension.id)).toEqual(
      expect.arrayContaining(["tau.document", "tau.richtext", "tau.image", "tau.desktop-notes"])
    );
    const api = { tryGetService: () => undefined } as unknown as WhiteboardAPI;
    const contributions = props.extensions.flatMap(extension => extension.create(api).layers ?? []);
    expect(contributions.some(layer => layer.id === "tau.document.reader")).toBe(true);
    expect(contributions.some(layer => layer.id === "tau.desktop-notes.panels")).toBe(true);
    // 宿主能力经服务注册表下发：富文本与上传服务都已注册
    expect(props.services?.tryGet(IWhiteboardRichText)?.Editor).toBeDefined();
    expect(props.services?.tryGet(IWhiteboardRichText)?.content?.create).toBeDefined();
    expect(props.services?.tryGet(IResourceService)?.upload).toBeDefined();
    expect(props).not.toHaveProperty("slots");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
