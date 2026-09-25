import { App } from "antd";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";

import type { IQuestion } from "@/types/question";
import QuestionItem from "../QuestionItem";

vi.mock("react-dnd", () => ({
  useDrag: () => [null, (node: unknown) => node],
  useDrop: () => [null, (node: unknown) => node],
}));

vi.mock("@/hooks/useTheme", () => ({
  default: () => ({ isDark: false }),
}));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    hoverClass: "hover:bg-gray-100",
    borderClass: "border-gray-200",
    cardBorderClass: "border-gray-200",
    cardBgClass: "bg-white",
  }),
}));

vi.mock("@/utils/answer-content", () => ({
  getAnswerPrimaryContentType: vi.fn(() => undefined),
}));

vi.mock("@/components/EditText", async () => {
  const React = await import("react");

  const MockEditText = React.memo(
    React.forwardRef<
      { setValue: (value: string) => void },
      {
        defaultValue?: string;
        value?: string;
      }
    >(({ defaultValue, value }, ref) => {
      const [text, setText] = React.useState(value ?? defaultValue ?? "");

      React.useEffect(() => {
        if (typeof value === "string") {
          setText(value);
        }
      }, [value]);

      React.useImperativeHandle(ref, () => ({
        setValue: setText,
      }));

      return <div data-testid="question-title">{text}</div>;
    })
  );

  return { default: MockEditText };
});

vi.mock("@/utils/editor", () => ({
  getEditorText: (nodes?: Descendant[]) =>
    nodes
      ?.map(node =>
        "children" in node
          ? node.children.map(child => ("text" in child ? child.text : "")).join("")
          : ""
      )
      .join("\n") ?? "",
}));

const createParagraph = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];

const createQuestion = (questionContent: string): IQuestion => ({
  id: 1,
  createTime: 1,
  updateTime: 1,
  questionContent,
  description: createParagraph("描述"),
  answers: [],
  groupId: 1,
  sortIndex: 0,
  status: "not_started",
});

const renderQuestionItem = (question: IQuestion) => (
  <App>
    <QuestionItem
      question={question}
      groups={[{ id: 1, title: "默认分组" }]}
      allQuestionIds={[question.id]}
      answerTitles={{}}
      answerStatuses={{}}
      onUpdateTitle={vi.fn()}
      onOpenNewAnswer={vi.fn()}
      onOpenSelectAnswer={vi.fn()}
      onMoveToGroup={vi.fn()}
      onDelete={vi.fn()}
      onReorder={vi.fn()}
      onOpenAnswer={vi.fn()}
      onDeleteAnswer={vi.fn()}
      onUpdateStatus={vi.fn()}
      onViewDetails={vi.fn()}
    />
  </App>
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("QuestionItem", () => {
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

  it("问题内容变更后应同步刷新列表标题", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(renderQuestionItem(createQuestion("旧问题")));
    });

    expect(container.textContent).toContain("旧问题");

    await act(async () => {
      root?.render(renderQuestionItem(createQuestion("更新后的问题")));
    });

    expect(container.textContent).toContain("更新后的问题");
    expect(container.textContent).not.toContain("旧问题");
  });
});
