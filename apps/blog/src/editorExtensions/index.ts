import type { IExtension } from "@tau/editor";
import { blogContentLinkExtension } from "./contentLinkExtension";

export const blogEditorExtensions: IExtension[] = [blogContentLinkExtension];
