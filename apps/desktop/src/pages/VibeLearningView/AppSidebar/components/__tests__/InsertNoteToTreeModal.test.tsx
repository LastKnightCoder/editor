import { App } from "antd";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EProjectItemType, EProjectType } from "@/types/project";
import InsertNoteToTreeModal from "../InsertNoteToTreeModal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const commandMocks = vi.hoisted(() => ({
  getProjectList: vi.fn(),
  addRootProjectItem: vi.fn(),
  addChildProjectItem: vi.fn(),
  createSharedProjectItemFromContent: vi.fn(),
  getAllDocuments: vi.fn(),
  addRootDocumentItem: vi.fn(),
  addChildDocumentItem: vi.fn(),
  createSharedDocumentItemFromContent: vi.fn(),
  createWebLink: vi.fn(),
  createEmptyVideoNote: vi.fn(),
  getProjectItemsByIds: vi.fn(),
  getDocumentItemsByIds: vi.fn(),
  getContentById: vi.fn(),
}));

vi.mock("@/commands/project", () => ({
  getProjectList: commandMocks.getProjectList,
  addRootProjectItem: commandMocks.addRootProjectItem,
  addChildProjectItem: commandMocks.addChildProjectItem,
  createSharedProjectItemFromContent:
    commandMocks.createSharedProjectItemFromContent,
  getProjectItemsByIds: commandMocks.getProjectItemsByIds,
}));

vi.mock("@/commands/document", () => ({
  getAllDocuments: commandMocks.getAllDocuments,
  addRootDocumentItem: commandMocks.addRootDocumentItem,
  addChildDocumentItem: commandMocks.addChildDocumentItem,
  createSharedDocumentItemFromContent:
    commandMocks.createSharedDocumentItemFromContent,
  getDocumentItemsByIds: commandMocks.getDocumentItemsByIds,
}));

vi.mock("@/commands/web-link", () => ({
  createWebLink: commandMocks.createWebLink,
}));

vi.mock("@/commands/video-notes", () => ({
  createEmptyVideoNote: commandMocks.createEmptyVideoNote,
}));

vi.mock("@/commands", () => ({
  getContentById: commandMocks.getContentById,
}));

vi.mock("@/electron", () => ({
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App>{node}</App>);
  });

  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("InsertNoteToTreeModal", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    commandMocks.getProjectList.mockResolvedValue([
      {
        id: 1,
        title: "项目",
        projectType: EProjectType.DocumentTree,
        archived: false,
        children: [],
        createTime: 1,
        updateTime: 1,
        desc: [],
        pinned: false,
      },
    ]);
    commandMocks.getAllDocuments.mockResolvedValue([]);
    commandMocks.getProjectItemsByIds.mockResolvedValue([]);
    commandMocks.getDocumentItemsByIds.mockResolvedValue([]);
    commandMocks.createEmptyVideoNote.mockResolvedValue({
      id: 9,
      createTime: 1,
      updateTime: 1,
      metaInfo: { type: "bilibili", bvid: "BV1abc", cid: "123", quality: 80 },
    });
    commandMocks.addRootProjectItem.mockResolvedValue([
      { id: 1, title: "项目" },
      { id: 22, title: "视频标题" },
    ]);
  });

  it("视频笔记模式应创建 video-note 项目项", async () => {
    const onSuccess = vi.fn();
    const metaInfo = {
      type: "bilibili" as const,
      bvid: "BV1abc",
      cid: "123",
      quality: 80,
    };

    const { root, container } = await mount(
      <InsertNoteToTreeModal
        mode="project"
        open
        noteTitle="视频标题"
        noteContent={[]}
        insertMode="video-note"
        videoNotePayload={{
          title: "视频标题",
          metaInfo,
        }}
        onCancel={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await flush();
    await flush();

    const projectItem = Array.from(document.body.querySelectorAll("div"))
      .filter((node) => node.textContent?.trim() === "项目")
      .at(-1);
    expect(projectItem).toBeTruthy();
    await act(async () => {
      (projectItem as HTMLElement | undefined)?.click();
    });
    await flush();
    await flush();
    expect(document.body.textContent).toContain("添加到根目录");

    const addButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "添加",
    ) as HTMLButtonElement | undefined;
    expect(addButton).toBeTruthy();
    expect(addButton?.disabled).toBe(false);
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(commandMocks.createEmptyVideoNote).toHaveBeenCalledWith(metaInfo);
    expect(commandMocks.addRootProjectItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: "视频标题",
        refType: "video-note",
        refId: 9,
        projectItemType: EProjectItemType.VideoNote,
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith({ id: 22, title: "视频标题" });

    await unmount(root, container);
  });
});
