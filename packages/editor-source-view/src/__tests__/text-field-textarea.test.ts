import { describe, expect, it, vi } from "vitest";
import { bindTextFieldTextarea } from "../textFieldTextarea";
import { Field } from "./fixtures/textField";

function setup(value: string) {
  const field = new Field(value);
  const input = document.createElement("textarea");
  const errors = vi.fn(),
    values = vi.fn();
  const binding = bindTextFieldTextarea(input, field, values, errors);
  const type = (text: string, cursor = text.length) => {
    input.value = text;
    input.setSelectionRange(cursor, cursor);
    input.dispatchEvent(new Event("input"));
  };
  return { field, input, errors, values, binding, type };
}

describe("原生源码输入增量绑定", () => {
  it("连续同步输入不依赖 React 渲染，远端前插同步平移选区", () => {
    const { field, input, errors, binding, type } = setup("a");
    type("ab");
    type("abc", 2);
    expect(field.getSnapshot().value).toBe("abc");
    field.remote(0, 0, "远端");
    expect(input.value).toBe("远端abc");
    expect(input.selectionStart).toBe(4);
    type("远端ab中c", 5);
    expect(field.getSnapshot().value).toBe("远端ab中c");
    expect(errors).not.toHaveBeenCalled();
    binding.dispose();
  });

  it("输入法替换期间保留远端插入，组合结束一次提交", () => {
    const { field, input, errors, binding, type } = setup("abcd");
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    type("a中d", 2);
    expect(field.writes).toBe(0);
    field.remote(2, 0, "远端");
    expect(input.value).toBe("a中d");
    input.dispatchEvent(new CompositionEvent("compositionend"));
    expect(field.getSnapshot().value).toBe("a中远端d");
    expect(input.value).toBe("a中远端d");
    expect(field.writes).toBe(1);
    expect(input.selectionStart).toBe(2);
    expect(errors).not.toHaveBeenCalled();
    binding.dispose();
  });

  it("组合期间远端删除与多轮插入不恢复已删除字符", () => {
    const { field, input, errors, binding, type } = setup("abcd");
    input.dispatchEvent(new CompositionEvent("compositionstart"));
    type("ab中cd", 3);
    field.remote(0, 1, "");
    field.remote(1, 0, "远");
    field.remote(2, 1, "端");
    input.dispatchEvent(new Event("blur"));
    expect(field.getSnapshot().value).toBe("b远端中d");
    expect(input.value).toBe(field.getSnapshot().value);
    expect(errors).not.toHaveBeenCalled();
    binding.dispose();
  });

  it("拒绝写入时保留草稿，解绑后迟到事件不写入任何字段", () => {
    const { field, input, errors, binding, type } = setup("原文");
    field.writable = false;
    type("未提交草稿");
    expect(field.getSnapshot().value).toBe("原文");
    expect(input.value).toBe("未提交草稿");
    expect(input.readOnly).toBe(true);
    expect(errors).toHaveBeenCalledOnce();
    binding.dispose();
    field.writable = true;
    input.dispatchEvent(new CompositionEvent("compositionend"));
    input.dispatchEvent(new Event("input"));
    expect(field.writes).toBe(0);
  });
});
