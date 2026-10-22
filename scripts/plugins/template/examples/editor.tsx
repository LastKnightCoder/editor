/* eslint-disable react-refresh/only-export-components -- 插件入口导出定义，组件由宿主装配。 */
import {
  definePlugin,
  defineEditorElement,
  defineEditorExtension,
  useElement,
  usePluginEnvironment,
  type EditorElementRenderProps,
} from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };
interface NoteElement {
  type: "example.note";
  text: string;
  children: { type: "formatted"; text: string }[];
}
declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.note": NoteElement;
  }
}

function Note({ attributes, element, children }: EditorElementRenderProps<NoteElement>) {
  const access = useElement(element);
  const environment = usePluginEnvironment();
  return (
    <div {...attributes}>
      <div contentEditable={false} className={environment.layout === "compact" ? "p-2" : "p-4"}>
        {access.readOnly ? (
          <p>{element.text}</p>
        ) : (
          <input
            aria-label="便笺内容"
            value={element.text}
            onChange={event => access.update({ text: event.target.value })}
          />
        )}
      </div>
      {children}
    </div>
  );
}
function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 3h14v18H5zM8 8h8M8 12h8" />
    </svg>
  );
}

export default definePlugin({
  ...__PLUGIN_META__,
  editorExtensions: [
    defineEditorExtension({
      id: "example.note",
      elements: [
        defineEditorElement<NoteElement>({
          type: "example.note",
          kind: "block",
          isVoid: true,
          drag: true,
          render: Note,
        }),
      ],
      blockPanel: [
        {
          icon: NoteIcon,
          title: "便笺",
          keywords: ["note"],
          description: "插入便笺",
          onClick: editor =>
            editor.insertNode({
              type: "example.note",
              text: "",
              children: [{ type: "formatted", text: "" }],
            }),
        },
      ],
    }),
  ],
});
