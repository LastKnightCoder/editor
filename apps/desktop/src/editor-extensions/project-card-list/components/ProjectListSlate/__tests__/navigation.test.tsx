import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageProvider, usePage } from "@/page/PageProvider";
import { PageNavigationBridge } from "@/app/PageNavigationBridge";
import { definePage } from "@/page/definePage";
import { createPageSchema, paramNumber, paramOptional } from "@/page/core/paramsSchema";
import ProjectListSlate from "..";

vi.mock("@/services/aiServer", () => ({ initAiServer: vi.fn(), closeAiServer: vi.fn() }));
vi.mock("@/commands/project", () => ({ getProjectItemById: async () => ({ projects: [7] }) }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "test" } } }) },
}));

// 宿主组件只验证自身逻辑，不渲染真实编辑器，kit 也不必真实构造
vi.mock("@/services/editorKit", () => ({
  createDesktopKit: () => ({}),
  getContentKit: () => ({}),
  getDescriptionKit: () => ({}),
  getMarkdownFileKit: () => ({}),
  getSkillFileKit: () => ({}),
  getFlashcardKit: () => ({}),
  getArrowLabelKit: () => ({}),
}));
vi.mock("@tau/editor", () => ({ AddParagraph: () => null }));
vi.mock("@/commands", () => ({
  getProjectItemById: async () => ({ children: [11, 12] }),
  getProjectItemsByIds: async () => [
    { id: 11, title: "子文档一", content: [{ type: "paragraph", children: [{ text: "摘要一" }] }] },
    { id: 12, title: "子文档二", content: [{ type: "paragraph", children: [{ text: "摘要二" }] }] },
  ],
}));
vi.mock("@/utils", () => ({
  getEditorText: (content: { children: { text: string }[] }[]) => content[0].children[0].text,
}));
vi.mock("@/hooks/useTheme.ts", () => ({ default: () => ({ isDark: false }) }));
vi.mock("@/hooks/useProjectWebLinkMeta", () => ({
  default: (item: { title: string }) => ({ title: item.title }),
}));

const schema = createPageSchema({ id: paramNumber(), itemId: paramOptional(paramNumber()) });
definePage({
  key: "project-detail",
  match: "params",
  getId: params => `project-${params.id}`,
  label: "项目详情",
  params: schema.schema,
  component: () => null,
});

function NavigationProbe() {
  const { state } = usePage();
  return <output>{JSON.stringify(state.back.map(entry => entry.params))}</output>;
}

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
});

describe("项目文档列表卡片导航", () => {
  it("点击标题、摘要及卡片空白处均更新当前项目文档，重复点击不增加页面", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <PageProvider initialKey="project-detail" initialParams={{ id: 7, itemId: 10 }}>
          <PageNavigationBridge />
          <ProjectListSlate
            element={{
              type: "project-card-list",
              projectItemId: 10,
              children: [{ type: "formatted", text: "" }],
            }}
            attributes={{ "data-slate-node": "element", ref: null }}
          >
            <span />
          </ProjectListSlate>
          <NavigationProbe />
        </PageProvider>
      );
    });

    const cards = container.querySelectorAll('[contenteditable="false"]');
    expect(cards.length).toBe(2);
    expect([...cards].map(card => card.textContent)).toEqual(["子文档一摘要一", "子文档二摘要二"]);
    for (const [target, itemId] of [
      [cards[0].firstElementChild!, 11],
      [cards[1].lastElementChild!, 12],
      [cards[1], 12],
    ] as const) {
      await act(async () => {
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(JSON.parse(container.querySelector("output")!.textContent!)).toEqual([
        { id: 7, itemId },
      ]);
    }
  });
});
