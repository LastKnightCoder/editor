import React, { PropsWithChildren } from "react";
import { ReactEditor, RenderElementProps, useSlateStatic, useReadOnly } from "slate-react";
import classnames from "classnames";
import LocalImage from "@/components/LocalImage";
import useTheme from "@/hooks/useTheme";
import { VideoScreenshotElement } from "../../";
import {
  useDragAndDrop,
  AddParagraph,
  useDragHandlerMenu,
  EditorContextMenu,
} from "@tau/editor/src";
import { MdDragIndicator } from "react-icons/md";
import { Editor, Element, Path, Transforms } from "slate";
import EditText from "@/components/EditText";

interface VideoScreenshotProps {
  attributes: RenderElementProps["attributes"];
  element: VideoScreenshotElement;
  onSeek: (time: number) => void;
}

const VideoScreenshot: React.FC<PropsWithChildren<VideoScreenshotProps>> = ({
  attributes,
  element,
  children,
  onSeek,
}) => {
  const { isDark } = useTheme();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();

  const { url, time, caption } = element;

  const { drag, drop, isDragging, canDrag, canDrop, isOverCurrent } = useDragAndDrop({
    element: element as unknown as Element,
  });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element: element as unknown as Element,
    editor,
  });

  const handleCaptionChange = (value: string) => {
    const path = ReactEditor.findPath(editor, element as any);
    if (!path) return;

    Transforms.setNodes(editor, { caption: value } as any, { at: path });
  };

  const focusNextElement = () => {
    const path = ReactEditor.findPath(editor, element as any);
    if (!path) return;

    const nextPath = Path.next(path);
    const nextElement = Editor.node(editor, nextPath);
    if (nextElement) {
      ReactEditor.focus(editor, { retries: 1 });
      Transforms.select(editor, Editor.start(editor, nextPath));
    }
  };

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className="group/screenshot relative"
    >
      <div
        {...attributes}
        className={classnames("relative my-2", {
          "opacity-50": isDragging,
          "ring-2 ring-[var(--th-accent)]": isOverCurrent && canDrop,
        })}
      >
        <div
          contentEditable={false}
          className={classnames(
            "overflow-hidden rounded-lg",
            isDark ? "bg-zinc-800" : "bg-gray-100"
          )}
        >
          <LocalImage url={url} className="w-full cursor-pointer" onClick={() => onSeek(time)} />
          <div data-slate-editor className="px-3 py-2">
            <EditText
              defaultValue={caption}
              onChange={handleCaptionChange}
              contentEditable={true}
              className={classnames("w-full text-sm", isDark ? "text-gray-300" : "text-gray-600")}
              onPressEnter={focusNextElement}
            />
          </div>
        </div>
        <div>{children}</div>
        <AddParagraph element={element as any} />
      </div>
      {/* Drag handler - same style as Paragraph */}
      <div
        contentEditable={false}
        ref={node => {
          drag(node);
        }}
        onClick={dragHandlerProps.onClick}
        className={classnames(
          "absolute top-0 cursor-pointer opacity-0 transition-opacity group-hover/screenshot:opacity-100",
          canDrag && "opacity-100"
        )}
        style={{
          left: "-1.25em",
          width: "1.25em",
          height: "1.8em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MdDragIndicator className="h-5 w-5 text-gray-400" />
      </div>
      <EditorContextMenu {...menuProps} readonly={readOnly} />
    </div>
  );
};

export default VideoScreenshot;
