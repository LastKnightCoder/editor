// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { EditorDocument } from "@tau/editor";
import { CollaborativeEditor } from "../CollaborativeEditor";

const fixture = vi.hoisted(() => ({ document: {}, session: vi.fn() }));
vi.mock("../hooks/useCollaborationRuntime", () => ({ useCollaborationRuntime: () => {} }));
vi.mock("../hooks/useCollabSession", () => ({ useCollabSession: fixture.session }));
vi.mock("../../../router", () => ({ useNavigator: () => ({ pushForResult: vi.fn() }) }));

it("旧恢复选择标记不再冻结正常协作会话或隐藏文档源", async () => {
  localStorage.setItem("tau-collab-local-fallback:7", "1");
  fixture.session.mockReturnValue({
    binding: {},
    document: fixture.document,
    loading: false,
    readonly: false,
    boundContentId: 7,
    ended: false,
    retry: vi.fn(),
    presence: {},
    online: [],
    offline: false,
  });
  const documentChanged = vi.fn(),
    readonlyChanged = vi.fn();
  const host = document.createElement("div"),
    root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <CollaborativeEditor
          documentId="shared"
          contentId={7}
          onDocumentChange={documentChanged}
          onReadonlyChange={readonlyChanged}
        />
      )
    );
    expect(documentChanged).toHaveBeenLastCalledWith(fixture.document as EditorDocument);
    expect(readonlyChanged).toHaveBeenLastCalledWith(false);
  } finally {
    await act(async () => root.unmount());
    localStorage.removeItem("tau-collab-local-fallback:7");
  }
});
