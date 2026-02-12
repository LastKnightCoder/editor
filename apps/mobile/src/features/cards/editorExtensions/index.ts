import type { IExtension } from "@tau/editor/src";
import { MobileContentLinkExtension } from "./contentLinkExtension";
import {
  MobileChatReferenceExtension,
  MobileFileAttachmentExtension,
  MobileQuestionExtension,
} from "./passiveExtensions";

export const mobileCardPreviewExtensions: IExtension[] = [
  new MobileContentLinkExtension(),
  new MobileFileAttachmentExtension(),
  new MobileQuestionExtension(),
  new MobileChatReferenceExtension(),
];
