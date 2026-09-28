import type { IExtension } from "@tau/editor/src";
import { MobileContentLinkExtension } from "./contentLinkExtension";
import { MobileFileAttachmentExtension } from "./passiveExtensions";
import { MobileWhiteboardExtension, MobileDatabaseExtension } from "./privateBlockExtensions";

/** content 正文在 mobile 上要覆盖的业务元素（清单见 @tau/shared 的 CONTENT_ELEMENT_TYPES） */
export const mobileCardPreviewExtensions: IExtension[] = [
  new MobileContentLinkExtension(),
  new MobileFileAttachmentExtension(),
  new MobileWhiteboardExtension(),
  new MobileDatabaseExtension(),
];
