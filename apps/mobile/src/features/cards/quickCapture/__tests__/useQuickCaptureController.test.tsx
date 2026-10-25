import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEditor, Transforms, type Descendant } from "slate";
import type { NodeTreeEditor } from "@tau/editor-collab";
import type { ContentDetailResponse } from "../../../../types";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import * as tauri from "../../../../services/tauri";
import useLocalContentDocument from "../../../../hooks/useLocalContentDocument";
import { useQuickCaptureController } from "../useQuickCaptureController";
import { readQuickCaptureDraft, writeQuickCaptureDraft } from "../../quickCaptureDraft";

vi.mock("../../../../services/tauri", () => ({
  createQuickCard: vi.fn(),
  getContentDetail: vi.fn(),
  updateContent: vi.fn(),
  deleteCard: vi.fn(),
  collabReadCache: vi.fn(),
  collabWriteCache: vi.fn(),
  collabNodeViews: vi.fn(),
}));
vi.mock("../../../../hooks/useLocalContentDocument", () => ({ default: vi.fn() }));
vi.mock("../../../../components/toast", () => ({ toast: { info: vi.fn() } }));

let root: Root;
let host: HTMLDivElement;
let controller: ReturnType<typeof useQuickCaptureController>;
let binding: Parameters<typeof useLocalContentDocument>[0];
let detail: ContentDetailResponse;
const error = vi.fn(),
  refresh = vi.fn(),
  flush = vi.fn();
const body = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];
const edited = (text: string): Descendant[] => {
  const content = structuredClone(detail.content);
  (content[0] as { children: { text: string }[] }).children[0].text = text;
  return content;
};

function Probe() {
  controller = useQuickCaptureController({ presentError: error, refreshCards: refresh });
  return null;
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  const contract = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  detail = {
    contentId: 2,
    documentId: "doc",
    librarySourceId: "library",
    revision: "r1",
    content: [
      { ...body("初稿")[0], collabId: "node", tauContract: contract.id },
    ] as unknown as Descendant[],
    contracts: { [contract.id]: contract.contract },
    count: 2,
    createTime: 1,
    updateTime: 1,
    card: null,
  };
  vi.mocked(tauri.createQuickCard).mockResolvedValue({
    id: 1,
    contentId: 2,
    content: detail.content,
  } as Awaited<ReturnType<typeof tauri.createQuickCard>>);
  vi.mocked(tauri.getContentDetail).mockResolvedValue(detail);
  vi.mocked(tauri.updateContent).mockImplementation(async input => ({
    ...detail,
    content: input.content as Descendant[],
    revision: "r2",
  }));
  vi.mocked(useLocalContentDocument).mockImplementation(options => {
    binding = options;
    return options.metadata
      ? { lineage: "doc", history: "external", initialValue: options.content, flush }
      : undefined;
  });
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

async function create() {
  await act(async () => {
    controller.onContentChange(body("初稿"));
    await vi.advanceTimersByTimeAsync(600);
  });
}

it("首次保存接回持久正文，续存沿用节点、契约与最新观察修订", async () => {
  await create();
  expect(binding.content).toEqual(detail.content);
  expect(binding.metadata).toEqual(detail);
  expect(controller.document).toBeDefined();
  await act(async () => {
    binding.onChange(edited("第二稿"), detail.contracts!);
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(tauri.updateContent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      content: edited("第二稿"),
      contracts: detail.contracts,
      expectedRevision: "r1",
      expectedDocumentId: "doc",
      expectedSourceId: "library",
    })
  );
  await act(async () => {
    binding.onChange(edited("第三稿"), detail.contracts!);
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(tauri.updateContent).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: "r2" })
  );
  expect(tauri.createQuickCard).toHaveBeenCalledTimes(1);
  expect(flush).toHaveBeenCalled();
});

it("创建回执和正文读取期间暂停临时编辑，读取失败后只重读而不重建卡片", async () => {
  let created!: (value: Awaited<ReturnType<typeof tauri.createQuickCard>>) => void;
  vi.mocked(tauri.createQuickCard).mockReturnValueOnce(
    new Promise(resolve => {
      created = resolve;
    })
  );
  vi.mocked(tauri.getContentDetail).mockRejectedValueOnce(new Error("read failed"));
  await create();
  expect(controller.readonly).toBe(true);
  await act(async () => {
    created({ id: 1, contentId: 2 } as Awaited<ReturnType<typeof tauri.createQuickCard>>);
  });
  expect(controller.readonly).toBe(true);
  expect(readQuickCaptureDraft()).toEqual(body("初稿"));
  await act(async () => {
    expect(await controller.requestClose()).toBe(true);
  });
  expect(tauri.createQuickCard).toHaveBeenCalledTimes(1);
  expect(tauri.getContentDetail).toHaveBeenCalledTimes(2);
});

