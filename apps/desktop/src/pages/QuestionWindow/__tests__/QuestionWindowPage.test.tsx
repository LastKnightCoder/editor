import { App } from "antd";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import type { IQuestion } from "@/types/question";

import QuestionWindowPage from "../index";

const createParagraph = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];

const extractNodeText = (node: Descendant) => {
  if (!("children" in node)) {
    return "";
  }

  return node.children.map(child => ("text" in child ? child.text : "")).join("");
};

const extractText = (nodes?: Descendant[]) => {
  if (!nodes?.length) return "";
  return nodes.map(extractNodeText).join("\n");
};

const editorTextToDescendants = (text: string): Descendant[] => createParagraph(text);

const {
  createQuestionMock,
  loadItemsMock,
  loadGroupStatsMock,
  loadGroupsMock,
  questionStoreState,
} = vi.hoisted(() => {
  const createQuestionMock = vi.fn(async () => ({
    id: 1,
    createTime: Date.now(),
    updateTime: Date.now(),
    questionContent: "新问题",
    description: createParagraph("第一次描述"),
    answers: [],
    groupId: 1,
    sortIndex: 0,
    status: "not_started" as const,
  }));

  const loadItemsMock = vi.fn(async () => undefined);
  const loadGroupStatsMock = vi.fn(async () => undefined);
  const loadGroupsMock = vi.fn(async () => undefined);

  const questionStoreState = {
    groups: [{ id: 1, title: "默认分组", isDefault: true }],
    groupStats: { 1: { total: 0, answered: 0, unanswered: 0 } },
    activeGroupId: 1,
    createGroup: vi.fn(async () => undefined),
    updateGroup: vi.fn(async () => undefined),
    deleteGroup: vi.fn(async () => undefined),
    filter: "all" as const,
    setFilter: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    itemsByGroup: { 1: [] as IQuestion[] },
    loadGroups: loadGroupsMock,
    loadGroupStats: loadGroupStatsMock,
    loadItems: loadItemsMock,
    createQuestion: createQuestionMock,
    updateQuestion: vi.fn(async () => undefined),
    deleteQuestion: vi.fn(async () => undefined),
    addAnswerSelect: vi.fn(async () => undefined),
    moveToGroup: vi.fn(async () => undefined),
  };

  return {
    createQuestionMock,
    loadItemsMock,
    loadGroupStatsMock,
    loadGroupsMock,
    questionStoreState,
  };
});

vi.mock("@/hooks/useDatabaseChangeEffect", () => ({
  useDatabaseChangeEffect: () => undefined,
}));

vi.mock("@/stores/useDynamicExtensionsStore", () => ({
  default: (selector: (state: { extensions: [] }) => unknown) => selector({ extensions: [] }),
}));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    textClass: "text-gray-800",
    borderClass: "border-gray-200",
    hoverClass: "hover:bg-gray-100",
    buttonBg: "bg-blue-500",
    buttonTextClass: "text-white",
  }),
}));

vi.mock("@/mcp/question/events", () => ({
  subscribeQuestionMutationEvent: vi.fn(() => () => undefined),
}));

vi.mock("@/utils/answer-content", () => ({
  getAnswerContentStatus: vi.fn(async (contentId: number) => ({
    contentId,
    isCard: false,
    isArticle: false,
    projectMountCount: 0,
  })),
}));

vi.mock("@/commands", () => ({
  getQuestionAnswers: vi.fn(async () => []),
}));

vi.mock("@/stores/useQuestionStore", () => {
  const useQuestionStore = (selector?: (state: typeof questionStoreState) => unknown) =>
    selector ? selector(questionStoreState) : questionStoreState;
  useQuestionStore.getState = () => ({
    ...questionStoreState,
    reorderQuestions: vi.fn(async () => undefined),
    deleteAnswer: vi.fn(async () => undefined),
    updateQuestionStatus: vi.fn(async () => undefined),
  });
  return { useQuestionStore };
});

vi.mock("@/components/DndProvider", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../components/QuestionSidebar", () => ({
  default: () => <div data-testid="question-sidebar" />,
}));

