import { CommonElement } from "../plugins";

/** 视频插件提供的视频：type 为宿主视频提供方 ID，其余字段由提供方解释，白板只透传。 */
export interface OnlineVideoMeta {
  type: string;
  title?: string;
  [key: string]: unknown;
}

export interface VideoElement extends CommonElement {
  src: string;
  videoNoteId?: number;
  // 视频的自然宽高，用于在 Column 等容器中保持宽高比
  naturalWidth?: number;
  naturalHeight?: number;
  metaInfo?:
    { type: "local"; filePath: string } | { type: "remote"; url: string } | OnlineVideoMeta;
}
