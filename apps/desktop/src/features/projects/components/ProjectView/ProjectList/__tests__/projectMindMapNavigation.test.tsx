import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EProjectItemType, EProjectType, type Project, type ProjectItem } from "@/types";
import type { MindMapNodeData } from "@/components/MindMap/types";
import { buildProjectTreeData } from "@/utils/projectTree";
import ProjectMindMapView from "../ProjectMindMapView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/page/PageProvider", () => ({ usePage: () => ({ navigator: { push } }) }));
vi.mock("react-dnd", () => ({ useDrop: () => [{}, vi.fn()], useDrag: vi.fn() }));
vi.mock("@/commands", () => ({ updateProjectItem: vi.fn() }));
vi.mock("@/utils", () => ({
  defaultProjectItemEventBus: { createEditor: () => ({}) },
}));
vi.mock("../useProjectTreeOperations", () => ({
  useProjectTreeOperations: () => ({ moveProjectItem: vi.fn() }),
}));
vi.mock("../ProjectItem/useProjectItemMoreActions", () => ({ default: vi.fn() }));
vi.mock("@/components/EditText", () => ({ default: () => null }));
vi.mock("@/components/MindMap", () => ({
  default: ({
    data,
    onNodeClick,
  }: {
    data: MindMapNodeData;
    onNodeClick: (id: string) => void;
  }) => {
    const renderNode = (node: MindMapNodeData) => (
      <div key={node.id}>
        <button data-node-id={node.id} onClick={() => onNodeClick(node.id)}>
          {node.id}
        </button>
        {node.children?.map(renderNode)}
      </div>
    );
    return renderNode(data);
  },
}));

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  vi.clearAllMocks();
});

describe("思维导图文档树导航", () => {
  it("顶层及嵌套文档使用条目 ID 打开，根节点返回项目概览", async () => {
    const project: Project = {
      id: 7,
      title: "学习项目",
      children: [11],
      createTime: 1,
      updateTime: 1,
      desc: [],
      archived: false,
      pinned: false,
      projectType: EProjectType.DocumentTree,
    };
    const items: ProjectItem[] = [11, 12].map(id => ({
      id,
      title: `文档 ${id}`,
      children: id === 11 ? [12] : [],
      createTime: 1,
      updateTime: 1,
      content: [],
      parents: [],
      projects: [7],
      refType: "",
      refId: 0,
      projectItemType: EProjectItemType.Document,
      count: 0,
      contentId: id,
      whiteBoardContentId: 0,
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ProjectMindMapView
          project={project}
          treeData={buildProjectTreeData(project, new Map(items.map(item => [item.id, item])))}
          databaseName="test"
          cards={[]}
          whiteBoards={[]}
          pdfs={[]}
          addMenuItems={[]}
          onAddMenuClick={vi.fn()}
          refreshProject={vi.fn()}
          reloadTree={vi.fn()}
        />
      );
    });
    for (const [nodeId, params] of [
      ["project-item:11@0", { id: 7, itemId: 11 }],
      ["project-item:12@0.0", { id: 7, itemId: 12 }],
      ["project:7", { id: 7 }],
    ] as const) {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(`[data-node-id="${nodeId}"]`)!.click();
      });
      expect(push).toHaveBeenLastCalledWith("project-detail", params);
    }
    expect(push).toHaveBeenCalledTimes(3);
  });
});
