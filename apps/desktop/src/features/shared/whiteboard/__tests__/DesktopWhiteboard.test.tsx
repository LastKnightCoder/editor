import type { WhiteboardAPI } from "@tau/whiteboard";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { rememberDatabaseConnection } from "@/services/command-context";
import type { WhiteboardProps, WhiteboardRef } from "@tau/whiteboard";
import { IWhiteboardRichText } from "@tau/whiteboard/extensions";
import { IResourceService } from "@tau/shared/host-services";
import { DesktopWhiteboard } from "../DesktopWhiteboard";

const mocks = vi.hoisted(() => {
  const invoke = vi.fn();
  window.electron = { platform: "darwin", invoke, on: vi.fn() } as unknown as ElectronAPI;
  return {
    invoke,
    connection: "before",
    active: "a",
    renders: vi.fn(),
    changed: vi.fn(),
    updateContent: vi.fn(async () => null),
    decrementContentRefCount: vi.fn(async () => {}),
    settingsReads: 0,
  };
});
vi.mock("@tau/whiteboard", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/whiteboard")>()),
  default: (props: WhiteboardProps) => {
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
vi.mock("@/services/editorKit", () => ({
  prepareNewContent: async (content: unknown) => ({ content, contracts: {} }),
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
vi.mock("../components/Document/QuickInsertPanel", () => ({
  QuickInsertLayer: () => null,
}));
vi.mock("../components/Document/SuggestionLayer", () => ({ SuggestionLayer: () => null }));
vi.mock("../components/Document/PeekLayer", () => ({ PeekLayer: () => null }));
vi.mock("../components/Document/PdfFace", () => ({ PdfPageTurnLayer: () => null }));
vi.mock("../components/Document/ExcerptCard", () => ({
  ExcerptCard: () => null,
  ExcerptSourceLayer: () => null,
}));
vi.mock("../components/Document/MaterialShelf", () => ({ MaterialShelf: () => null }));
vi.mock("../components/ImageSelectorModal", () => ({ default: () => null }));
vi.mock("../components/VideoSelectorModal", () => ({ default: () => null }));
vi.mock("../components/AudioSelectorModal", () => ({ default: () => null }));
vi.mock("../components/WebviewSelectorModal", () => ({ default: () => null }));
vi.mock("../components/WhiteboardSelectorModal", () => ({ default: () => null }));
vi.mock("../components/Document/DocumentCard", () => ({ DocumentCard: () => null }));
vi.mock("../components/Document/DocumentReader", () => ({ DocumentReaderLayer: () => null }));
vi.mock("../components/WhiteboardCard", () => ({ default: () => null }));
vi.mock("../components/VideoElement", () => ({ default: () => null }));
vi.mock("../components/WebviewElement", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Image", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Video", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Audio", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Document", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Webview", () => ({ default: () => null }));
vi.mock("../components/Toolbar/Whiteboard", () => ({ default: () => null }));

afterEach(() => {
  vi.clearAllMocks();
  mocks.active = "a";
  mocks.settingsReads = 0;
});

it("真实桌面适配器只挂载一次包组件，并传递 ref、初始值和宿主能力", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const initial: WhiteboardProps["initData"] = [];
  const ref = createRef<WhiteboardRef>();
  const changed = vi.fn();
  try {
    await act(async () =>
      root.render(<DesktopWhiteboard ref={ref} initData={initial} onChange={changed} />)
    );
    expect(mocks.renders).toHaveBeenCalledTimes(1);
    const props = mocks.renders.mock.calls[0][0] as WhiteboardProps & { ref: typeof ref };
    expect(props.initData).toBe(initial);
    expect(props.ref).toBe(ref);
    const notification = {} as Parameters<NonNullable<WhiteboardProps["onChange"]>>[0];
    props.onChange?.(notification);
    expect(changed).toHaveBeenCalledWith(notification);
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

function richText() {
  const props = mocks.renders.mock.calls.at(-1)?.[0] as WhiteboardProps | undefined;
  const content = props?.services?.tryGet(IWhiteboardRichText)?.content;
  if (!content) throw new Error("白板正文服务尚未注册");
  return { content, props };
}

async function withReconnectingWhiteboard(run: (reopen: () => Promise<void>) => Promise<void>) {
  mocks.settingsReads = 0;
  mocks.connection = "before";
  rememberDatabaseConnection({ databaseName: "a", connectionId: mocks.connection });
  mocks.invoke.mockImplementation(async (_channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseConnection?: string };
    if (scope.toolDatabaseConnection !== mocks.connection)
      throw new Error("DATABASE_CONNECTION_CHANGED");
    return 17;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    const reopen = async () => {
      await act(async () =>
        root.render(
          <DesktopWhiteboard key={mocks.connection} initData={[]} onChange={mocks.changed} />
        )
      );
    };
    await reopen();
    await run(reopen);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

it("嵌入式白板覆盖后冻结旧画布，重新打开才恢复新连接操作", async () => {
  await withReconnectingWhiteboard(async reopen => {
    const previous = richText();
    await act(async () => {
      mocks.connection = "after";
      rememberDatabaseConnection({ databaseName: "a", connectionId: mocks.connection });
    });
    expect(richText().props?.readonly).toBe(true);
    const calls = mocks.invoke.mock.calls.length;
    expect(await previous.content.create([], 0)).toBeNull();
    previous.props?.onChange?.({} as Parameters<NonNullable<WhiteboardProps["onChange"]>>[0]);
    expect(mocks.changed).not.toHaveBeenCalled();
    expect(mocks.invoke.mock.calls).toHaveLength(calls);
    await reopen();
    expect(await richText().content.create([], 0)).toBe(17);
  });
});

it("普通切库仍能清理原库引用，原库被覆盖后旧清理不落到新库", async () => {
  await withReconnectingWhiteboard(async () => {
    const previous = richText();
    mocks.active = "b";
    await previous.content.unretain(17);
    expect(mocks.invoke).toHaveBeenCalledWith("content:decrement-ref-count", 17, {
      toolDatabaseName: "a",
      toolDatabaseConnection: "before",
    });
    const calls = mocks.invoke.mock.calls.length;
    await act(async () => {
      mocks.connection = "after";
      rememberDatabaseConnection({ databaseName: "a", connectionId: mocks.connection });
    });
    await previous.content.unretain(17);
    expect(mocks.invoke.mock.calls).toHaveLength(calls);
  });
});

it.skipIf(process.env.TAU_DATABASE_RECONNECT_STRESS !== "1")(
  "嵌入式白板连续覆盖后新操作恢复，旧服务不接管新库",
  async () => {
    await withReconnectingWhiteboard(async reopen => {
      const rounds = 200;
      for (let index = 0; index < rounds; index++) {
        const previous = richText();
        mocks.settingsReads = 0;
        await act(async () => {
          mocks.connection = `generation-${index}`;
          rememberDatabaseConnection({ databaseName: "a", connectionId: mocks.connection });
        });
        expect(richText().props?.readonly).toBe(true);
        const calls = mocks.invoke.mock.calls.length;
        expect(await previous.content.create([], 0)).toBeNull();
        expect(mocks.invoke.mock.calls).toHaveLength(calls);
        await reopen();
        expect(await richText().content.create([], 0)).toBe(17);
      }
      console.info(
        `[embedded whiteboard stress] replacements=${rounds}, currentCreates=${rounds}, obsoleteServicesBlocked=${rounds}`
      );
    });
  },
  120_000
);
