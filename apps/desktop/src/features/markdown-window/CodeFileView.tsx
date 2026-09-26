import { forwardRef, useCallback, useImperativeHandle, useRef, useState, useEffect } from "react";
import type { Editor } from "codemirror";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/jsx/jsx.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/mode/python/python.js";
import "codemirror/mode/go/go.js";
import "codemirror/mode/rust/rust.js";
import "codemirror/mode/clike/clike.js";
import "codemirror/mode/shell/shell.js";
import "codemirror/mode/sql/sql.js";
import "codemirror/mode/vue/vue.js";
import "codemirror/mode/markdown/markdown.js";
import "codemirror/mode/ruby/ruby.js";
import "codemirror/mode/php/php.js";
import "codemirror/mode/swift/swift.js";
import "codemirror/mode/clojure/clojure.js";
import "codemirror/mode/lua/lua.js";
import "codemirror/mode/r/r.js";
import "codemirror/mode/dart/dart.js";
import "codemirror/mode/elm/elm.js";
import "codemirror/mode/erlang/erlang.js";
import "codemirror/mode/dockerfile/dockerfile.js";
import "codemirror/mode/toml/toml.js";
import "codemirror/mode/properties/properties.js";
import { Loading, cn, useEdgeFade, FADE_SCROLL_CLASS } from "@tau/ui";
import { getCodeMirrorMode } from "./fileTypes";
import { splitExtension, baseName } from "./paths";
import { FileBanner, FileStatusBar } from "./FileChrome";
import { useTextFileSession } from "./useTextFileSession";
import { CodeMirrorView } from "./markdown/CodeMirrorView";
import type { FileViewHandle, FileViewStatus } from "./types";

/** 代码 / 配置文件：CodeMirror 编辑，自动保存 + ⌘S，外部修改同 Markdown 处理 */
export const CodeFileView = forwardRef<
  FileViewHandle,
  { path: string; onStatus(status: FileViewStatus): void; onSaveAs(text: string): void }
>(function CodeFileView({ path, onStatus, onSaveAs }, ref) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  const textRef = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);

  const getText = useCallback(() => textRef.current ?? "", []);
  const applyExternalText = useCallback((text: string) => {
    textRef.current = text;
    editorRef.current?.setValue(text);
  }, []);
  const session = useTextFileSession({ path, getText, applyExternalText });
  if (session.initialText !== null && textRef.current === null)
    textRef.current = session.initialText;

  useImperativeHandle(ref, () => ({ flush: session.flush }), [session.flush]);

  const dirty = session.saveState === "dirty" || session.conflict !== null || session.missing;
  useEffect(() => onStatus({ dirty }), [dirty, onStatus]);

  const onMount = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
  }, []);

  if (session.loadError) {
    return (
      <div className="text-tau-meta text-ink-2 grid flex-1 place-items-center px-8 text-center">
        无法读取文件：{session.loadError}
      </div>
    );
  }
  if (session.initialText === null) return <Loading />;

  const ext = splitExtension(baseName(path)).ext.slice(1).toUpperCase() || "文本";
  return (
    <>
      {session.conflict !== null && (
        <FileBanner
          tone="warn"
          actions={[
            { label: "载入外部版本", onClick: session.loadExternal },
            { label: "保留我的版本", primary: true, onClick: () => void session.keepMine() },
          ]}
        >
          文件已在外部修改，与你未保存的内容冲突
        </FileBanner>
      )}
      {session.missing && (
        <FileBanner
          tone="danger"
          actions={[
            { label: "重新保存", onClick: () => void session.resave() },
            { label: "另存为…", onClick: () => onSaveAs(getText()) },
          ]}
        >
          文件已不在磁盘上（被删除或移动），内容仍保留在窗口里
        </FileBanner>
      )}
      <div ref={setScrollEl} className={cn(FADE_SCROLL_CLASS, "min-h-0 flex-1 px-5 py-4")}>
        <CodeMirrorView
          value={session.initialText}
          mode={getCodeMirrorMode(path)}
          scrollEl={scrollEl}
          onMount={onMount}
          onSave={() => void session.save()}
          onCursorChange={setCursor}
          onChange={(text, origin) => {
            textRef.current = text;
            if (origin !== "setValue") session.markDirty();
          }}
          className="[&_.CodeMirror]:text-[12.5px]"
        />
      </div>
      <FileStatusBar cursor={cursor} saveState={session.saveState}>
        <span>{ext}</span>
      </FileStatusBar>
    </>
  );
});
