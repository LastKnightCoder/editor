import type { Descendant } from "slate";

/**
 * 视频元素的业务元数据：编辑器不理解其内部结构，仅透传保存。
 * `type` 字段作为内容源判别标识，
 * 由宿主注册的 VideoContentProvider 依据它匹配渲染。
 */
export type VideoElementMeta = { type?: string } & Record<string, unknown>;

export interface VideoElement {
  type: "video";
  src: string;
  playbackRate?: number;
  uploading?: boolean;
  /** 上传占位期间用于跨编辑定位的稳定标识 */
  uuid?: string;
  width?: number;
  // 对齐方式：控制视频位置（默认 center）
  align?: "left" | "center" | "right";
  metaInfo?: VideoElementMeta;
  children: Descendant[];
}
