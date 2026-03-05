import SharedChatTab, { type ChatTabProps } from "./SharedChatTab";

export type { ChatTabProps };

export default function ChatTab(props: ChatTabProps) {
  return <SharedChatTab {...props} />;
}
