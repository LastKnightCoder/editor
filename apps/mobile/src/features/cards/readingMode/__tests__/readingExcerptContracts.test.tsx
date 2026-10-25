import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createEditor, type Descendant } from "slate";
import { createNodeDocument, NodeTree } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { ContentPluginRegistry } from "@tau/plugins/content";
import ReadingSelectionBar from "../ReadingSelectionBar";

const create = vi.hoisted(() => vi.fn());
vi.mock("../../../../services/tauri", () => ({ createQuickCard: create }));
vi.mock("../../../../components/toast", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

it("摘录携带来源旧契约，当前插件目录为空也能保留源码并生成新身份", async () => {
  const contract = await prepareContentContract("test.old", {
    type: "test.old",
    dataVersion: 1,
    kind: "block",
    collaboration: { textFields: ["source"] },
  });
  const node = {
    type: "test.old",
    collabId: "source-node",
    tauContract: contract.id,
    source: "旧源码",
    children: [{ text: "摘录文字" }],
  };
  const doc = await createNodeDocument(
    { documentId: "source", baselineId: "baseline", epoch: 0 },
    { title: "", bannerBg: "", bannerPosition: "center", content: [node] },
    { [contract.id]: contract.contract }
  );
  const tree = new NodeTree(doc);
  const editor = Object.assign(createEditor(), { nodeTree: tree });
  editor.children = tree.read() as Descendant[];
  const catalog = await new ContentPluginRegistry().prepareEditorContracts([]);
  let copied: Awaited<ReturnType<typeof catalog.createDocument>> | undefined;
  create.mockImplementation(async input => {
    copied = await catalog.createDocument(input.content, input.contracts);
    return { id: 1 };
  });
  type Props = ComponentProps<typeof ReadingSelectionBar>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ReadingSelectionBar
          editorRef={{
            current: {
              getEditor: () => editor,
              focus: () => {},
              deselect: () => {},
              getEditableElement: () => null,
              isFocus: () => false,
            },
          }}
          controller={{} as Props["controller"]}
          readingMode={{ canEdit: true, editing: false } as Props["readingMode"]}
          range={{ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 4 } }}
          onClear={() => {}}
          portalContainer={host}
        />
      )
    );
    const button = [...host.querySelectorAll("button")].find(
      item => item.textContent === "摘录成卡片"
    )!;
    await act(async () => {
      button.click();
      await vi.waitFor(() => expect(copied).toBeDefined());
    });
    expect(copied!.contracts[contract.id]).toEqual(contract.contract);
    expect(copied!.content[0]).toMatchObject({ tauContract: contract.id, source: "旧源码" });
    expect((copied!.content[0] as unknown as { collabId: string }).collabId).not.toBe(
      "source-node"
    );
    expect(node.source).toBe("旧源码");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    tree.dispose();
    doc.destroy();
  }
});
