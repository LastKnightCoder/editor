import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EProjectItemType, type Project, type ProjectItem } from "@/types";
import { defaultProjectItemEventBus } from "@/utils/event-bus";
import { getProjectItemsByIds } from "@/commands";

vi.mock("@/commands", () => ({ getProjectItemsByIds: vi.fn() }));

import { useProjectTreeData } from "../useProjectTreeData";

/* 结构：project(7) ─ 1 ─ 11 */
const project: Project = {
  id: 7,
  title: "项目",
  children: [1],
  createTime: 1,
  updateTime: 1,
  desc: [],
  archived: false,
  pinned: false,
};

const makeItem = (id: number, children: number[] = [], title = `条目 ${id}`): ProjectItem => ({
  id,
  title,
  children,
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
});

type TreeDataHook = ReturnType<typeof useProjectTreeData>;

const setup = () => {
  let latest: TreeDataHook | undefined;
  let queryClient: QueryClient | undefined;
  const Harness = ({ project }: { project: Project | null }) => {
    latest = useProjectTreeData(project);
    return null;
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (project: Project | null) => {
    act(() => {
      if (!queryClient)
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness project={project} />
        </QueryClientProvider>
      );
    });
  };
  const teardown = () => {
    act(() => root.unmount());
    container.remove();
    queryClient?.clear();
  };
  return { render, read: () => latest as TreeDataHook, teardown };
};

beforeEach(() => {
  vi.mocked(getProjectItemsByIds).mockImplementation(async ids => {
    const all = [makeItem(1, [11]), makeItem(11)];
    return all.filter(item => ids.includes(item.id));
  });
});

afterEach(() => {
  defaultProjectItemEventBus.clear();
  vi.clearAllMocks();
});

describe("useProjectTreeData（react-query 收编）", () => {
  it("初次加载按 children 构建 itemMap 与节点树", async () => {
    const { render, read, teardown } = setup();
    render(project);
    await waitForCondition(() => read().treeData.itemMap.size === 2);
    expect(read().treeData.itemNodeMap.get(11)?.[0].item.title).toBe("条目 11");
    teardown();
  });

  it("其他编辑器发布条目更新时就地并入缓存，未知条目忽略", async () => {
    const { render, read, teardown } = setup();
    render(project);
    await waitForCondition(() => read().treeData.itemMap.size === 2);

    act(() => {
      defaultProjectItemEventBus
        .createEditor()
        .publishProjectItemEvent("project-item:updated", makeItem(11, [], "新标题"));
      defaultProjectItemEventBus
        .createEditor()
        .publishProjectItemEvent("project-item:updated", makeItem(999, [], "未知条目"));
    });
    await waitForCondition(() => read().treeData.itemMap.get(11)?.title === "新标题");
    expect(read().treeData.itemMap.has(999)).toBe(false);
    teardown();
  });

  it("children 指纹变化（增删子项后 detail 刷新）自动重拉树，内容不变不重拉", async () => {
    const { render, read, teardown } = setup();
    render(project);
    await waitForCondition(() => read().treeData.itemMap.size === 2);

    vi.mocked(getProjectItemsByIds).mockImplementation(async ids => {
      const all = [makeItem(1, [11, 12]), makeItem(11), makeItem(12)];
      return all.filter(item => ids.includes(item.id));
    });
    render({ ...project });
    await waitMs(20);
    expect(read().treeData.itemMap.has(12)).toBe(false);

    render({ ...project, children: [1, 12] });
    await waitForCondition(() => read().treeData.itemMap.has(12));
    teardown();
  });
});

/* act 内的 setState 需出到 act 外轮询（项目无 @testing-library，按既有测试惯例手写） */
async function waitForCondition(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitForCondition 超时");
    }
    await waitMs(10);
  }
}

const waitMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
