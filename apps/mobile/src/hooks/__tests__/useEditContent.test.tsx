import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { useEditContent } from "../useEditContent";
import * as tauri from "../../services/tauri";

vi.mock("../../services/tauri", () => ({
  getContentDetail: vi.fn(),
  updateContent: vi.fn(),
  collabProjectContent: vi.fn(),
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
  onProjectionPersisted?: () => void;
  saveMode?: "direct" | "collabProjection" | false;
  onSnapshot: (snapshot: HookSnapshot) => void;
}) {
  const snapshot = useEditContent(props.contentId, {
    wait: 1,
    onContentSync: props.onContentSync,
    saveMode: props.saveMode,
    onProjectionPersisted: props.onProjectionPersisted,
  });
  props.onSnapshot(snapshot);
  return null;
}

type HookController = {
  setOnContentSync: (handler?: (content: Descendant[]) => void) => void;
  render: (contentId: number) => Promise<void>;
  rerender: (props: {
    saveMode?: "direct" | "collabProjection" | false;
    onProjectionPersisted?: () => void;
  }) => Promise<void>;
  latest: () => HookSnapshot | null;
  cleanup: () => Promise<void>;
};

function createHookController(): HookController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let latestSnapshot: HookSnapshot | null = null;
  let contentSyncHandler: ((content: Descendant[]) => void) | undefined;
  let extraProps: {
    saveMode?: "direct" | "collabProjection" | false;
    onProjectionPersisted?: () => void;
  } = {};
  let renderedContentId = 0;

  const paint = () =>
    act(async () => {
      root.render(
        <HookHarness
          contentId={renderedContentId}
          onContentSync={contentSyncHandler}
          onSnapshot={(snapshot) => {
            latestSnapshot = snapshot;
          }}
          {...extraProps}
        />,
      );
    });

  return {
    setOnContentSync: (handler) => {
      contentSyncHandler = handler;
    },
    render: async (contentId) => {
      renderedContentId = contentId;
      await paint();
      await act(async () => {
        await Promise.resolve();
      });
    },
    rerender: async (props) => {
      extraProps = props;
      await paint();
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

  it("saveMode=collabProjection：投影写入成功时不走直写并标记待裁决", async () => {
    const initial = createContent("before");
    const updated = createContent("after");
    const onProjectionPersisted = vi.fn();
    vi.mocked(tauri.getContentDetail).mockResolvedValue(createDetail(401, initial));
    vi.mocked(tauri.collabProjectContent).mockResolvedValue({ projected: true, changed: true });

    const controller = createHookController();
    await controller.render(401);
    await controller.rerender({ saveMode: "collabProjection", onProjectionPersisted });

    await act(async () => {
      controller.latest()?.handleEditorContentChange(updated);
      await controller.latest()?.flushNow();
      await Promise.resolve();
    });

    expect(tauri.collabProjectContent).toHaveBeenCalledTimes(1);
    expect(tauri.updateContent).not.toHaveBeenCalled();
    expect(onProjectionPersisted).toHaveBeenCalledTimes(1);
    expect(controller.latest()?.error).toBe("");

    await controller.cleanup();
  });

  it("saveMode=collabProjection：投影漂移（reason=drift）时回退常规直写", async () => {
    const initial = createContent("before");
    const updated = createContent("after");
    const onProjectionPersisted = vi.fn();
    vi.mocked(tauri.getContentDetail).mockResolvedValue(createDetail(402, initial));
    vi.mocked(tauri.collabProjectContent).mockResolvedValue({ projected: false, reason: "drift" });
    vi.mocked(tauri.updateContent).mockResolvedValue(createDetail(402, updated));

    const controller = createHookController();
    await controller.render(402);
    await controller.rerender({ saveMode: "collabProjection", onProjectionPersisted });

    await act(async () => {
      controller.latest()?.handleEditorContentChange(updated);
      await controller.latest()?.flushNow();
      await Promise.resolve();
    });

    // drift＝绑定已自动解绑且本次未写库：必须由直写接管，否则改动静默丢失
    expect(tauri.collabProjectContent).toHaveBeenCalledTimes(1);
    expect(tauri.updateContent).toHaveBeenCalledTimes(1);
    expect(onProjectionPersisted).not.toHaveBeenCalled();
    expect(controller.latest()?.error).toBe("");

    await controller.cleanup();
  });

  it("direct 模式：直写被协作守卫拒绝后转投影，兜底仍未写入则按保存失败处理", async () => {
    const initial = createContent("before");
    const updated = createContent("after");
    const onProjectionPersisted = vi.fn();
    vi.mocked(tauri.getContentDetail).mockResolvedValue(createDetail(403, initial));
    vi.mocked(tauri.updateContent).mockRejectedValue(
      "COLLABORATION_WRITE_REQUIRED: 这段内容正在协作"
    );
    // 第一次兜底写入成功，第二次（重试前）仍未写入（极端竞态），第三次重试成功
    vi.mocked(tauri.collabProjectContent)
      .mockResolvedValueOnce({ projected: true, changed: true })
      .mockResolvedValueOnce({ projected: false, reason: "unbound" })
      .mockResolvedValue({ projected: true, changed: true });

    const controller = createHookController();
    await controller.render(403);
    await controller.rerender({ onProjectionPersisted });

    await act(async () => {
      controller.latest()?.handleEditorContentChange(updated);
      await controller.latest()?.flushNow();
      await Promise.resolve();
    });
    expect(onProjectionPersisted).toHaveBeenCalledTimes(1);

    await act(async () => {
      controller.latest()?.handleEditorContentChange(createContent("again"));
      await controller.latest()?.flushNow();
      await Promise.resolve();
    });
    // 兜底投影未写入却假装成功＝静默丢改动：必须报保存失败（守卫错误可见）并保留重试凭据
    expect(controller.latest()?.error).toContain("内容协作中");
    const ok = await controller.latest()?.retryLastFailed();
    expect(ok).toBe(true);

    await controller.cleanup();
  });

  it("saveMode=false：不触发任何写通道（云端 Y.Doc 为唯一写者）", async () => {
    const initial = createContent("before");
    vi.mocked(tauri.getContentDetail).mockResolvedValue(createDetail(404, initial));

    const controller = createHookController();
    await controller.render(404);
    await controller.rerender({ saveMode: false });

    await act(async () => {
      controller.latest()?.handleEditorContentChange(createContent("ignored"));
      const ok = await controller.latest()?.flushNow();
      expect(ok).toBe(true);
      await Promise.resolve();
    });

    expect(tauri.updateContent).not.toHaveBeenCalled();
    expect(tauri.collabProjectContent).not.toHaveBeenCalled();

    await controller.cleanup();
  });
});
