import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { useEditContent } from "../useEditContent";
import * as tauri from "../../services/tauri";

vi.mock("../../services/tauri", () => ({
  getContentDetail: vi.fn(),
  updateContent: vi.fn(),
}));

type HookSnapshot = ReturnType<typeof useEditContent>;

function createContent(text: string): Descendant[] {
  return [
    {
      type: "paragraph",
      children: [{ type: "formatted", text }],
    } as Descendant,
  ];
}

function createDetail(contentId: number, content: Descendant[]) {
  return {
    contentId,
    createTime: 1_735_000_000_000,
    updateTime: 1_736_000_000_000,
    content,
    count: textFromContent(content).length,
    card: null,
  };
}

function textFromContent(content: Descendant[]): string {
  const first = content[0] as {
    children?: Array<{ text?: string }>;
  };
  return first?.children?.[0]?.text ?? "";
}

function HookHarness(props: {
  contentId: number;
  onContentSync?: (content: Descendant[]) => void;
  onSnapshot: (snapshot: HookSnapshot) => void;
}) {
  const snapshot = useEditContent(props.contentId, {
    wait: 1,
    onContentSync: props.onContentSync,
  });
  props.onSnapshot(snapshot);
  return null;
}

type HookController = {
  setOnContentSync: (handler?: (content: Descendant[]) => void) => void;
  render: (contentId: number) => Promise<void>;
  latest: () => HookSnapshot | null;
  cleanup: () => Promise<void>;
};

function createHookController(): HookController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let latestSnapshot: HookSnapshot | null = null;
  let contentSyncHandler: ((content: Descendant[]) => void) | undefined;

  return {
    setOnContentSync: (handler) => {
      contentSyncHandler = handler;
    },
    render: async (contentId) => {
      await act(async () => {
        root.render(
          <HookHarness
            contentId={contentId}
            onContentSync={contentSyncHandler}
            onSnapshot={(snapshot) => {
              latestSnapshot = snapshot;
            }}
          />,
        );
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    latest: () => latestSnapshot,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("useEditContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("应在初始化时加载 content 详情", async () => {
    const initial = createContent("初始化内容");
    vi.mocked(tauri.getContentDetail).mockResolvedValue(
      createDetail(101, initial),
    );

    const controller = createHookController();
    await controller.render(101);

    expect(tauri.getContentDetail).toHaveBeenCalledWith(101);
    expect(textFromContent(controller.latest()?.content ?? [])).toBe(
      "初始化内容",
    );

    await controller.cleanup();
  });

  it("同 contentId 的实例应通过总线同步更新", async () => {
    const initial = createContent("old");
    const updated = createContent("new");
    vi.mocked(tauri.getContentDetail).mockResolvedValue(
      createDetail(202, initial),
    );
    vi.mocked(tauri.updateContent).mockResolvedValue(
      createDetail(202, updated),
    );

    const editorA = createHookController();
    const editorB = createHookController();
    await editorA.render(202);
    await editorB.render(202);

    await act(async () => {
      editorA.latest()?.handleEditorContentChange(updated);
      await editorA.latest()?.flushNow();
      await Promise.resolve();
    });

    expect(tauri.updateContent).toHaveBeenCalledTimes(1);
    expect(textFromContent(editorB.latest()?.content ?? [])).toBe("new");

    await editorA.cleanup();
    await editorB.cleanup();
  });

  it("保存失败后可通过 retryLastFailed 重试成功", async () => {
    const initial = createContent("before");
    const updated = createContent("after");
    vi.mocked(tauri.getContentDetail).mockResolvedValue(
      createDetail(303, initial),
    );
    vi.mocked(tauri.updateContent)
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(createDetail(303, updated));

    const controller = createHookController();
    await controller.render(303);

    await act(async () => {
      controller.latest()?.handleEditorContentChange(updated);
      await controller.latest()?.flushNow();
      await Promise.resolve();
    });
    expect(controller.latest()?.error).toContain("自动保存失败");

    await act(async () => {
      const ok = await controller.latest()?.retryLastFailed();
      expect(ok).toBe(true);
      await Promise.resolve();
    });

    expect(tauri.updateContent).toHaveBeenCalledTimes(2);
    expect(controller.latest()?.error).toBe("");

    await controller.cleanup();
  });

  it("同 contentId 的内容变化时应触发 onContentSync 回调", async () => {
    const initial = createContent("first");
    const updated = createContent("second");
    const onContentSync = vi.fn();
    vi.mocked(tauri.getContentDetail).mockResolvedValue(
      createDetail(901, initial),
    );
    vi.mocked(tauri.updateContent).mockResolvedValue(
      createDetail(901, updated),
    );

    const editorA = createHookController();
    const controller = createHookController();
    controller.setOnContentSync(onContentSync);
    await editorA.render(901);
    await controller.render(901);

    await act(async () => {
      editorA.latest()?.handleEditorContentChange(updated);
      await editorA.latest()?.flushNow();
      await Promise.resolve();
    });

    const calls = onContentSync.mock.calls as [Descendant[]][];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(textFromContent(calls[0][0])).toBe("first");
    expect(textFromContent(calls[calls.length - 1][0])).toBe("second");

    await editorA.cleanup();
    await controller.cleanup();
  });
});
