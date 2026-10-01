import type {} from "@tau/editor/api";
import type { StyledTextElement } from "./types";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "styled-text": StyledTextElement;
  }
  interface ExtensionInlineElementMap {
    "styled-text": StyledTextElement;
  }
}
