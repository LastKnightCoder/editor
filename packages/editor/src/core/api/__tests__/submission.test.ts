import { IElementEditingPolicy } from "../../services/elementEditingPolicy";
import { createEditor, Editor, Node, Transforms, type Element } from "slate";
import { describe, expect, it, vi } from "vitest";
import {
  captureElementSubmission,
  captureInsertionSubmission,
  captureEditorSubmission,
} from "../submission";
import { beginSubmissionScope, notifySubmissionServices } from "../../kit/submissionScope";
import { createServiceId } from "../../services/tokens";
import { createParagraph } from "../../model/paragraph";

const setup = () => {
  const editor = createEditor();
  editor.children = [createParagraph(), createParagraph()];
  return editor;
};

describe("异步提交守卫", () => {
  it("服务解析失败和非法异步条件均释放目标引用", () => {
    const editor = setup();
    const token = createServiceId<object>("test.failure");
    editor.tryGetService = () => {
      throw new Error("服务失败");
    };
    expect(() =>
      captureElementSubmission(editor, {
        element: editor.children[0] as Element,
        path: [0],
        services: [token],
      })
    ).toThrow("服务失败");
    expect(editor.pathRefs().size).toBe(0);
    const operation = captureElementSubmission(editor, {
      element: editor.children[0] as Element,
      path: [0],
      accept: () => Promise.resolve(true) as never,
    });
    expect(() => operation.check()).toThrow("同步返回 boolean");
    expect(editor.pathRefs().size).toBe(0);
  });
  it("只跟踪声明的服务，服务切换后恢复旧实例也不能复活操作", () => {
    const editor = setup();
    const token = createServiceId<object>("test.resource");
    const original = {};
    let resource = original;
    editor.tryGetService = () => resource as never;
    const submission = captureEditorSubmission(editor, { services: [token] });
    notifySubmissionServices(editor);
    expect(submission.check()).toBeUndefined();
    resource = {};
    notifySubmissionServices(editor);
    resource = original;
    notifySubmissionServices(editor);
    expect(submission.check()).toBe("scope-ended");
  });
  it("目标移动后按原节点提交，一次提交后不能重复使用", () => {
    const editor = setup();
    const submission = captureElementSubmission(editor, {
      element: editor.children[0] as Element,
      path: [0],
    });
    Transforms.moveNodes(editor, { at: [0], to: [1] });
    expect(
      submission.commit(({ path }) => {
        Transforms.insertText(editor, "原目标", { at: Editor.start(editor, path) });
      })
    ).toEqual({ status: "committed" });
    expect(Node.string(editor.children[1])).toBe("原目标");
    const write = vi.fn(() => undefined);
    expect(submission.commit(write).status).toBe("discarded");
    expect(write).not.toHaveBeenCalled();
    expect(editor.pathRefs().size).toBe(0);
  });

  it("删除再插入相同数据不能认领旧目标", () => {
    const editor = setup();
    const original = editor.children[0] as Element;
    const submission = captureElementSubmission(editor, {
      element: original,
      path: [0],
      accept: () => true,
    });
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: [0] });
      Transforms.insertNodes(editor, structuredClone(original), { at: [0] });
    });
    expect(submission.check()).toBe("target-lost");
    expect(editor.pathRefs().size).toBe(0);
  });

  it("默认要求完整快照未变；业务可明确允许字段变化", () => {
    const editor = setup();
    const element = editor.children[0] as Element;
    const strict = captureElementSubmission(editor, { element, path: [0] });
    const permissive = captureElementSubmission(editor, { element, path: [0], accept: () => true });
    Transforms.insertText(editor, "修改", { at: Editor.start(editor, [0]) });
    expect(strict.check()).toBe("target-changed");
    expect(permissive.commit(() => undefined).status).toBe("committed");
    expect(editor.pathRefs().size).toBe(0);
  });

  it("结束后重新开启会话不会复活旧操作，也不影响其他实例", () => {
    const editor = setup(),
      other = setup();
    const stop = beginSubmissionScope(editor);
    const old = captureElementSubmission(editor, {
      element: editor.children[0] as Element,
      path: [0],
    });
    const independent = captureEditorSubmission(other);
    stop();
    const stopNew = beginSubmissionScope(editor);
    expect(old.check()).toBe("scope-ended");
    expect(old.signal.aborted).toBe(true);
    expect(editor.pathRefs().size).toBe(0);
    expect(captureEditorSubmission(editor).commit(() => undefined).status).toBe("committed");
    expect(independent.commit(() => undefined).status).toBe("committed");
    stopNew();
  });

  it("取消仅释放自己的路径与监听，取消前尚未提交", () => {
    const editor = setup();
    const controller = new AbortController();
    const first = captureElementSubmission(editor, {
      element: editor.children[0] as Element,
      path: [0],
      signal: controller.signal,
    });
    const second = captureElementSubmission(editor, {
      element: editor.children[1] as Element,
      path: [1],
    });
    expect(editor.pathRefs().size).toBe(2);
    controller.abort();
    expect(first.check()).toBe("cancelled");
    expect(editor.pathRefs().size).toBe(1);
    second.dispose();
    expect(editor.pathRefs().size).toBe(0);
  });

  it.each(["判断", "写入"])("%s异常不伪装成正常取消，同时释放引用", phase => {
    const editor = setup();
    const error = new Error("真实故障");
    const submission = captureElementSubmission(editor, {
      element: editor.children[0] as Element,
      path: [0],
      accept: () => {
        if (phase === "判断") throw error;
        return true;
      },
    });
    expect(() =>
      submission.commit(() => {
        throw error;
      })
    ).toThrow(error);
    expect(editor.pathRefs().size).toBe(0);
  });

  it("插入落点跟随原段落和文本偏移，不追随新选区", () => {
    const editor = setup();
    Transforms.select(editor, Editor.start(editor, [0]));
    const anchor = captureInsertionSubmission(editor);
    Transforms.insertText(editor, "前", { at: Editor.start(editor, [0]) });
    Transforms.insertNodes(editor, createParagraph(), { at: [0] });
    Transforms.select(editor, Editor.start(editor, [2]));
    anchor.commit(({ range }) => {
      Transforms.insertText(editor, "落点", { at: range });
    });
    expect(editor.children.map(Node.string)).toEqual(["", "前落点", ""]);
    expect(editor.pathRefs().size).toBe(0);
    expect(editor.rangeRefs().size).toBe(0);
  });

  it("原落点删除后清理两种引用，不落到当前选区", () => {
    const editor = setup();
    Transforms.select(editor, Editor.start(editor, [0]));
    const anchor = captureInsertionSubmission(editor);
    Transforms.removeNodes(editor, { at: [0] });
    expect(anchor.check()).toBe("target-lost");
    expect(editor.pathRefs().size).toBe(0);
    expect(editor.rangeRefs().size).toBe(0);
  });
});

it("节点支持等级在提交端执行，拒绝后的旧操作不能在升级为可编辑时复活", () => {
  const editor = setup();
  let editable = false;
  editor.tryGetService = id =>
    id === IElementEditingPolicy ? ({ canEdit: () => editable } as never) : undefined;
  const target = editor.children[0] as Element;
  const operation = captureElementSubmission(editor, { element: target, path: [0] });
  const write = vi.fn();
  expect(operation.commit(write)).toEqual({ status: "discarded", reason: "readonly" });
  editable = true;
  expect(operation.commit(write)).toEqual({ status: "discarded", reason: "readonly" });
  expect(write).not.toHaveBeenCalled();
  expect(editor.pathRefs().size).toBe(0);
});
