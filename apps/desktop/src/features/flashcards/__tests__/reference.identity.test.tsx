import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createFormReference, emptyForm } from "../editorModel";
import { CardEditorContent } from "../components/CardEditorContent";

vi.mock("@/components/FlashcardEditor/components/RichTextEditor", () => ({ default: () => null }));
vi.mock("../components/AnswerFields", () => ({ AnswerFields: () => null }));
vi.mock("@/components/FlashcardEditor/components/ReferenceEditor", async () => {
  const { useState } = await import("react");
  return {
    default: function ReferenceProbe({
      reference,
      onRemove,
    }: {
      reference: { title: string };
      onRemove(): void;
    }) {
      const [initialTitle] = useState(reference.title);
      return (
        <div data-reference={initialTitle}>
          <button onClick={onRemove}>删除{reference.title}</button>
        </div>
      );
    },
  };
});

it("删除前一条参考资料后，后一条沿用自己的编辑器状态", async () => {
  function Harness() {
    const [form, setForm] = useState(() => ({
      ...emptyForm(1, "qa"),
      references: [
        createFormReference({ refType: "custom", title: "甲" }),
        createFormReference({ refType: "custom", title: "乙" }),
      ],
    }));
    return (
      <CardEditorContent
        form={form}
        revision={1}
        isDark={false}
        patch={next => setForm(previous => ({ ...previous, ...next }))}
        patchData={() => undefined}
        changeType={() => undefined}
      />
    );
  }
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () => root.render(<Harness />));
    const second = host.querySelector('[data-reference="乙"]');
    const remove = host.querySelector('[data-reference="甲"] button') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(host.querySelector('[data-reference="甲"]')).toBeNull();
    expect(host.querySelector('[data-reference="乙"]')).toBe(second);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
