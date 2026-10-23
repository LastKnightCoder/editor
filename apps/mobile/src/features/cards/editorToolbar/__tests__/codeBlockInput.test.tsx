import { act, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, type Descendant, type Editor } from "slate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const codeBlockControllers = vi.hoisted(() => new Map<string, { focus: () => void }>());

vi.mock("@tau/editor/extensions/code-block/runtime", () => ({
  getCodeBlockController: (uuid: string) => codeBlockControllers.get(uuid),
}));

import {
  ALL_CODE_LANGUAGES,
  COMMON_CODE_LANGUAGES,
  focusCodeBlockInput,
  getCodeLanguageLabel,
  getCodeSymbolKeys,
  insertCodeText,
  pressCodeKey,
  resolveCodeSymbolFamily,
  setCodeBlockLanguage,
} from "../codeBlockInput";
import type { CodeEditingContext } from "../editingContext";

const INDENT = "  ";

/**
 * 按代码块组件的约定实现的受控 textarea：onKeyDown 处理 Tab / shift+Tab 与 "(" 闭合，
 * onChange 记录选区并在下次提交后恢复（同 ShikiOverlayEditor 的选区快照）。
 */
function ControlledCodeInput(props: { initial: string; onValue: (value: string) => void }) {
  const [value, setValue] = useState(props.initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    const pending = pendingSelection.current;
    if (textarea && pending) {
      textarea.setSelectionRange(pending[0], pending[1]);
      pendingSelection.current = null;
    }
  }, [value]);

  const commit = (next: string, caret: number) => {
    pendingSelection.current = [caret, caret];
    setValue(next);
    props.onValue(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    if (event.key === "(") {
      event.preventDefault();
      commit(`${value.slice(0, start)}(${value.slice(start, end)})${value.slice(end)}`, start + 1);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      if (event.nativeEvent.shiftKey) {
        if (!value.startsWith(INDENT, lineStart)) return;
        commit(
          `${value.slice(0, lineStart)}${value.slice(lineStart + INDENT.length)}`,
          Math.max(lineStart, start - INDENT.length)
        );
      } else {
        commit(`${value.slice(0, lineStart)}${INDENT}${value.slice(lineStart)}`, start + 2);
      }
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onKeyDown={handleKeyDown}
      onChange={event => {
        pendingSelection.current = [event.target.selectionStart, event.target.selectionEnd];
        setValue(event.target.value);
        props.onValue(event.target.value);
      }}
    />
  );
}

describe("代码块输入：pressCodeKey / insertCodeText", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latestValue: string | null;

  const renderInput = (initial: string) => {
    latestValue = null;
    act(() => {
      root.render(
        <ControlledCodeInput initial={initial} onValue={value => (latestValue = value)} />
      );
    });
    const textarea = host.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();
    return textarea;
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("派发的 keydown 由 React onKeyDown 处理：( 自动闭合，光标在括号内", () => {
    const textarea = renderInput("fn");
    textarea.setSelectionRange(2, 2);
    act(() => pressCodeKey(textarea, "("));
    expect(latestValue).toBe("fn()");
    expect(textarea.value).toBe("fn()");
    expect(textarea.selectionStart).toBe(3);
  });

  it("Tab 缩进当前行，shift+Tab 反缩进", () => {
    const textarea = renderInput("a\nb");
    textarea.setSelectionRange(3, 3);
    act(() => pressCodeKey(textarea, "Tab"));
    expect(textarea.value).toBe("a\n  b");
    expect(textarea.selectionStart).toBe(5);

    act(() => pressCodeKey(textarea, "Tab", { shiftKey: true }));
    expect(textarea.value).toBe("a\nb");
    expect(textarea.selectionStart).toBe(3);
  });

  it("组件未处理的单字符键按文本插入，经 onChange 更新受控值", () => {
    const textarea = renderInput("ab");
    textarea.setSelectionRange(1, 1);
    act(() => pressCodeKey(textarea, ";"));
    expect(latestValue).toBe("a;b");
    expect(textarea.value).toBe("a;b");
    expect(textarea.selectionStart).toBe(2);
  });

  it("insertCodeText 替换选中文本，光标落在插入文本之后", () => {
    const textarea = renderInput("const x = 1");
    textarea.setSelectionRange(6, 7);
    act(() => insertCodeText(textarea, "=>"));
    expect(latestValue).toBe("const => = 1");
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(8);
  });

  it("只读 textarea 不插入", () => {
    const textarea = renderInput("ab");
    textarea.readOnly = true;
    act(() => insertCodeText(textarea, "x"));
    expect(latestValue).toBeNull();
    expect(textarea.value).toBe("ab");
  });
});

describe("代码块符号键与语言", () => {
  it("按语言族给出符号键，未识别语言走默认集合", () => {
    expect(resolveCodeSymbolFamily("ts")).toBe("c-like");
    expect(resolveCodeSymbolFamily("JSON")).toBe("c-like");
    expect(resolveCodeSymbolFamily("py")).toBe("python");
    expect(resolveCodeSymbolFamily("bash")).toBe("shell");
    expect(resolveCodeSymbolFamily("sql")).toBe("sql");
    expect(resolveCodeSymbolFamily("md")).toBe("markdown");
    expect(resolveCodeSymbolFamily("")).toBe("default");
    expect(resolveCodeSymbolFamily(undefined)).toBe("default");

    expect(getCodeSymbolKeys("ts").map(key => key.label)).toEqual([
      "Tab",
      "(",
      ")",
      "{",
      "}",
      "[",
      "]",
      ";",
      "=",
      '"',
      "'",
      "/",
      "=>",
    ]);
    expect(getCodeSymbolKeys("markdown")[0]).toEqual({ kind: "key", label: "#", key: "#" });
    expect(getCodeSymbolKeys("ts").at(-1)).toEqual({ kind: "text", label: "=>", text: "=>" });
  });

  it("语言标签取规范显示名，空与纯文本显示「纯文本」", () => {
    expect(getCodeLanguageLabel("ts")).toBe("TypeScript");
    expect(getCodeLanguageLabel("")).toBe("纯文本");
    expect(getCodeLanguageLabel("plaintext")).toBe("纯文本");
  });

  it("常用语言 12 种且都在完整语言表中", () => {
    expect(COMMON_CODE_LANGUAGES.map(option => option.label)).toEqual([
      "TypeScript",
      "JavaScript",
      "Python",
      "Java",
      "Go",
      "Rust",
      "C++",
      "Shell",
      "JSON",
      "SQL",
      "Markdown",
      "纯文本",
    ]);
    const allValues = new Set(ALL_CODE_LANGUAGES.map(option => option.value));
    expect(COMMON_CODE_LANGUAGES.every(option => allValues.has(option.value))).toBe(true);
  });
});

describe("setCodeBlockLanguage / focusCodeBlockInput", () => {
  const createCodeEditor = () => {
    const editor = createEditor();
    editor.children = [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      {
        type: "code-block",
        uuid: "code-1",
        language: "ts",
        code: "",
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[];
    const execute = vi.fn(() => true);
    (editor as Editor & { commands: unknown }).commands = { execute };
    return { editor, execute };
  };

  const codeContext = (overrides: Partial<CodeEditingContext> = {}): CodeEditingContext => ({
    kind: "code",
    element: { type: "code-block", children: [] } as never,
    path: [1],
    textarea: document.createElement("textarea"),
    uuid: "code-1",
    language: "ts",
    ...overrides,
  });

  afterEach(() => {
    codeBlockControllers.clear();
    document.body.innerHTML = "";
  });

  it("按路径取当前节点执行 set-language 命令（不用上下文里可能过期的节点）", () => {
    const { editor, execute } = createCodeEditor();
    expect(setCodeBlockLanguage(editor, codeContext(), "Python")).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      "tau.code-block.set-language",
      { language: "Python" },
      editor.children[1],
      [1]
    );
  });

  it("路径处不是同一代码块时不执行", () => {
    const { editor, execute } = createCodeEditor();
    expect(setCodeBlockLanguage(editor, codeContext({ uuid: "other" }), "Go")).toBe(false);
    expect(setCodeBlockLanguage(editor, codeContext({ path: [0] }), "Go")).toBe(false);
    expect(setCodeBlockLanguage(editor, codeContext({ path: [5] }), "Go")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("聚焦优先走代码块控制器，未注册时聚焦上下文中的 textarea", () => {
    const focus = vi.fn();
    codeBlockControllers.set("code-1", { focus });
    focusCodeBlockInput(codeContext());
    expect(focus).toHaveBeenCalled();

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    focusCodeBlockInput(codeContext({ uuid: "missing", textarea }));
    expect(document.activeElement).toBe(textarea);
  });
});
