/**
 * 元素类型：只做类型引用（运行时擦除），不引入编辑器运行时代码。
 * 业务元素（desktop 的 file-attachment 等）暂在此声明，拆出为宿主注入的 codec 后移走。
 */
import type { Descendant } from "slate";

// 直接指向元素类型文件，不经 types/index（它会带出编辑器的服务与 React 类型）
export type { CustomElement } from "@tau/editor/src/types/custom-element.ts";
export type { FormattedText, HighlightColor } from "@tau/editor/src/types/text.ts";
export type { AudioElement } from "@tau/editor/src/types/element/audio.ts";
export type { HTMLBlockElement } from "@tau/editor/src/types/element/html-block.ts";
export type { ImageElement } from "@tau/editor/src/types/element/image.ts";
export type { StyledTextElement } from "@tau/editor/src/types/element/styled-text.ts";
export type { VideoElement } from "@tau/editor/src/types/element/video.ts";

export interface FileAttachmentElement {
  type: "file-attachment";
  fileName: string;
  filePath: string;
  localFilePath?: string;
  isLocal: boolean;
  uuid: string;
  children: Descendant[];
}
