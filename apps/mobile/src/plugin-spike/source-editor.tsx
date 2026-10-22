import { useState } from "react";
import { useReadOnly } from "slate-react";
import { usePluginEnvironment, type SourceBlockEditorProps } from "@tau/plugins";
import { sourceEditorRuntime, elementRuntime } from "@tau/editor/source";
import { configureSourceEditor } from "@tau/plugins/source-editor-host";
import { useSheetBackDismiss } from "../router/useSheetBackDismiss";

function MobileSourceEditor({ initValue, onChange, children, title }: SourceBlockEditorProps) {
  const [editing, setEditing] = useState(false);
  const readOnly = useReadOnly();
  useSheetBackDismiss(editing, () => setEditing(false));
  return (
    <div contentEditable={false} data-spike-source-mode="mobile">
      <div>{children}</div>
      {!readOnly && (
        <button
          className="rounded-tau-md bg-accent-soft p-3"
          data-spike-edit-source
          onClick={() => setEditing(true)}
        >
          编辑{title}源码
        </button>
      )}
      {editing && (
        <section
          role="dialog"
          aria-label={`${title}源码`}
          data-spike-source-dialog
          className="bg-page fixed inset-0 z-[400] flex flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
        >
          <button
            className="self-start p-3"
            data-spike-close-source
            onClick={() => setEditing(false)}
          >
            返回预览
          </button>
          <textarea
            aria-label={`${title}源码`}
            data-spike-source-input
            className="bg-surface min-h-48 flex-1 p-3 font-mono"
            value={initValue}
            onChange={event => onChange(event.target.value)}
          />
        </section>
      )}
    </div>
  );
}

const DesktopSourceEditor = sourceEditorRuntime.SourceBlockEditor;

function AdaptiveSourceEditor(props: SourceBlockEditorProps) {
  const environment = usePluginEnvironment();
  return environment.platform === "desktop" ? (
    <div data-spike-source-mode="desktop">
      <DesktopSourceEditor {...props} />
    </div>
  ) : (
    <MobileSourceEditor {...props} />
  );
}

export function configureSpikeSourceEditor() {
  configureSourceEditor({
    ...sourceEditorRuntime,
    SourceBlockEditor: AdaptiveSourceEditor,
    useSourceBlock(element) {
      const source = sourceEditorRuntime.useSourceBlock(element);
      const access = elementRuntime.useElement(element);
      return { ...source, update: access.update };
    },
  });
}
