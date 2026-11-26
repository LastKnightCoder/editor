import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Node, Transforms, type Editor as SlateEditor, type Descendant } from "slate";
import { createEditorKit, type EditorKit } from "@tau/editor";
import { defineExtension } from "@tau/editor/api";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { expect, it, vi } from "vitest";
import { mobileI18n, mobileLocaleSource, mobileTranslator } from "../../../services/i18n";
import { definePage, getQueryClient, getNavigator, RouterProvider } from "../../../router";
import { PageInstanceProvider } from "../../../router/pageLifecycle";
import { CardEditPage } from "../CardEditPage";
import { flashcardTranslator } from "../i18n";

const harness = vi.hoisted(() => ({
  kit: undefined as EditorKit | undefined,
  editors: [] as SlateEditor[],
  decks: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../../services/editorKit", () => ({ getMobileFlashcardKit: () => harness.kit }));
vi.mock("../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/tauri")>()),
  flashcardListDecks: harness.decks,
  flashcardCreateCard: harness.create,
}));
definePage({ key: "flashcard-locale-test-root", params: {}, component: () => null });
function PageContext({ children }: { children: ReactNode }) {
  return (
    <PageInstanceProvider
      value={{
        entry: {
          id: "flashcard-edit-test",
          key: "flashcardCardEdit",
          params: {},
          createdAt: 1,
          lastActiveAt: 1,
        },
        params: {},
        navigator: getNavigator(),
        phase: "active",
        transition: { seq: 0, type: null },
      }}
    >
      {children}
    </PageInstanceProvider>
  );
}
const byText = (text: string) => {
  const button = [...document.querySelectorAll("button")].find(
    item => item.textContent?.trim() === text
  );
  if (!button) throw new Error(`未找到操作：${text}`);
  return button;
};

it("切换语言保留双编辑器、答案与未提交标签草稿，且保存原题干、答案和来源标题", async () => {
  const original = mobileLocaleSource.getSnapshot(),
    client = getQueryClient();
  client.clear();
  mobileLocaleSource.setLocale("zh-CN");
  harness.decks.mockResolvedValue([
    {
      id: 11,
      name: "原始牌组名",
      description: "用户描述",
      coverColor: "#123456",
      emoji: "📝",
      sortOrder: 0,
      meta: {},
      createTime: 1,
      updateTime: 1,
    },
  ]);
  harness.create.mockResolvedValue({ id: 17 });
  harness.kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.observe-flashcard-editors",
        plugins: [
          editor => {
            harness.editors.push(editor);
            return editor;
          },
        ],
      }),
    ],
  });
  const prompt: Descendant[] = [
    { type: "paragraph", children: [{ type: "formatted", text: "用户题干" }] },
  ];
  const reference = { refType: "content" as const, contentId: 42, title: "原始来源标题" };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onBack = vi.fn(),
    onSaved = vi.fn(),
    onError = vi.fn();
  const view = () => (
    <I18nRuntimeProvider runtime={mobileI18n}>
      <QueryClientProvider client={client}>
        <RouterProvider rootKey="flashcard-locale-test-root">
          <PageContext>
            <DndProvider backend={HTML5Backend}>
              <CardEditPage
                deckId={11}
                cardId={-1}
                type="qa"
                reference={reference}
                initialPrompt={prompt}
                onBack={onBack}
                onSaved={onSaved}
                onError={(error, fallback) => onError(error, fallback)}
              />
            </DndProvider>
          </PageContext>
        </RouterProvider>
      </QueryClientProvider>
    </I18nRuntimeProvider>
  );
  try {
    await act(async () => root.render(view()));
    await act(async () => {
      await vi.waitFor(() => expect(host.querySelectorAll("[data-slate-editor]")).toHaveLength(2));
    });
    const [question, detail] = harness.editors;
    if (!question || !detail) throw new Error("双编辑器未挂载");
    const editables = [...host.querySelectorAll("[data-slate-editor]")];
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    const fields = [...host.querySelectorAll<HTMLTextAreaElement>("textarea")];
    const field = (placeholder: string) => {
      const found = fields.find(node => node.placeholder === placeholder);
      if (!found) throw new Error("字段未挂载");
      return found;
    };
    const answer = field(flashcardTranslator.t("ui.recallYourAnswerBeforeComparing"));
    const hint = field(flashcardTranslator.t("ui.aHintForYourResponse"));
    const explanation = field(flashcardTranslator.t("ui.helpConnectTheIdeaToYourMemory"));
    const tag = host.querySelector<HTMLInputElement>("input");
    if (!tag) throw new Error("标签草稿未挂载");
    await act(async () => {
      Transforms.select(question, { path: [0, 0], offset: 4 });
      question.insertText("草稿");
      Transforms.select(detail, { path: [0, 0], offset: 0 });
      detail.insertText("背面草稿");
      for (const [node, value] of [
        [answer, "用户答案"],
        [hint, "用户提示"],
        [explanation, "用户解析"],
      ] as const) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
          node,
          value
        );
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        tag,
        "待提交标签"
      );
      tag.dispatchEvent(new Event("input", { bubbles: true }));
      tag.focus();
      tag.setSelectionRange(1, 3);
    });
    const reads = harness.decks.mock.calls.length,
      keys = client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => {
        mobileLocaleSource.setLocale(locale);
        root.render(view());
      });
      expect(harness.editors).toEqual([question, detail]);
      expect([...host.querySelectorAll("[data-slate-editor]")]).toEqual(editables);
      expect(Node.string(question)).toBe("用户题干草稿");
      expect(Node.string(detail)).toBe("背面草稿");
      expect(answer.value).toBe("用户答案");
      expect(hint.value).toBe("用户提示");
      expect(explanation.value).toBe("用户解析");
      expect(host.querySelector("input")).toBe(tag);
      expect(tag.value).toBe("待提交标签");
      expect(document.activeElement).toBe(tag);
      expect([tag.selectionStart, tag.selectionEnd]).toEqual([1, 3]);
      expect(harness.decks).toHaveBeenCalledTimes(reads);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect(harness.create).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    }
    await act(async () => {
      tag.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const back = host.querySelector<HTMLButtonElement>("header button");
    if (!back) throw new Error("返回入口未挂载");
    await act(async () => back.click());
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => byText(mobileTranslator.t("common.cancel")).click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    await act(async () => byText(flashcardTranslator.t("ui.save")).click());
    expect(harness.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        deckId: 11,
        type: "qa",
        difficulty: "standard",
        tags: ["待提交标签"],
        references: [reference],
        data: expect.objectContaining({
          answer: "用户答案",
          hint: "用户提示",
          explanation: "用户解析",
        }),
      })
    );
    const saved = harness.create.mock.calls[0][0];
    expect(JSON.stringify(saved.prompt)).toContain("用户题干草稿");
    expect(JSON.stringify(saved.detail)).toContain("背面草稿");
    expect(onSaved).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    client.clear();
    mobileLocaleSource.setLocale(original);
    vi.useRealTimers();
    vi.clearAllMocks();
    harness.kit = undefined;
    harness.editors = [];
  }
});
