import { forwardRef, useContext, useMemo } from "react";
import { DndContext, DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import CoreEditor, { type IEditorProps } from "./core/CoreEditor";
import type { EditorRef } from "./core/types/editor";
import { createEditorKit } from "./core/kit/EditorKit";
import { useInheritedKit } from "./core/kit/context";
import { defaultExtensions } from "./presets/default";
import { IEditorSlots } from "./extensions/media/services";
import { createDefaultEditorSlots } from "./extensions/media/slots";

export interface EditorProps extends IEditorProps {
  /** 是否继承外层编辑器的组合，默认继承。 */
  inheritKit?: boolean;
}

export const Editor = forwardRef<EditorRef, EditorProps>((props, ref) => {
  const { inheritKit = true, ...editorProps } = props;
  const parentKit = useInheritedKit();
  const inherited = inheritKit ? parentKit : null;
  const { dragDropManager } = useContext(DndContext);
  const defaults = useMemo(
    () =>
      props.kit || inherited
        ? undefined
        : createEditorKit({
            extensions: [...defaultExtensions],
            services: [register => register(IEditorSlots, createDefaultEditorSlots())],
          }),
    [props.kit, inherited]
  );
  const content = (
    <CoreEditor {...editorProps} kit={props.kit ?? inherited ?? defaults} ref={ref} />
  );
  return dragDropManager ? content : <DndProvider backend={HTML5Backend}>{content}</DndProvider>;
});
Editor.displayName = "Editor";
