import { Editor, Transforms, Path } from "slate";
import { IHotKeyConfig } from "@/components/Editor/types";
import { VideoController } from "../VideoController";
import { createTimestampElement, createScreenshotElement } from "../utils";
import { setOrInsertNode } from "@/components/Editor/utils";
import { ReactEditor } from "slate-react";

export const createTimestampHotkey = (
  videoController: VideoController,
): IHotKeyConfig => {
  return {
    hotKey: "mod+shift+t",
    action: (editor: Editor) => {
      if (!editor.selection) return;

      const timestampNode = createTimestampElement(videoController);

      Transforms.collapse(editor, { edge: "end" });
      Transforms.insertNodes(editor, timestampNode as any);
    },
  };
};

export const createScreenshotHotkey = (
  videoController: VideoController,
): IHotKeyConfig => {
  return {
    hotKey: "mod+shift+s",
    action: async (editor: Editor) => {
      if (!editor.selection) return;

      const screenshotNode = await createScreenshotElement(videoController);
      if (!screenshotNode) return;

      const path = setOrInsertNode(editor, screenshotNode as any);
      if (!path) return;

      const nextPath = Path.next(path);
      ReactEditor.focus(editor);
      Transforms.insertNodes(
        editor,
        { type: "paragraph", children: [{ type: "formatted", text: "" }] },
        { at: nextPath, select: true },
      );
    },
  };
};
