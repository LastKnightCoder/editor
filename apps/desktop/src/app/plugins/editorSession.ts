import { HistoryEditor, type History } from "slate-history";
import { Transforms, type Descendant, type Editor, type Range } from "slate";
import type { PluginEditorContribution } from "@tau/plugins";
import type { DesktopPluginRuntime } from "./runtime";
import { composePluginEditor } from "./editorComposition";

/** 开发台的本地文档会话；不用于 Y.Doc 或外部历史的正文编辑器。 */
export class PluginEditorSession {
  private editor?: Editor;
  private contributions: PluginEditorContribution[] = [];
  private history: History = { undos: [], redos: [] };
  private selection: Range | null = null;
  private listeners = new Set<() => void>();
  private state = {
    generation: 0,
    ...composePluginEditor([]),
    initialValue: [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ] as Descendant[],
    value: [] as Descendant[],
  };

  constructor(private readonly runtime: DesktopPluginRuntime) {
    this.state.value = this.state.initialValue;
    this.refresh();
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect = () => {
    const unsubscribe = this.runtime.subscribe(this.refresh);
    this.refresh();
    return unsubscribe;
  };

  getEditor = () => this.editor;

  attach = (editor: Editor) => {
    this.editor = editor;
    editor.history = structuredClone(this.history);
    const selection = this.selection;
    if (selection) HistoryEditor.withoutSaving(editor, () => Transforms.select(editor, selection));
  };

  change(value: Descendant[], generation: number) {
    if (generation !== this.state.generation) return;
    this.state = { ...this.state, value };
    this.publish();
  }

  private refresh = () => {
    const next = this.runtime.getEditorContributions();
    if (
      next.length === this.contributions.length &&
      next.every((item, index) => item === this.contributions[index])
    )
      return;
    const composition = composePluginEditor(next);
    const value = structuredClone(this.editor?.children ?? this.state.value);
    if (this.editor) {
      this.history = structuredClone(this.editor.history);
      this.selection = structuredClone(this.editor.selection);
    }
    this.editor = undefined;
    this.contributions = next;
    this.state = {
      generation: this.state.generation + 1,
      ...composition,
      initialValue: value,
      value,
    };
    this.publish();
  };

  private publish() {
    this.listeners.forEach(listener => listener());
  }
}
