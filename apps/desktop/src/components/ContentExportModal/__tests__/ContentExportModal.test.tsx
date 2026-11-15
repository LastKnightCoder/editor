import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeDocument, NodeTree, type ContentNode } from "@tau/collaboration";
import { createEditorKit, type EditorKit } from "@tau/editor";
import { useThemeStore } from "@tau/themes/react";
import { Awareness } from "y-protocols/awareness";
import { registerContentBinding } from "@/services/contentBindings";
import { desktopContentPlugins } from "../../../../shared/content-plugins";
import ContentExportModal from "..";
import { ContentDocumentImageExportModal } from "../ContentDocumentImageExportModal";
import { SnapshotImagePreview } from "../SnapshotImagePreview";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  download: vi.fn(),
  clipboardWrite: vi.fn(async () => {}),
  overrides: [] as { mode?: string; themeKey?: string }[],
  kit: undefined as EditorKit | undefined,
  documentId: undefined as string | undefined,
}));

vi.mock("@tau/editor", async importOriginal => {
  const actual = await importOriginal<typeof import("@tau/editor")>();
  return {
    ...actual,
    Editor: (props: React.ComponentProps<typeof actual.Editor>) =>
      props.document ? <actual.Editor {...props} /> : <div data-testid="editor">正文</div>,
    EditorThemeOverride: ({
      mode,
      themeKey,
      children,
    }: {
      mode?: string;
      themeKey?: string;
      children: ReactNode;
    }) => {
      mocks.overrides.push({ mode, themeKey });
      return children;
    },
  };
});
vi.mock("@/services/editorKit", () => ({ getContentKit: () => ({}) }));
vi.mock("@/hooks/useCollaborationKit", () => ({
  collaborationKit: () => mocks.kit,
  useCollaborationKit: () => mocks.kit,
}));
vi.mock("@/hooks/useContentSession", () => ({
  default: () => ({
    databaseName: "test",
    entry: mocks.documentId && { documentId: mocks.documentId, mode: "local" },
  }),
}));
vi.mock("@/utils/snapdom-export", () => ({ captureBlobWithSnapdom: mocks.capture }));
vi.mock("@/utils/download", () => ({ downloadBlob: mocks.download }));
vi.mock("@tau/ui", async () => {
  const actual = await vi.importActual<typeof import("@tau/ui")>("@tau/ui");
  return { ...actual, toast: { success: vi.fn(), error: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

const image = () => document.querySelector<HTMLElement>("[data-theme][data-mode][style]")!;
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
    b.textContent?.includes(name)
  )!;
const switchOf = (label: string) =>
  [...document.querySelectorAll("label")]
    .find(l => l.textContent?.startsWith(label))!
    .querySelector<HTMLButtonElement>('[role="switch"]')!;
const snapshotKit = createEditorKit({});
const emptyContent: [] = [];

async function render(title?: string) {
  await act(async () => {
    root.render(
      <ContentExportModal
        open
        onClose={vi.fn()}
        title={title}
        renderPreview={preview => (
          <SnapshotImagePreview {...preview} content={emptyContent} kit={snapshotKit} />
        )}
      />
    );
  });
  // Dialog 进场走 rAF
  await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
}

beforeEach(() => {
  localStorage.clear();
  mocks.overrides = [];
  vi.clearAllMocks();
  useThemeStore.setState({ theme: "ocean", mode: "dark" });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write: mocks.clipboardWrite },
  });
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(public items: Record<string, Blob>) {}
    }
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("ContentExportModal", () => {
  it("默认跟随应用主题族与明暗，编辑器同步覆盖", async () => {
    await render("间隔重复");
    expect(image().dataset.theme).toBe("ocean");
    expect(image().dataset.mode).toBe("dark");
    expect(mocks.overrides.at(-1)).toEqual({ mode: "dark", themeKey: "ocean" });
    expect(image().textContent).toContain("间隔重复");
  });

  it("选样式与深色开关会记住，下次打开沿用", async () => {
    await render("间隔重复");
    await act(async () => button("樱花").click());
    await act(async () => switchOf("深色").click());
    expect(image().dataset.theme).toBe("sakura");
    expect(image().dataset.mode).toBe("light");

    await act(async () => root.unmount());
    root = createRoot(host);
    await render("间隔重复");
    expect(image().dataset.theme).toBe("sakura");
    expect(image().dataset.mode).toBe("light");
  });

  it("没有标题时不显示标题开关；关掉署名后图里不再有 Tau", async () => {
    await render();
    expect(switchOf("署名")).toBeTruthy();
    expect([...document.querySelectorAll("label")].some(l => l.textContent === "标题")).toBe(false);
    expect(image().textContent).toContain("Tau");
    await act(async () => switchOf("署名").click());
    expect(image().textContent).not.toContain("Tau");
  });

  it("保存用标题命名，复制写入剪贴板", async () => {
    await render("间隔重复");
    await act(async () => button("保存图片").click());
    expect(mocks.capture).toHaveBeenCalledWith(image(), expect.objectContaining({ type: "png" }));
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), "间隔重复.png");

    await act(async () => button("复制").click());
    expect(mocks.clipboardWrite).toHaveBeenCalledTimes(1);
  });

  it("复用正在编辑的正文，后续变更同时进入预览与两种截图动作", async () => {
    const kit = createEditorKit({});
    mocks.kit = kit;
    const catalog = await desktopContentPlugins.prepareEditorContracts(kit.extensions);
    const baseline = await catalog.createDocument([
      { type: "paragraph", children: [{ type: "formatted", text: "卡片" }] },
    ]);
    const doc = await createNodeDocument(
      { documentId: crypto.randomUUID(), baselineId: crypto.randomUUID(), epoch: 0 },
      { title: "", content: baseline.content as ContentNode[], bannerBg: "", bannerPosition: "" },
      baseline.contracts
    );
    const tree = new NodeTree(doc);
    const paragraph = tree.read()[0].collabId;
    if (typeof paragraph !== "string") throw new Error("缺少段落身份");
    const awareness = new Awareness(doc);
    const unregister = registerContentBinding(
      7,
      {
        mode: "local",
        doc,
        awareness,
        origin: {},
        uploadResource: async () => "",
        resolveResource: async url => url,
      },
      true
    );
    const captures: string[] = [];
    mocks.capture.mockImplementation(async (element?: Element) => {
      captures.push(element?.querySelector("[data-slate-editor]")?.textContent ?? "");
      return new Blob(["png"], { type: "image/png" });
    });
    mocks.documentId = doc.guid;
    try {
      tree.insertText(paragraph, 2, "新内容", {});
      await act(async () => {
        root.render(
          <ContentDocumentImageExportModal
            open
            onClose={vi.fn()}
            source={{ contentId: 7, sourceType: "card", sourceId: 3 }}
          />
        );
      });
      await vi.waitFor(() => expect(image().textContent).toContain("卡片新内容"));
      await act(async () => button("保存图片").click());

      await act(async () => tree.insertText(paragraph, 5, "再次更新", {}));
      expect(image().textContent).toContain("卡片新内容再次更新");
      await act(async () => button("复制").click());
      expect(captures).toEqual(["卡片新内容", "卡片新内容再次更新"]);
      expect(mocks.download).toHaveBeenCalledTimes(1);
      expect(mocks.clipboardWrite).toHaveBeenCalledTimes(1);

      await act(async () =>
        root.render(<ContentDocumentImageExportModal open onClose={vi.fn()} />)
      );
      expect(button("保存图片").disabled).toBe(true);
      expect(button("复制").disabled).toBe(true);
    } finally {
      await act(async () => root.render(null));
      unregister();
      awareness.destroy();
      tree.dispose();
      doc.destroy();
      mocks.documentId = undefined;
      mocks.kit = undefined;
      mocks.capture.mockReset();
    }
  });
});
