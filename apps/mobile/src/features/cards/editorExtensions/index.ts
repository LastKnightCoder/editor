import type { EditorExtension } from "@tau/editor";
import { mobileContentLinkExtension } from "./contentLinkExtension";
import {
  mobileFileAttachmentExtension,
  mobileWhiteboardExtension,
  mobileDatabaseExtension,
} from "./passiveExtensions";

/** content 正文在 mobile 上要覆盖的业务元素（清单见 @tau/shared 的 CONTENT_ELEMENT_TYPES） */
export const mobileCardPreviewExtensions: EditorExtension[] = [
  mobileContentLinkExtension,
  mobileFileAttachmentExtension,
  mobileWhiteboardExtension,
  mobileDatabaseExtension,
];
