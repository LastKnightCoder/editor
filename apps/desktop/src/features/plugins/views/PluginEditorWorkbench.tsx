import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Editor } from "@tau/editor";
import { Button, Panel } from "@tau/ui";
import { PluginEditorSession } from "@/app/plugins/editorSession";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";

export function PluginEditorWorkbench({ runtime }: { runtime: DesktopPluginRuntime }) {
  const [session] = useState(() => new PluginEditorSession(runtime));
  const [readonly, setReadonly] = useState(false);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => session.connect(), [session]);
  return (
    <Panel>
      <h2 className="text-tau-body text-ink-1 font-semibold">编辑器插件实验文档</h2>
      <p className="text-tau-meta text-ink-2 my-2">
        内容仅在本页面内保留。启停扩展会重建编辑器并恢复正文、选区和撤销历史；关闭页面或切库后清空。
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {state.kit.assembly.commands
          .list()
          .filter(({ command }) => command.title)
          .map(({ command }) => (
            <Button
              key={command.id}
              disabled={readonly}
              onMouseDown={event => event.preventDefault()}
              onClick={() => session.getEditor()?.commands?.execute(command.id)}
            >
              {command.title}
            </Button>
          ))}
        <Button
          disabled={readonly}
          onMouseDown={event => event.preventDefault()}
          onClick={() => session.getEditor()?.undo()}
        >
          撤销
        </Button>
        <Button
          disabled={readonly}
          onMouseDown={event => event.preventDefault()}
          onClick={() => session.getEditor()?.redo()}
        >
          重做
        </Button>
        <Button onClick={() => setReadonly(value => !value)}>
          {readonly ? "恢复编辑" : "切换只读"}
        </Button>
      </div>
      <Editor
        key={state.generation}
        kit={state.kit}
        initValue={state.initialValue}
        readonly={readonly}
        onInit={session.attach}
        onChange={value => session.change(value, state.generation)}
      />
      <details className="text-tau-meta text-ink-2 mt-4">
        <summary>当前 Markdown</summary>
        <pre className="whitespace-pre-wrap break-words">
          {state.markdown.getMarkdown(state.value)}
        </pre>
      </details>
    </Panel>
  );
}
