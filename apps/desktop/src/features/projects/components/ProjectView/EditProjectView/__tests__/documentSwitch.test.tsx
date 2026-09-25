import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EProjectItemType, type ProjectItem } from "@/types";
import { ProjectContext } from "../../ProjectContext";
import EditProjectView from "..";

const { loadItem } = vi.hoisted(() => ({ loadItem: vi.fn() }));
vi.mock("@/commands", () => ({ getProjectItemById: loadItem }));
vi.mock("@tau/ui", () => ({ toast: { error: vi.fn() } }));
vi.mock("../../EditProjectItem", () => ({
  default: ({ projectItemId }: { projectItemId: number }) => <div>文档 {projectItemId}</div>,
}));
vi.mock("../../VideoNoteView", () => ({ default: () => null }));
vi.mock("../../AudioNoteView", () => ({ default: () => null }));
vi.mock("../../WhiteBoardProjectItemView", () => ({ default: () => null }));
vi.mock("../../WebViewProjectItemView", () => ({ default: () => null }));
vi.mock("../../TableProjectItemView", () => ({ default: () => null }));
vi.mock("../../PdfProjectItemView", () => ({ default: () => null }));

describe("项目文档切换", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    vi.clearAllMocks();
  });

  it("切换到菜单目标文档后，忽略旧文档的迟到响应", async () => {
    const pending = new Map<number, (item: ProjectItem) => void>();
    loadItem.mockImplementation(
      (id: number) =>
        new Promise<ProjectItem>(resolve => {
          pending.set(id, resolve);
        })
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    cleanup = () => {
      act(() => root.unmount());
      container.remove();
    };
    const render = (itemId: number) =>
      act(() =>
        root.render(
          <ProjectContext.Provider value={{ projectId: 1, itemId }}>
            <EditProjectView />
          </ProjectContext.Provider>
        )
      );
    const resolveItem = async (id: number) =>
      act(async () => {
        pending.get(id)?.({ id, projectItemType: EProjectItemType.Document } as ProjectItem);
      });

    render(10);
    render(20);
    await resolveItem(20);
    expect(container.textContent).toBe("文档 20");
    await resolveItem(10);
    expect(container.textContent).toBe("文档 20");
  });
});