vi.mock("../components/QuestionList", () => ({
  default: ({
    questions,
    onViewDetails,
  }: {
    questions: Array<{ id: number; questionContent: string }>;
    onViewDetails: (id: number) => void;
  }) => (
    <div data-testid="question-list">
      {questions.map(question => (
        <button key={question.id} type="button" onClick={() => onViewDetails(question.id)}>
          查看详情：{question.questionContent}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../components/Toolbar", () => ({
  default: ({ onCreateQuestion }: { onCreateQuestion: () => void }) => (
    <button type="button" onClick={onCreateQuestion}>
      新建问题
    </button>
  ),
}));

vi.mock("@/components/NewAnswerModal", () => ({
  default: () => null,
}));

vi.mock("@/components/ContentSelectorModal", () => ({
  default: () => null,
}));

vi.mock("@/components/AnswerModal", () => ({
  default: () => null,
}));

vi.mock("@/components/CustomModal", () => ({
  default: function CustomModalMock({
    open,
    children,
    footer,
  }: {
    open: boolean;
    children: ReactNode;
    footer?: ReactNode;
  }) {
    const hasOpenedRef = useRef(open);

    if (open) {
      hasOpenedRef.current = true;
    }

    if (!open && !hasOpenedRef.current) {
      return null;
    }

    return (
      <div data-testid="custom-modal" data-open={open ? "true" : "false"}>
        {children}
        {footer}
      </div>
    );
  },
}));

// 宿主组件只验证自身逻辑，不渲染真实编辑器，kit 也不必真实构造
vi.mock("@/services/editorKit", () => ({
  getDesktopKit: () => ({}),
  getDesktopBareKit: () => ({}),
}));
vi.mock("@tau/editor/src", () => {
  const MockEditor = forwardRef<
    { setEditorValue: (value: Descendant[]) => void },
    {
      initValue?: Descendant[];
      onChange?: (value: Descendant[]) => void;
    }
  >(({ initValue = [], onChange }, ref) => {
    const initialText = useMemo(() => extractText(initValue), []);
    const [value, setValue] = useState(initialText);

    useImperativeHandle(ref, () => ({
      setEditorValue: (nextValue: Descendant[]) => {
        const nextText = extractText(nextValue);
        setValue(nextText);
        onChange?.(nextValue);
      },
    }));

    return (
      <textarea
        data-testid="question-description-editor"
        value={value}
        onChange={event => {
          const nextValue = event.target.value;
          setValue(nextValue);
          onChange?.(editorTextToDescendants(nextValue));
        }}
      />
    );
  });

  return { Editor: MockEditor };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const setTextareaValue = (element: HTMLTextAreaElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

const clickElement = (element: Element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("QuestionWindowPage", () => {
  beforeEach(() => {
    createQuestionMock.mockClear();
    loadItemsMock.mockClear();
    loadGroupStatsMock.mockClear();
    loadGroupsMock.mockClear();
    questionStoreState.itemsByGroup = { 1: [] };
    questionStoreState.searchQuery = "";
    questionStoreState.filter = "all";
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  it("新建问题成功后再次打开时应清空问题描述", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <App>
          <QuestionWindowPage />
        </App>
      );
    });

    const openButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("新建问题")
    );
    expect(openButton).toBeTruthy();

    await act(async () => {
      clickElement(openButton as HTMLButtonElement);
    });

    const titleTextarea = container.querySelector(
      'textarea[placeholder="请输入问题内容"]'
    ) as HTMLTextAreaElement | null;
    const descriptionEditor = container.querySelector(
      '[data-testid="question-description-editor"]'
    ) as HTMLTextAreaElement | null;

    expect(titleTextarea).toBeTruthy();
    expect(descriptionEditor).toBeTruthy();

    await act(async () => {
      setTextareaValue(titleTextarea as HTMLTextAreaElement, "测试问题");
      setTextareaValue(descriptionEditor as HTMLTextAreaElement, "第一次描述");
    });

    const confirmButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("确定")
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      clickElement(confirmButton as HTMLButtonElement);
    });

    expect(createQuestionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      clickElement(openButton as HTMLButtonElement);
    });

    const reopenedDescriptionEditor = container.querySelector(
      '[data-testid="question-description-editor"]'
    ) as HTMLTextAreaElement | null;

    expect(reopenedDescriptionEditor?.value).toBe("");
  });

  it("取消新建问题后再次打开时应清空问题描述", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <App>
          <QuestionWindowPage />
        </App>
      );
    });

    const openButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("新建问题")
    );
    expect(openButton).toBeTruthy();

    await act(async () => {
      clickElement(openButton as HTMLButtonElement);
    });

    const descriptionEditor = container.querySelector(
      '[data-testid="question-description-editor"]'
    ) as HTMLTextAreaElement | null;
    expect(descriptionEditor).toBeTruthy();

    await act(async () => {
      setTextareaValue(descriptionEditor as HTMLTextAreaElement, "取消前描述");
    });

    const cancelButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("取消")
    );
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      clickElement(cancelButton as HTMLButtonElement);
    });

    await act(async () => {
      clickElement(openButton as HTMLButtonElement);
    });

    const reopenedDescriptionEditor = container.querySelector(
      '[data-testid="question-description-editor"]'
    ) as HTMLTextAreaElement | null;

    expect(reopenedDescriptionEditor?.value).toBe("");
  });

  it("同一问题详情重新打开时应刷新非受控描述编辑器", async () => {
    questionStoreState.itemsByGroup = {
      1: [
        {
          id: 1,
          createTime: 1,
          updateTime: 1,
          questionContent: "测试问题",
          description: createParagraph("原描述"),
          answers: [],
          groupId: 1,
          sortIndex: 0,
          status: "not_started",
        },
      ],
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <App>
          <QuestionWindowPage />
        </App>
      );
    });

    const openDetailButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("查看详情：测试问题")
    );
    expect(openDetailButton).toBeTruthy();

    await act(async () => {
      clickElement(openDetailButton as HTMLButtonElement);
    });

    const descriptionEditor = container.querySelector(
      '[data-testid="question-description-editor"]'
    ) as HTMLTextAreaElement | null;
    expect(descriptionEditor?.value).toBe("原描述");

    const cancelButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("取消")
    );
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      clickElement(cancelButton as HTMLButtonElement);
    });

    questionStoreState.itemsByGroup = {
      1: [
        {
          ...questionStoreState.itemsByGroup[1][0],
          description: createParagraph("外部更新描述"),
        },
      ],
    };

    await act(async () => {
      root?.render(
        <App>
          <QuestionWindowPage />
        </App>
      );
    });

    const reopenDetailButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("查看详情：测试问题")
    );
    expect(reopenDetailButton).toBeTruthy();

    await act(async () => {
      clickElement(reopenDetailButton as HTMLButtonElement);
    });

    const reopenedDescriptionEditor = container.querySelector(
      '[data-testid="question-description-editor"]'
    ) as HTMLTextAreaElement | null;

    expect(reopenedDescriptionEditor?.value).toBe("外部更新描述");
  });
});
