// 编辑页「⋯」菜单的「选择块」「整理结构」入口：卡片详情、文章编辑、项目文档三个 page 都提供，点击经 actionsRef 调用。
import { act, useImperativeHandle, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  enterBlockSelection: vi.fn(),
  openOutline: vi.fn(),
}));

vi.mock("../ContentDetailPage", () => ({
  ContentDetailPage: (props: {
    headerRight?: ReactNode;
    actionsRef?: Ref<{ enterBlockSelection: () => void; openOutline: () => void }>;
  }) => {
    useImperativeHandle(props.actionsRef, () => ({
      enterBlockSelection: harness.enterBlockSelection,
      openOutline: harness.openOutline,
    }));
    return <div data-testid="detail">{props.headerRight}</div>;
  },
}));

vi.mock("../../../components/PageHeader", () => ({
  PageHeaderButton: (props: { "aria-label"?: string; onClick?: () => void }) => (
    <button type="button" aria-label={props["aria-label"]} onClick={props.onClick} />
  ),
}));

vi.mock("../../../components/ActionSheet", () => {
  const ActionSheet = (props: {
    open: boolean;
    items?: Array<{ label: string; onClick: () => void }>;
  }) =>
    props.open ? (
      <div data-testid="action-sheet">
        {(props.items ?? []).map(item => (
          <button key={item.label} type="button" onClick={item.onClick}>
            {item.label}
          </button>
        ))}
      </div>
    ) : null;
  return { __esModule: true, ActionSheet, default: ActionSheet };
});

vi.mock("../../../components/MobileConfirmDialog", () => ({ MobileConfirmDialog: () => null }));
vi.mock("../../../components/BottomSheet", () => ({ BottomSheet: () => null }));
vi.mock("../CardLinksSheet", () => ({ default: () => null }));
vi.mock("../../articles/ArticleCover", () => ({ ArticleCover: () => null }));
vi.mock("../../diary/store/useDiaryStore", () => ({ useDiaryStore: { getState: () => ({}) } }));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({ presentError: vi.fn() }),
}));
vi.mock("../../../hooks/useRefSourceLabel", () => ({ useRefSourceLabel: () => "" }));
vi.mock("../../collaboration/useContentCollabEntry", () => ({
  useContentCollabEntry: () => ({
    collaboration: undefined,
    onCollaborationEnded: vi.fn(),
    menuItems: [],
    shareSheet: null,
  }),
}));
vi.mock("../../../services/tauri", () => ({
  getCardDetail: vi.fn(async (id: number) => ({
    id,
    contentId: 10,
    content: [],
    links: [],
    tags: [],
  })),
}));
vi.mock("../../articles/queries", () => ({
  useArticleQuery: () => ({
    data: { id: 1, contentId: 11, title: "文章", tags: [], isTop: false, content: [] },
  }),
  useArticleDelete: () => ({ mutate: vi.fn(), isPending: false }),
  useArticleToggleTop: () => ({ mutate: vi.fn() }),
  useInvalidateArticles: () => vi.fn(),
}));
vi.mock("../../projects/queries", () => ({
  useProjectItemsQuery: () => ({
    data: [{ id: 2, contentId: 12, title: "文档", tags: [], projects: [1] }],
  }),
  useProjectItemCreate: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectItemDelete: () => ({ mutate: vi.fn(), isPending: false }),
  useInvalidateProjects: () => vi.fn(),
}));
vi.mock("../../../router", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    usePage: () => ({ params: harness.params }),
    useNavigator: () => ({ push: vi.fn(), goBack: vi.fn(), popTo: vi.fn() }),
    usePageLifecycle: () => {},
  };
});

import contentDetailPage from "../pages/contentDetail.page";
import articleEditorPage from "../../articles/pages/articleEditor.page";
import projectDocEditorPage from "../../projects/pages/projectDocEditor.page";

const cases = [
  { name: "卡片详情", page: contentDetailPage, params: { cardId: 3 }, menuLabel: "卡片操作" },
  { name: "文章编辑", page: articleEditorPage, params: { articleId: 1 }, menuLabel: "文章操作" },
  { name: "项目文档", page: projectDocEditorPage, params: { itemId: 2 }, menuLabel: "节点操作" },
];

describe("编辑页「⋯ → 选择块 / 整理结构」入口", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.enterBlockSelection.mockClear();
    harness.openOutline.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  async function openMenu(page: (typeof cases)[number]["page"], menuLabel: string) {
    const Screen = page.component;
    await act(async () => {
      root.render(<Screen />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>(`button[aria-label="${menuLabel}"]`)?.click();
    });
  }

  const findItem = (label: string) =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-testid="action-sheet"] button')
    ).find(button => button.textContent === label);

  it.each(cases)(
    "$name：菜单出现「整理结构」，点击打开大纲",
    async ({ page, params, menuLabel }) => {
      harness.params = params;
      await openMenu(page, menuLabel);
      const item = findItem("整理结构");
      expect(item).toBeDefined();
      await act(async () => {
        item?.click();
      });
      expect(harness.openOutline).toHaveBeenCalledTimes(1);
    }
  );

  it.each(cases)(
    "$name：菜单出现「选择块」，点击进入块选择",
    async ({ page, params, menuLabel }) => {
      harness.params = params;
      const Screen = page.component;
      await act(async () => {
        root.render(<Screen />);
      });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        document.querySelector<HTMLButtonElement>(`button[aria-label="${menuLabel}"]`)?.click();
      });
      const item = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-testid="action-sheet"] button')
      ).find(button => button.textContent === "选择块");
      expect(item).toBeDefined();
      await act(async () => {
        item?.click();
      });
      expect(harness.enterBlockSelection).toHaveBeenCalledTimes(1);
    }
  );
});
