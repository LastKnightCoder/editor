import { forwardRef, useContext, useMemo } from "react";
import { DndContext, DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { UiProvider } from "@tau/ui";
import CoreEditor, { type IEditorProps } from "./core/CoreEditor";
import type { EditorRef } from "./core/types/editor";
import { createEditorKit } from "./core/kit/EditorKit";
import { useInheritedKit } from "./core/kit/context";
import { defaultExtensions } from "./presets/default";
import { IEditorSlots } from "./extensions/media/services";
import { createDefaultEditorSlots } from "./extensions/media/slots";

export type EditorProps = IEditorProps;

export const Editor = forwardRef<EditorRef, EditorProps>((props, ref) => {
  const inherited = useInheritedKit();
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
  if (props.kit || inherited) return <CoreEditor {...props} ref={ref} />;
  const content = (
    <UiProvider>
      <CoreEditor {...props} kit={defaults} ref={ref} />
    </UiProvider>
  );
  return dragDropManager ? content : <DndProvider backend={HTML5Backend}>{content}</DndProvider>;
});
Editor.displayName = "Editor";
