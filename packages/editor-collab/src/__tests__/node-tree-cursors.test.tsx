import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { IS_FOCUSED } from "slate-dom";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { Editor, createEditorKit } from "@tau/editor";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import type { NodeTreeEditor } from "../withNodeTree";

it.each(["原生聚焦", "输入法恢复焦点"])("移动端选区经桌面状态转发后显示：%s", async mode => {
  const recoverFocus = mode !== "原生聚焦";
  const mobile = new NodeTree(new Y.Doc());
  mobile.insertNode({ type: "paragraph", children: [{ text: "协作正文" }] }, null, 0, null);
  const desktop = new NodeTree(new Y.Doc());
  Y.applyUpdate(desktop.doc, Y.encodeStateAsUpdate(mobile.doc));
  const mainDoc = new Y.Doc();
  const mainAwareness = new Awareness(mainDoc);
  mainAwareness.setLocalState(null);
  const peers = [mobile, desktop].map((tree, index) => {
    const awareness = new Awareness(tree.doc);
    awareness.setLocalStateField("user", { id: `device-${index}`, name: `设备${index}` });
    return {
      tree,
      awareness,
      document: createNodeTreeDocument(tree, {
        collaboration: {
          doc: tree.doc,
          awareness,
          origin: {},
          uploadResource: async () => "",
          resolveResource: async url => url,
        },
      }),
    };
  });
  const relay = (from: Awareness, to: Awareness) => {
    from.on("update", ({ added, updated, removed }) => {
      applyAwarenessUpdate(
        to,
        encodeAwarenessUpdate(from, [...added, ...updated, ...removed]),
        "remote"
      );
    });
  };
  relay(peers[0].awareness, mainAwareness);
  relay(mainAwareness, peers[1].awareness);
  mobile.doc.on("update", update => Y.applyUpdate(desktop.doc, update));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const editors: NodeTreeEditor[] = [];
  const kit = createEditorKit();
  const toDOMRange = ReactEditor.toDOMRange;
  const geometry = vi.spyOn(ReactEditor, "toDOMRange").mockImplementation((...args) => {
    const range = toDOMRange(...args);
    range.getBoundingClientRect = () => new DOMRect(10, 10, 0, 20);
    range.getClientRects = () => [new DOMRect(10, 10, 20, 20)] as unknown as DOMRectList;
    return range;
  });
  try {
    const render = (readonly: boolean) =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          {peers.map((peer, index) => (
            <section key={index} data-peer={index}>
              <Editor
                kit={kit}
                document={peer.document}
                readonly={index === 0 && readonly}
                onInit={editor => {
                  editors[index] = editor as NodeTreeEditor;
                }}
              />
            </section>
          ))}
        </DndProvider>
      );
    await act(async () => render(recoverFocus));
    await act(async () => {
      const element = host.querySelector<HTMLElement>('[data-peer="0"] [data-slate-editor]');
      if (!element) throw new Error("移动端编辑器未挂载");
      Object.defineProperty(element, "isContentEditable", { value: true });
      element.tabIndex = 0;
      element.focus();
    });
    if (recoverFocus) {
      await act(async () => render(false));
      // Android 的输入法提交和 DOM 选区同步会恢复此标记，但不会再触发 focusin。
      IS_FOCUSED.set(editors[0], true);
    }
    await act(async () => {
      Transforms.select(editors[0], { path: [0, 0], offset: 2 });
    });
    expect(ReactEditor.isFocused(editors[0] as ReactEditor)).toBe(true);
    expect(peers[0].awareness.getLocalState()?.nodeTreeSelection?.range).toBeTruthy();
    expect(
      editors[1].resolveNodeTreeSelection(
        peers[1].awareness.getStates().get(mobile.doc.clientID)?.nodeTreeSelection?.range
      )
    ).toEqual(editors[0].selection);
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(host.querySelector('[data-peer="1"] [data-collaboration-cursor]')).not.toBeNull();
    await act(async () => {
      editors[0].insertText("输入");
    });
    expect(editors[1].children).toEqual(editors[0].children);
    expect(
      editors[1].resolveNodeTreeSelection(
        peers[1].awareness.getStates().get(mobile.doc.clientID)?.nodeTreeSelection?.range
      )
    ).toEqual(editors[0].selection);
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    const outside = document.createElement("button");
    host.appendChild(outside);
    await act(async () => {
      outside.focus();
    });
    expect(ReactEditor.isFocused(editors[0] as ReactEditor)).toBe(false);
    expect(peers[1].awareness.getStates().get(mobile.doc.clientID)?.nodeTreeSelection).toBeNull();
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(host.querySelector('[data-peer="1"] [data-collaboration-cursor]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    geometry.mockRestore();
    mainAwareness.destroy();
    mainDoc.destroy();
    for (const peer of peers) {
      peer.awareness.destroy();
      peer.tree.dispose();
      peer.tree.doc.destroy();
    }
    host.remove();
  }
});
