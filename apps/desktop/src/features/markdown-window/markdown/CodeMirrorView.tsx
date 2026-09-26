import { useEffect, useRef } from "react";
import { UnControlled as CodeMirror } from "react-codemirror2";
import type { Editor, EditorConfiguration } from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/addon/edit/closebrackets.js";
import "codemirror/addon/selection/active-line.js";
import { cn } from "@tau/ui";
import styles from "@/styles/tauCodeMirror.module.css";
import { scrollSourceCursorIntoView } from "./scrollSourceCursorIntoView";

/**
 * CodeMirror 5 视图（Markdown 源码 / 代码文件共用）：非受控，value 只在挂载时生效，之后由调用方
 * 经 onMount 拿到实例 setValue；高度随内容增长，外层滚动容器负责滚动并跟随光标。
 */
export function CodeMirrorView({
  value,
  mode,
  scrollEl,
  onChange,
  onCursorChange,
  onMount,
  onSave,
  className,
}: {
  value: string;
  mode: EditorConfiguration["mode"];
  scrollEl: HTMLElement | null;
  /** origin 为 "setValue" 表示程序写入（非用户输入） */
  onChange(text: string, origin: string | undefined): void;
  onCursorChange?(position: { line: number; column: number }): void;
  onMount?(editor: Editor | null): void;
  onSave?(): void;
  className?: string;
}) {
  const initialValue = useRef(value).current;
  const editorRef = useRef<Editor | null>(null);
  const latest = useRef({ scrollEl, onCursorChange, onSave });
  latest.current = { scrollEl, onCursorChange, onSave };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let raf = 0;
    const follow = () => {
      const { line, ch } = editor.getCursor();
      latest.current.onCursorChange?.({ line: line + 1, column: ch + 1 });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const container = latest.current.scrollEl;
        // 隐藏时（富文本模式下常驻挂载的源码编辑器）不跟随
        if (container && editor.getWrapperElement().offsetParent) {
          scrollSourceCursorIntoView(editor, container);
        }
      });
    };
    editor.on("cursorActivity", follow);
    return () => {
      editor.off("cursorActivity", follow);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => () => onMount?.(null), [onMount]);

  return (
    <div
      className={cn(
        styles.root,
        "[&_.CodeMirror]:text-[13px] [&_.CodeMirror]:leading-[1.85]",
        "[&_.CodeMirror-activeline-background]:bg-hover",
        className
      )}
    >
      <CodeMirror
        value={initialValue}
        autoCursor={false}
        options={{
          mode,
          lineNumbers: true,
          lineWrapping: true,
          viewportMargin: Infinity,
          indentUnit: 2,
          tabSize: 2,
          autoCloseBrackets: true,
          styleActiveLine: true,
          inputStyle: "textarea",
          extraKeys: {
            "Shift-Tab": "indentLess",
            "Cmd-S": () => latest.current.onSave?.(),
            "Ctrl-S": () => latest.current.onSave?.(),
          },
        }}
        editorDidMount={editor => {
          editorRef.current = editor;
          onMount?.(editor);
        }}
        onChange={(_editor, change, next) => onChange(next, change.origin)}
      />
    </div>
  );
}
