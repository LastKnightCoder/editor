import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider, useDragDropManager } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import { Node, type Descendant } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import { defineElement, defineExtension, notifierOf } from "@tau/editor/api";
import { createNodeDocument, NodeTree } from "@tau/collaboration";
import { ElementContractCatalog } from "../../../plugins/src/editor-contracts";
import { createNodeTreeDocument } from "../nodeTreeDocument";

it.each(["有插件", "缺少插件", "目标校验失败", "目标保存失败"])(
  "跨文档拖动插件块：%s",
  async scenario => {
    const extension = defineExtension({
      id: "test.drag-plugin",
      elements: [
        defineElement({
          type: "test.drag-block",
          dataVersion: 1,
          kind: "block",
          isVoid: true,
          drag: true,
          collaboration: { textFields: ["source"] },
          render: ({ attributes, children }) => <div {...attributes}>插件块{children}</div>,
        }),
      ],
    });
    const baseKit = createEditorKit();
    const sourceKit = baseKit.extend({ extensions: [extension] });
    const targetKit = scenario === "有插件" ? sourceKit : baseKit;
    const catalogFor = (kit: typeof baseKit) =>
      ElementContractCatalog.prepare(
        kit.extensions.map(({ id, elements }) => ({ owner: id, elements: elements ?? [] }))
      );
    const sourceCatalog = await catalogFor(sourceKit);
    const targetCatalog = await catalogFor(targetKit);
    const makeTree = async (id: string, catalog: typeof sourceCatalog, nodes: Descendant[]) => {
      const value = await catalog.createDocument(nodes);
      return new NodeTree(
        await createNodeDocument(
          { documentId: id, baselineId: id, epoch: 0 },
          { title: "", bannerBg: "", bannerPosition: "center", content: value.content },
          value.contracts
        )
      );
    };
    const paragraph = (text: string): Descendant => ({
      type: "paragraph",
      children: [{ type: "formatted", text }],
    });
    const source = await makeTree("source", sourceCatalog, [
      {
        type: "test.drag-block",
        source: "插件源码",
        children: [{ type: "formatted", text: "" }],
      } as Descendant,
      paragraph("源段落"),
    ]);
    const target = await makeTree("target", targetCatalog, [paragraph("目标段落")]);
    const original = source.read()[0];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const manager: { current?: ReturnType<typeof useDragDropManager> } = {};
    const Probe = () => {
      manager.current = useDragDropManager();
      return null;
    };
    const errors = vi.spyOn(console, "error");
    const blocked = scenario === "目标校验失败" || scenario === "目标保存失败";
    const prepareFragment = vi.fn(async (_sourceId, content) => {
      if (scenario === "目标校验失败") throw new Error(scenario);
      return content;
    });
    const flushFragmentWrites = vi.fn(async () => {
      expect(source.read()[0]).toEqual(original);
      expect(target.read()[1]).toMatchObject({ type: "test.drag-block", source: "插件源码" });
      if (scenario === "目标保存失败") throw new Error(scenario);
    });
    const feedback = vi.fn();
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Probe />
            <div data-source>
              <Editor
                readonly={false}
                kit={sourceKit}
                document={createNodeTreeDocument(source, { versions: sourceCatalog })}
              />
            </div>
            <div data-target>
              <Editor
                readonly={false}
                kit={targetKit}
                document={createNodeTreeDocument(target, {
                  versions: targetCatalog,
                  prepareFragment,
                  flushFragmentWrites,
                })}
                onInit={editor => {
                  notifierOf(editor).error = feedback;
                }}
              />
            </div>
          </DndProvider>
        )
      );
      const handle = host.querySelector<HTMLElement>("[data-source] [data-drag-handle]");
      const landing = host.querySelector<HTMLElement>("[data-target] .ed-block");
      if (!handle || !landing || !manager.current) throw new Error("未挂载拖拽手柄和落点");
      const transfer = { types: [], setData: vi.fn(), setDragImage: vi.fn(), dropEffect: "move" };
      const dispatch = (node: HTMLElement, type: string) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 10 });
        Object.defineProperty(event, "dataTransfer", { value: transfer });
        node.dispatchEvent(event);
      };
      await act(async () => {
        dispatch(handle, "dragstart");
        expect(manager.current?.getMonitor().isDragging()).toBe(true);
        dispatch(landing, "dragenter");
        dispatch(landing, "drop");
      });
      if (blocked) {
        await vi.waitFor(() => expect(feedback).toHaveBeenCalledWith(scenario));
        expect(source.read()[0]).toEqual(original);
        expect(target.read()).toHaveLength(scenario === "目标校验失败" ? 1 : 2);
        return;
      }
      await vi.waitFor(() => {
        expect({
          source: source.read().map(node => node.type),
          target: target.read().map(node => node.type),
        }).toEqual({ source: ["paragraph"], target: ["paragraph", "test.drag-block"] });
      });
      const moved = target.read()[1];
      expect(moved).toMatchObject({ tauContract: original.tauContract, source: "插件源码" });
      expect(moved.collabId).not.toBe(original.collabId);
      expect(target.contracts.get(String(moved.tauContract))).toEqual(
        source.contracts.get(String(original.tauContract))
      );
      expect(Node.string(target.read()[0] as Descendant)).toBe("目标段落");
      expect(prepareFragment).toHaveBeenCalledWith(
        "source",
        expect.any(Array),
        expect.objectContaining({
          [String(original.tauContract)]: source.contracts.get(String(original.tauContract)),
        })
      );
      expect(feedback).not.toHaveBeenCalled();
      expect(flushFragmentWrites).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      errors.mockRestore();
      source.doc.destroy();
      target.doc.destroy();
      host.remove();
    }
  }
);
