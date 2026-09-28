import type { Descendant } from "slate";

export interface AudioElement {
  type: "audio";
  src: string;
  /** 播放卡标题，上传时默认取文件名 */
  title?: string;
  uploading?: boolean;
  /** 上传占位期间用于跨编辑定位的稳定标识 */
  uuid?: string;
  isFromGenerate?: boolean;
  audioText?: string;
  children: Descendant[];
}
