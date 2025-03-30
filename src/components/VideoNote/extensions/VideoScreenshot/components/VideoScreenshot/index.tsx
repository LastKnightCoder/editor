import React, { PropsWithChildren } from "react";
import { ReactEditor, RenderElementProps, useSlate } from "slate-react";
import classnames from "classnames";
import LocalImage from "@/components/LocalImage";
import useTheme from "@/hooks/useTheme";
import { VideoScreenshotElement } from "../../";
import styles from "./index.module.less";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
import { MdDragIndicator } from "react-icons/md";
import AddParagraph from "@/components/Editor/components/AddParagraph";
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
  const editor = useSlate();

  const { url, time, caption } = element;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element: element as unknown as Element,
    });

  const handleCaptionChange = (value: string) => {
    const path = ReactEditor.findPath(editor, element as any);
    if (!path) return;

    // @ts-ignore
    Transforms.setNodes(editor, { caption: value }, { at: path });
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
      ref={drop}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes}>
        <div
          contentEditable={false}
          className={classnames(styles.screenshot, {
            [styles.dark]: isDark,
          })}
        >
          <LocalImage
            url={url}
            className={styles.image}
            onClick={() => onSeek(time)}
          />
          <div data-slate-editor>
            <EditText
              defaultValue={caption}
              onChange={handleCaptionChange}
              contentEditable={true}
              className={styles.caption}
              onPressEnter={focusNextElement}
            />
          </div>
        </div>
        <div>{children}</div>
        <AddParagraph element={element as any} />
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
      </div>
    </div>
  );
};

export default VideoScreenshot;
