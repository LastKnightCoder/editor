import React, { PropsWithChildren } from "react";
import { ReactEditor, RenderElementProps, useSlateStatic } from "slate-react";
import classnames from "classnames";
import LocalImage from "@/components/LocalImage";
import useTheme from "@/hooks/useTheme";
import { VideoScreenshotElement } from "../../";
import { AddParagraph } from "@tau/editor";
import { Editor, Path, Transforms } from "slate";
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

  const { url, time, caption } = element;

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
    <div className="group/screenshot relative">
      <div {...attributes} className="relative my-2">
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
    </div>
  );
};

export default VideoScreenshot;
