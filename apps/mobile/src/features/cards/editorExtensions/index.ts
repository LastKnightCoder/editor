import type { IExtension } from "@tau/editor/src";
import { MobileContentLinkExtension } from "./contentLinkExtension";
import { MobileFileAttachmentExtension } from "./passiveExtensions";

export const mobileCardPreviewExtensions: IExtension[] = [
  new MobileContentLinkExtension(),
  new MobileFileAttachmentExtension(),
];
