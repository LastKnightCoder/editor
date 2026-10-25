import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Descendant } from "slate";
import { expect, it, vi } from "vitest";
import { createLocalYjsDocument } from "@tau/editor-collab/local";
import ContentEditor from "../ContentEditor";

const state = vi.hoisted(() => ({
  local: undefined as ReturnType<typeof createLocalYjsDocument> | undefined,
  article: { title: "正文", content: [] as Descendant[] },
}));
vi.mock("@/hooks/useContentDocument", () => ({
  useTransientContentDocument: () => ({}),
  default: () => ({
    document: state.local?.document,
    binding: state.local ? { doc: state.local.doc } : undefined,
    article: state.article,
    frozen: false,
    swapping: false,
  }),
}));
vi.mock("@/hooks/useCollaborationKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const kit = createEditorKit();
  return { useCollaborationKit: () => kit };
});
vi.mock("@/stores/useCollaborationStore", () => ({
  default: (selector: (state: { sessions: [] }) => unknown) => selector({ sessions: [] }),
}));
vi.mock("@/hooks/useCollaborationPresence", () => ({
  default: () => ({ onFocus: () => undefined, onBlur: () => undefined }),
}));
vi.mock("@/services/content-editing", () => ({}));

it("文档首次加载和外部更新直接通知宿主快照，无需第二条订阅链", async () => {
  const paragraph = (text: string): Descendant[] => [
    { type: "paragraph", children: [{ type: "formatted", text }] },
  ];
  const initial = paragraph("初始正文");
  state.local = createLocalYjsDocument(initial);
  state.article = { title: "正文", content: initial };
  const host = document.createElement("div"),
    root = createRoot(host);
  const onChange = vi.fn();
  const render = () =>
    act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <ContentEditor contentId={1} onChange={onChange} readonly={false} />
        </DndProvider>
      )
    );
  try {
    await render();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(initial);
    const updated = paragraph("外部更新正文");
    await act(async () => state.local?.updateContent(updated, "external"));
    state.article = { title: "正文", content: updated };
    await render();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toEqual(updated);
    expect(host.textContent).toContain("外部更新正文");
  } finally {
    await act(async () => root.unmount());
    state.local.dispose();
    host.remove();
  }
});
