import { Descendant } from "slate";

export interface AudioElement {
  type: "audio";
  src: string;
  /** 播放卡标题，上传时默认取文件名 */
  title?: string;
  uploading?: boolean;
  isFromGenerate?: boolean;
  audioText?: string;
  children: Descendant[];
}
