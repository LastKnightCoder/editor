import type { AnyExtension } from "@tau/editor";
import { mobileContentLinkExtension } from "./contentLinkExtension";
import { mobileFileAttachmentExtension } from "./passiveExtensions";
import { mobileWhiteboardExtension, mobileDatabaseExtension } from "./privateBlockExtensions";

/** content 正文在 mobile 上要覆盖的业务元素（清单见 @tau/shared 的 CONTENT_ELEMENT_TYPES） */
export const mobileCardPreviewExtensions: AnyExtension[] = [
  mobileContentLinkExtension,
  mobileFileAttachmentExtension,
  mobileWhiteboardExtension,
  mobileDatabaseExtension,
];
