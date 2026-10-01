import type { ParagraphElement } from "./element/paragraph";

import type { FormattedText } from "./text";
import type { ExtensionElementMap, ExtensionInlineElementMap } from "../../api";

export interface BuiltinElementMap {
  paragraph: ParagraphElement;
}

export type CustomElement = (BuiltinElementMap & ExtensionElementMap)[keyof (BuiltinElementMap &
  ExtensionElementMap)];

export type InlineElement = ExtensionInlineElementMap[keyof ExtensionInlineElementMap];

export type CustomText = FormattedText;
export type BlockElement = Exclude<CustomElement, InlineElement>;
