import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EProjectItemType } from "@/types/project";
import InsertNoteToTreeModal from "..";

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
  getProjectItemsByIds: vi.fn(),
  getContentById: vi.fn(),
  recordLineage: vi.fn(),
}));

vi.mock("@/commands/project", () => ({
  getProjectList: commandMocks.getProjectList,
  addRootProjectItem: commandMocks.addRootProjectItem,
  addChildProjectItem: commandMocks.addChildProjectItem,
  createSharedProjectItemFromContent: commandMocks.createSharedProjectItemFromContent,
  getProjectItemsByIds: commandMocks.getProjectItemsByIds,
}));

vi.mock("@/commands/lineage", () => ({
  recordLineage: commandMocks.recordLineage,
}));

vi.mock("@/commands", () => ({
  getContentById: commandMocks.getContentById,
}));

vi.mock("@/electron", () => ({
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
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
    await new Promise(resolve => setTimeout(resolve, 0));
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
        archived: false,
        children: [],
        createTime: 1,
        updateTime: 1,
        desc: [],
        pinned: false,
      },
    ]);
    commandMocks.getProjectItemsByIds.mockResolvedValue([]);
    commandMocks.getContentById.mockResolvedValue({ content: [{ type: "paragraph" }] });
    commandMocks.addRootProjectItem.mockResolvedValue([
      { id: 1, title: "项目" },
      { id: 22, title: "渲染笔记" },
    ]);
  });

  it("复制模式按来源正文新建文档，并为来源记谱系 derived", async () => {
    const onSuccess = vi.fn();
    const { root, container } = await mount(
      <InsertNoteToTreeModal
        mode="project"
        open
        noteTitle="渲染笔记"
        noteContent={[]}
        sourceContentId={30}
        source={{ kind: "vl-note", id: 4 }}
        onCancel={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    await flush();
    await flush();

    const projectItem = Array.from(document.body.querySelectorAll("div"))
      .filter(node => node.textContent?.trim() === "项目")
      .at(-1);
    expect(projectItem).toBeTruthy();
    await act(async () => {
      (projectItem as HTMLElement | undefined)?.click();
    });
    await flush();
    await flush();
    expect(document.body.textContent).toContain("插入到根目录");

    const insertButton = Array.from(document.body.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "插入"
    ) as HTMLButtonElement | undefined;
    expect(insertButton?.disabled).toBe(false);
    await act(async () => {
      insertButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(commandMocks.getContentById).toHaveBeenCalledWith(30);
    expect(commandMocks.addRootProjectItem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: "渲染笔记",
        content: [{ type: "paragraph" }],
        refType: "",
        projectItemType: EProjectItemType.Document,
      })
    );
    expect(commandMocks.recordLineage).toHaveBeenCalledWith({
      src: { kind: "vl-note", id: 4 },
      dst: { kind: "project-item", id: 22 },
      relation: "derived",
    });
    // 新建的条目交还调用方（插件 project.insertDocument 据此返回引用）
    expect(onSuccess).toHaveBeenCalledWith({ id: 22, title: "渲染笔记" });

    await unmount(root, container);
  });
});
