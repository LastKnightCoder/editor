import { Editor, Transforms } from "slate";
import { ChatReferenceElement } from "@tau/editor/src";
import { createRoot } from "react-dom/client";
import ChatSelectorModal from "./components/ChatSelectorModal";
import { createElement } from "react";

export const createChatReferenceNode = (
  editor: Editor,
  chatId: number,
  title: string,
): void => {
  const chatReference: ChatReferenceElement = {
    type: "chat-reference",
    chatId,
    title,
    height: 400,
    children: [{ type: "formatted", text: "" }],
  };

  Transforms.insertNodes(editor, chatReference);
};

export const openChatSelectorModal = (editor: Editor): void => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const handleSelect = (chatId: number, title: string) => {
    createChatReferenceNode(editor, chatId, title);
    handleClose();
  };

  const handleClose = () => {
    root.unmount();
    document.body.removeChild(container);
  };

  root.render(
    createElement(ChatSelectorModal, {
      open: true,
      onCancel: handleClose,
      onSelect: handleSelect,
    }),
  );
};
