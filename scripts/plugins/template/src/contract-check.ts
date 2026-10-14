import { defineEditorElement, type EditorElementRenderProps } from "@tau/plugins";

declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.external-counter.note": {
      type: "example.external-counter.note";
      children: { text: string }[];
    };
  }
}

defineEditorElement({
  type: "example.external-counter.note",
  kind: "block",
  render: (props: EditorElementRenderProps) => props.children,
});

// @ts-expect-error 宿主入口不对独立作者开放。
import type { PluginHost } from "@tau/plugins/host";
// @ts-expect-error 内部编辑器包不成为作者依赖。
import type { EditorKit } from "@tau/editor";
type Forbidden = PluginHost | EditorKit;
export type { Forbidden };
