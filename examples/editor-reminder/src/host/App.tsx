import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createThemeRuntime } from "@tau/themes/react";
import { reminderExtension } from "@example/editor-reminder";
import { exampleMarkdown } from "./markdown";

export const exampleKit = createEditorKit({ extensions: [reminderExtension] });
const initialValue = exampleMarkdown.importFromMarkdown(
  ":::example-reminder{done=false}\n试着编辑正文，再点击提醒块左侧手柄打开菜单。\n:::"
);
const theme = createThemeRuntime({ storage: () => null });

export function App() {
  const ref = useRef<EditorRef>(null);
  const [readonly, setReadonly] = useState(false);
  const [value, setValue] = useState<Descendant[]>(initialValue);
  const [session, setSession] = useState({ revision: 0, initialValue });
  const markdown = useMemo(() => exampleMarkdown.getMarkdown(value), [value]);
  useLayoutEffect(() => theme.init({ forceMode: "light" }), []);
  const insert = () => {
    const editor = ref.current?.getEditor();
    if (!editor || readonly) return;
    if (!editor.selection) Transforms.select(editor, SlateEditor.end(editor, []));
    editor.commands?.execute("example.reminder.insert");
  };
  return (
    <main className="text-ink-1 mx-auto max-w-5xl space-y-5 p-8">
      <h1 className="text-2xl font-semibold">公开扩展示例：提醒块</h1>
      <p className="text-ink-2">
        节点、状态命令、手柄菜单和 Markdown 由示例扩展提供。核心只提供段落与编辑机制。
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={readonly}
          onMouseDown={event => event.preventDefault()}
          onClick={insert}
          className="border-line-1 rounded border px-3 py-2 disabled:opacity-50"
        >
          插入提醒
        </button>
        <button
          type="button"
          aria-pressed={readonly}
          onClick={() => setReadonly(!readonly)}
          className="border-line-1 rounded border px-3 py-2"
        >
          {readonly ? "恢复编辑" : "切换只读"}
        </button>
        <button
          type="button"
          disabled={readonly}
          onClick={() =>
            setSession(previous => ({
              revision: previous.revision + 1,
              initialValue: exampleMarkdown.importFromMarkdown(markdown),
            }))
          }
          className="border-line-1 rounded border px-3 py-2 disabled:opacity-50"
        >
          从 Markdown 重新载入
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="border-line-1 bg-surface min-h-64 rounded-lg border p-6">
          <h2 className="mb-4 font-medium">编辑器</h2>
          <DndProvider backend={HTML5Backend}>
            <Editor
              key={session.revision}
              ref={ref}
              kit={exampleKit}
              initValue={session.initialValue}
              readonly={readonly}
              onChange={setValue}
            />
          </DndProvider>
        </section>
        <section className="border-line-1 bg-surface rounded-lg border p-6">
          <h2 className="mb-4 font-medium">当前 Markdown</h2>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm">{markdown}</pre>
        </section>
      </div>
    </main>
  );
}