it("保存失败保留草稿和修订，关闭重试仍走同一正文入口", async () => {
  await create();
  vi.mocked(tauri.updateContent).mockRejectedValueOnce(new Error("CONTENT_REVISION_CONFLICT"));
  await act(async () => {
    binding.onChange(edited("不能丢失"), detail.contracts!);
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(readQuickCaptureDraft()).toEqual(edited("不能丢失"));
  expect(error).toHaveBeenCalled();
  await act(async () => {
    expect(await controller.requestClose()).toBe(true);
  });
  expect(tauri.updateContent).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: "r1", content: edited("不能丢失") })
  );
  expect(tauri.createQuickCard).toHaveBeenCalledTimes(1);
});

it("晚到保存回执不清除更新的草稿，随后用新修订续存", async () => {
  await create();
  let saved!: (value: ContentDetailResponse) => void;
  vi.mocked(tauri.updateContent).mockReturnValueOnce(
    new Promise(resolve => {
      saved = resolve;
    })
  );
  await act(async () => {
    binding.onChange(edited("第二稿"), detail.contracts!);
    await vi.advanceTimersByTimeAsync(600);
    binding.onChange(edited("第三稿"), detail.contracts!);
  });
  vi.mocked(tauri.updateContent).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    saved({ ...detail, content: edited("第二稿"), revision: "r2" });
  });
  expect(readQuickCaptureDraft()).toEqual(edited("第三稿"));
  expect(tauri.updateContent).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: "r2", content: edited("第三稿") })
  );
});

it("本机正文冲刷失败阻止关闭，清空失败保留正文与草稿", async () => {
  await create();
  await act(async () => binding.onChange(edited("待保存"), detail.contracts!));
  flush.mockRejectedValueOnce(new Error("cache failed"));
  await act(async () => {
    expect(await controller.requestClose()).toBe(false);
  });
  expect(tauri.updateContent).not.toHaveBeenCalled();
  writeQuickCaptureDraft(edited("待保存"));
  vi.mocked(tauri.deleteCard).mockRejectedValueOnce(new Error("delete failed"));
  await act(async () => {
    expect(await controller.onClear()).toBe(false);
  });
  expect(binding.metadata?.documentId).toBe("doc");
  expect(readQuickCaptureDraft()).toEqual(edited("待保存"));
});

it("真实本机正文绑定续写和拆段时保留原身份，并为新段落绑定契约", async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  const actual = await vi.importActual<typeof import("../../../../hooks/useLocalContentDocument")>(
    "../../../../hooks/useLocalContentDocument"
  );
  vi.mocked(useLocalContentDocument).mockImplementation(actual.default);
  vi.mocked(tauri.collabReadCache).mockResolvedValue(null);
  vi.mocked(tauri.collabNodeViews).mockResolvedValue({});
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => controller.onContentChange(body("初稿")));
  for (let i = 0; i < 150 && !controller.document?.binding; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  expect(error).not.toHaveBeenCalled();
  const document = controller.document!;
  expect(document.binding).toBeDefined();
  const editor = document.binding!.install(createEditor()) as NodeTreeEditor;
  document.binding!.connect(editor);
  try {
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 2 });
      Transforms.insertText(editor, "续写");
      Transforms.splitNodes(editor, { always: true });
      editor.flushNodeTreeInputs();
      document.onChange?.(editor.children, editor);
    });
    for (let i = 0; i < 100 && !vi.mocked(tauri.updateContent).mock.calls.length; i++) {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    }
    expect(error).not.toHaveBeenCalled();
    const input = vi.mocked(tauri.updateContent).mock.calls[0][0];
    expect(input.content).toHaveLength(2);
    expect(input.content[0]).toMatchObject({ collabId: "node", children: [{ text: "初稿续写" }] });
    const added = input.content[1] as { collabId: string; tauContract: string };
    expect(added.collabId).not.toBe("node");
    expect(input.contracts?.[added.tauContract].type).toBe("paragraph");
    expect(input.expectedRevision).toBe("r1");
  } finally {
    document.binding!.disconnect(editor);
    editor.disposeNodeTree();
  }
});
