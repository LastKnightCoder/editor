import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard } from "@/types";
import { CardFront } from "../components/review/CardFront";
import { useReviewKeyboard } from "../hooks/useReviewKeyboard";

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
vi.mock("@tau/editor/src", () => ({ Editor: () => null }));
vi.mock("@/components/ErrorBoundary", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/editor-extensions/flashcard-blank", () => ({ default: class {} }));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ isDark: false }) }));
vi.mock("../overlay", () => ({ overlayOpen: () => false, MOD: "Ctrl+" }));

const actions = {
  submit: vi.fn(),
  rate: vi.fn().mockResolvedValue(undefined),
  undo: vi.fn().mockResolvedValue(undefined),
  suspend: vi.fn(),
  pickOption: vi.fn(),
  onEdit: vi.fn(),
};
let root: Root;
let host: HTMLDivElement;
let revealed: boolean;
let card: Flashcard;

function Probe() {
  useReviewKeyboard({ card, revealed, suggestion: "normal", busy: false, ...actions });
  return (
    <CardFront
      card={card}
      answer={{}}
      revealed={false}
      hintShown={false}
      onShowHint={() => undefined}
      onAnswer={() => undefined}
      onPick={actions.pickOption}
      onSubmit={actions.submit}
    />
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  revealed = false;
  card = {
    id: 1,
    deckId: 1,
    type: "qa",
    prompt: [],
    detail: [],
    data: {},
    tags: [],
    difficulty: "standard",
    reviewLevel: 0,
    dueTime: 0,
    lastReviewTime: null,
    reviewCount: 0,
    easeFactor: 2.5,
    status: "new",
    references: [],
    createTime: 0,
    updateTime: 0,
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function answerField() {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (!field) throw new Error("作答输入框未渲染");
  return field;
}

describe("作答输入的快捷键边界", () => {
  it.each(["qa", "cloze"] as const)("%s 输入中的空格、字母、数字与撤销不进入外层", async type => {
    card = {
      ...card,
      type,
      prompt:
        type === "cloze"
          ? ([
              {
                type: "flashcard-blank",
                blankId: "blank",
                answer: "答案",
                children: [{ text: "" }],
              },
            ] as unknown as Flashcard["prompt"])
          : [],
    };
    await act(async () => root.render(<Probe />));
    const field = answerField();
    field.focus();
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    try {
      for (const key of [" ", "a", "e", "s", "1", "2", "3", "4"]) {
        expect(press(field, key).defaultPrevented).toBe(false);
      }
      press(field, "z", { ctrlKey: true });
      press(field, "z", { metaKey: true });
      expect(outer).not.toHaveBeenCalled();
      for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
      press(field, "Escape");
      expect(outer).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", outer);
    }
  });

  it("问答保留普通回车换行与 Ctrl+Enter 提交，输入法确认不提交", () => {
    const field = answerField();
    field.focus();
    expect(press(field, "Enter").defaultPrevented).toBe(false);
    press(field, "Enter", { ctrlKey: true, isComposing: true });
    expect(actions.submit).not.toHaveBeenCalled();
    press(field, "Enter", { ctrlKey: true });
    expect(actions.submit).toHaveBeenCalledTimes(1);
  });

  it("事件目标被转发到窗口时仍以输入焦点为准，失焦后恢复复习快捷键", async () => {
    const field = answerField();
    field.focus();
    revealed = true;
    await act(async () => root.render(<Probe />));
    for (const key of [" ", "1", "e", "s"]) press(window, key);
    press(window, "z", { ctrlKey: true });
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
    field.blur();
    press(window, " ");
    expect(actions.rate).toHaveBeenCalledWith("normal");
  });
});
