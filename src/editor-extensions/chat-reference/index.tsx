import { RenderElementProps } from "slate-react";
import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";
import { Descendant } from "slate";

import { withChatReference } from "./plugins";
import blockPanelItems from "./block-panel-items";
import ChatReferenceCard from "./components/ChatReferenceCard";

export interface ChatReferenceElement {
  type: "chat-reference";
  chatId: number;
  title: string;
  height?: number;
  children: Descendant[];
}

class ChatReferenceExtension extends Base implements IExtension {
  type = "chat-reference";

  override getPlugins() {
    return [withChatReference];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;

    return (
      <ChatReferenceCard
        attributes={attributes}
        element={element as unknown as ChatReferenceElement}
      >
        {children}
      </ChatReferenceCard>
    );
  }
}

export default ChatReferenceExtension;
