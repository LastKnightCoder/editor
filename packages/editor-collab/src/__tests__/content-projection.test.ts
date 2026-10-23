import * as Y from "yjs";
import { createEditor, Node, Transforms, type Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";
import { createLocalYjsDocument } from "../localDocument";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const check = (session: ReturnType<typeof createLocalYjsDocument>) =>
  expect(session.getSnapshot()).toEqual(session.getContent());

describe("Yjs 独立块投影", () => {
  it("二进制扩展字段保留类型且独立复制，不冻结失败或污染下一次读取", () => {
    const session = createLocalYjsDocument([
      {
        type: "external.binary",
        bytes: new Uint8Array([1, 2, 3]),
        children: [{ type: "formatted", text: "保留" }],
      },
    ] as unknown as Descendant[]);
    try {
      const first = session.getSnapshot();
      const bytes = (first[0] as unknown as { bytes: Uint8Array }).bytes;
      expect(Object.prototype.toString.call(bytes)).toBe("[object Uint8Array]");
      bytes[0] = 9;
      const next = session.getSnapshot();
      expect(next).not.toBe(first);
      expect(Array.from((next[0] as unknown as { bytes: Uint8Array }).bytes)).toEqual([1, 2, 3]);
      check(session);
    } finally {
      session.dispose();
    }
  });
  it("局部编辑只转换变化块，旧快照和未变块保持独立且冻结", () => {
    const session = createLocalYjsDocument([paragraph("甲"), paragraph("乙")]);
    const binding = session.document.binding;
    if (!binding) throw new Error("缺少绑定");
    const editor = binding.install(createEditor());
    binding.connect(editor);
    try {
      const first = session.getSnapshot();
      const untouched = session.root.toDelta()[1].insert as Y.XmlText;
      const read = vi.spyOn(untouched, "toDelta");
      Transforms.insertText(editor, "更新", { at: { path: [0, 0], offset: 1 } });
      const next = session.getSnapshot();
      expect(next).toEqual([paragraph("甲更新"), paragraph("乙")]);
      expect(next[0]).not.toBe(first[0]);
      expect(next[1]).toBe(first[1]);
      expect(read).not.toHaveBeenCalled();
      expect(first).toEqual([paragraph("甲"), paragraph("乙")]);
      expect(first[0]).not.toBe(editor.children[0]);
      expect(Object.isFrozen(next)).toBe(true);
      expect(Reflect.set(next[1], "children", [])).toBe(false);
      check(session);
    } finally {
      session.dispose();
    }
  });

  it("未知字段和嵌套属性保真，调用方副本不能污染 Y.Doc 或缓存", () => {
    const content = [
      {
        type: "external.block",
        custom: { items: [{ value: 1 }] },
        children: [{ type: "formatted", text: "未知正文", vendor: { enabled: true } }],
      },
    ] as unknown as Descendant[];
    const session = createLocalYjsDocument(content);
    try {
      const snapshot = session.getSnapshot();
      expect(snapshot).toEqual(content);
      const copy = session.getContent() as unknown as typeof content;
      const custom = (copy[0] as unknown as { custom: { items: Array<{ value: number }> } }).custom;
      custom.items[0].value = 2;
      copy.splice(0);
      expect(session.getContent()).toEqual(content);
      expect(session.getSnapshot()).toBe(snapshot);
      check(session);
    } finally {
      session.dispose();
    }
  });

  it("结构、嵌套文本、属性、空文档和撤销重做与全量投影一致", () => {
    const session = createLocalYjsDocument([paragraph("甲"), paragraph("乙")]);
    try {
      const stable = session.getSnapshot()[1];
      session.updateContent([paragraph("新增"), paragraph("甲"), paragraph("乙")]);
      check(session);
      expect(session.getSnapshot()[2]).toBe(stable);
      session.undoManager.stopCapturing();
      session.transact("user", () => {
        const block = session.root.toDelta()[1].insert as Y.XmlText;
        block.format(0, 1, { bold: true });
        block.setAttribute("custom", { enabled: true });
      });
      check(session);
      const updated = session.getSnapshot();
      session.undo();
      check(session);
      session.redo();
      check(session);
      expect(session.getSnapshot()).toEqual(updated);
      session.undoManager.stopCapturing();
      session.transact("user", () => session.root.delete(0, session.root.length));
      expect(session.getSnapshot()).toEqual([paragraph("")]);
      session.undo();
      check(session);
      session.redo();
      check(session);
    } finally {
      session.dispose();
    }
  });

  it("顶层文本沿用原库合并规则，事务内部读取不返回旧值", () => {
    const session = createLocalYjsDocument([paragraph("原文")]);
    try {
      session.getSnapshot();
      session.transact("user", () => {
        session.root.delete(0, session.root.length);
        session.root.insert(0, "甲", { bold: true });
        session.root.insert(1, "乙", { bold: true });
        check(session);
      });
      check(session);
      expect(session.getSnapshot()).toEqual([{ type: "formatted", text: "甲乙", bold: true }]);
    } finally {
      session.dispose();
    }
  });

  it("观察器重入和远端更新时，订阅者只能读到完整的当前内容", () => {
    const session = createLocalYjsDocument([paragraph("甲"), paragraph("乙")]);
    const remote = new Y.Doc();
    const observed: Array<readonly Descendant[]> = [];
    const stop = session.subscribe(() => {
      check(session);
      observed.push(session.getSnapshot());
    });
    let nested = false;
    const listener = () => {
      if (nested) return;
      nested = true;
      const second = session.root.toDelta()[1].insert as Y.XmlText;
      second.setAttribute("custom", true);
    };
    session.root.observeDeep(listener);
    try {
      session.getSnapshot();
      session.transact("user", () =>
        (session.root.toDelta()[0].insert as Y.XmlText).insert(1, "本地")
      );
      expect(observed.length).toBeGreaterThan(0);
      check(session);
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(session.doc));
      const other = remote.get("content", Y.XmlText).toDelta()[0].insert as Y.XmlText;
      other.insert(0, "远端");
      Y.applyUpdate(session.doc, Y.encodeStateAsUpdate(remote));
      check(session);
      expect(Node.string(session.getSnapshot()[0])).toBe("远端甲本地");
    } finally {
      session.root.unobserveDeep(listener);
      stop();
      remote.destroy();
      session.dispose();
    }
  });

  it("两个编辑器共用投影和历史，但不共享快照节点与可写返回值", () => {
    const session = createLocalYjsDocument([paragraph("甲"), paragraph("乙")]);
    const binding = session.document.binding;
    if (!binding) throw new Error("缺少绑定");
    const first = binding.install(createEditor()),
      second = binding.install(createEditor());
    binding.connect(first);
    binding.connect(second);
    try {
      const initial = session.getSnapshot();
      Transforms.insertText(first, "一", { at: { path: [0, 0], offset: 1 } });
      check(session);
      session.undoManager.stopCapturing();
      Transforms.insertText(second, "二", { at: { path: [1, 0], offset: 1 } });
      check(session);
      expect(first.children).toEqual(second.children);
      expect(session.getSnapshot()).toEqual([paragraph("甲一"), paragraph("乙二")]);
      expect(session.getSnapshot()[0]).not.toBe(first.children[0]);
      expect(session.getSnapshot()[1]).not.toBe(second.children[1]);
      expect(initial).toEqual([paragraph("甲"), paragraph("乙")]);
      session.undo();
      check(session);
      expect(session.getSnapshot()).toEqual([paragraph("甲一"), paragraph("乙")]);
      session.redo();
      check(session);
      expect(session.getSnapshot()).toEqual([paragraph("甲一"), paragraph("乙二")]);
    } finally {
      session.dispose();
    }
  });

  it("连续混合文本、属性、结构与历史操作保持全量等价", () => {
    const session = createLocalYjsDocument([paragraph("甲"), paragraph("乙"), paragraph("丙")]);
    let seed = 83;
    try {
      for (let step = 0; step < 120; step++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const before = session.getSnapshot();
        const preserved = structuredClone(before);
        session.undoManager.stopCapturing();
        const nodes = session.getContent();
        const index = seed % nodes.length;
        if (step % 6 === 0) {
          session.transact("user", () =>
            (session.root.toDelta()[index].insert as Y.XmlText).insert(0, "增")
          );
        } else if (step % 6 === 1) {
          session.transact("user", () =>
            (session.root.toDelta()[index].insert as Y.XmlText).setAttribute("vendor", {
              value: step,
            })
          );
        } else if (step % 6 === 2) {
          nodes.splice(index, 0, paragraph(`新${step}`));
          session.updateContent(nodes);
        } else if (step % 6 === 3 && nodes.length > 1) {
          nodes.splice(index, 1);
          session.updateContent(nodes);
        } else if (step % 6 === 4) session.undo();
        else session.redo();
        check(session);
        expect(before).toEqual(preserved);
      }
    } finally {
      session.dispose();
    }
  });
});
