import { Editor, Transforms } from "slate";
import { v4 as getUuid } from "uuid";
import { setOrInsertNode } from "@tau/editor/api";
import type { ImageElement, InlineImageElement, AudioElement, VideoElement } from "../types";

interface ImageParams {
  url: string;
  alt?: string;
  uuid?: string;
  pasteUploading?: boolean;
}

export const createImageElement = (params: ImageParams) => {
  const image: ImageElement = {
    type: "image",
    ...params,
    uuid: params.uuid || getUuid(),
    children: [{ type: "formatted", text: "" }],
  };
  return image;
};
export const insertImage = (editor: Editor, params: ImageParams) =>
  setOrInsertNode(editor, createImageElement(params));

interface AudioParams {
  src: string;
  title?: string;
  uploading?: boolean;
}

export const createAudioElement = (params: AudioParams) => {
  const audio: AudioElement = {
    type: "audio",
    ...params,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  };
  return audio;
};
export const insertAudio = (editor: Editor, params: AudioParams) =>
  setOrInsertNode(editor, createAudioElement(params));

interface VideoParams {
  src: string;
  uploading?: boolean;
  playbackRate?: number;
  metaInfo?: VideoElement["metaInfo"];
}

export const createVideoElement = (params: VideoParams) => {
  const video: VideoElement = {
    type: "video",
    ...params,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  };
  return video;
};
export const insertVideo = (editor: Editor, params: VideoParams) =>
  setOrInsertNode(editor, createVideoElement(params));

interface InlineImageParams {
  url: string;
  alt?: string;
  uuid?: string;
}

export const insertInlineImage = (editor: Editor, params: InlineImageParams) => {
  const inlineImage: InlineImageElement = {
    type: "inline-image",
    ...params,
    uuid: params.uuid || getUuid(),
    children: [{ type: "formatted", text: "" }],
  };

  if (editor.selection) {
    Transforms.insertNodes(editor, inlineImage);
  } else {
    Transforms.insertNodes(editor, inlineImage, { at: Editor.end(editor, []) });
  }
};
