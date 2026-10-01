import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { FlashcardReferenceInput } from "@/types";
import type { FlashcardMutations } from "../queries";
import type { FormState } from "../editorModel";

vi.mock("@/hooks/useTheme", () => ({ default: () => ({ isDark: false }) }));
vi.mock("../components/CardEditorProperties", () => ({ CardEditorProperties: () => null }));
vi.mock("../components/CardEditorContent", () => ({
  CardEditorContent: ({
    form,
    patch,
  }: {
    form: FormState;
    patch: (value: Partial<FormState>) => void;
  }) => (
    <div>
      <output>{JSON.stringify(form.references)}</output>
      <button
        onClick={() =>
          patch({
            prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "问题" }] }],
          })
        }
      >
        填写题干
      </button>
    </div>
  ),
}));

import { CardEditorDialog } from "../components/CardEditorDialog";

describe("跨域制卡来源", () => {
  it("首次保存及连续制卡均保留原文引用", async () => {
    const reference: FlashcardReferenceInput = { refType: "content", contentId: 42, title: "原文" };
    const createCard = vi.fn(async () => ({ id: 1 }));
    const mutations = { createCard } as unknown as FlashcardMutations;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const click = (text: string) => {
      const button = Array.from(document.querySelectorAll("button")).find(
        item => item.textContent === text
      );
      if (!button) throw new Error(`未找到操作：${text}`);
      button.click();
    };
    try {
      await act(async () =>
        root.render(
          <CardEditorDialog
            open
            card={null}
            decks={[]}
            defaultDeckId={1}
            now={0}
            mutations={mutations}
            onClose={() => undefined}
            onDelete={() => undefined}
            initialReferences={[reference]}
          />
        )
      );
      const initialReferences = JSON.parse(document.querySelector("output")?.textContent ?? "[]");
      expect(initialReferences).toEqual([expect.objectContaining(reference)]);
      expect(initialReferences[0].formId).toEqual(expect.any(String));
      await act(async () => {
        click("填写题干");
      });
      await act(async () => {
        click("保存并新建");
      });
      expect(createCard).toHaveBeenCalledWith(
        expect.objectContaining({ deckId: 1, references: [reference] })
      );
      const nextReferences = JSON.parse(document.querySelector("output")?.textContent ?? "[]");
      expect(nextReferences).toEqual([expect.objectContaining(reference)]);
      expect(nextReferences[0].formId).not.toBe(initialReferences[0].formId);
      await act(async () => {
        click("填写题干");
      });
      await act(async () => {
        click("保存");
      });
      expect(createCard).toHaveBeenCalledTimes(2);
      expect(createCard.mock.calls[1]).toEqual([
        expect.objectContaining({ references: [reference] }),
      ]);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
