import { Descendant } from "slate";

export interface ChatReferenceElement {
  type: "chat-reference";
  chatId: number;
  title: string;
  height?: number;
  children: Descendant[];
}
