/**
 * 聊天引用：正文里指向 AI 对话某一轮的行内引用（chat-ref）与对话摘录块（chat-quote）。
 * 悬停预览这一轮的问答，点击在停靠栏打开对话并定位；粘贴 `tau://chat/…` 链接自动转成引用。
 */

import { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import { toast } from "@tau/ui";
import { chatQuoteElementDefinition, chatRefElementDefinition } from "../element-definitions";
import type { ChatQuoteElement, ChatRefElement } from "./types";
import { ChatRef } from "./components/ChatRef";
import ChatQuote from "./components/ChatQuote";
import { parseChatRefUrl } from "./link";
import { chatRefInsertionPoint, insertChatRef } from "./operations";
import { getChatRefDatabase, loadChatRefTarget } from "./queries";

import { chatRefTranslator } from "./i18n";

export type { ChatQuoteElement, ChatRefElement, ChatRefPayload } from "./types";

const chatRefExtension = defineExtension({
  id: "host.chat-ref",
  elements: [
    defineElement<ChatRefElement>({
      ...chatRefElementDefinition,
      render: ({ attributes, element, children }: ElementRenderProps<ChatRefElement>) => (
        <ChatRef attributes={attributes} element={element}>
          {children}
        </ChatRef>
      ),
      ingest: {
        text: {
          when: (data, editor) =>
            Boolean(parseChatRefUrl(data.getData("text/plain"))) &&
            Boolean(chatRefInsertionPoint(editor, editor.selection)),
          run: async ({ editor, data }) => {
            const ref = parseChatRefUrl(data.getData("text/plain"));
            if (!ref || !editor.selection) return;
            const element = ReactEditor.toDOMNode(editor as ReactEditor, editor);
            const database = getChatRefDatabase();
            const anchor = Editor.rangeRef(editor, editor.selection);
            const target = await loadChatRefTarget(ref.sessionId, ref.entryId, database).catch(
              () => null
            );
            const selection = anchor.unref();
            if (
              !element.isConnected ||
              database !== getChatRefDatabase() ||
              ReactEditor.isReadOnly(editor as ReactEditor)
            )
              return;
            if (
              !selection ||
              !insertChatRef(
                editor,
                { ...ref, title: target?.session.title ?? "", turn: target?.turn?.turn },
                "inline",
                selection
              )
            ) {
              toast.warning(chatRefTranslator.t("paste.moved"));
            }
          },
        },
      },
    }),
    defineElement<ChatQuoteElement>({
      ...chatQuoteElementDefinition,
      render: ChatQuote,
      frame: true,
      drag: true,
    }),
  ],
});

export default chatRefExtension;
