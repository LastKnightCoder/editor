import { TabType } from "@/types/tab";
import { getAllChatMessages, getAllChatGroups } from "@/commands/chat-message";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class ChatManagementProvider extends BaseTabContentProvider<TabType.ChatManagement> {
  readonly tabType = TabType.ChatManagement;

  async getContent(
    tab: ITab<TabType.ChatManagement>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const [chats, groups] = await Promise.all([
      getAllChatMessages(),
      getAllChatGroups(),
    ]);

    const content = {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        chatCount: chats.filter((c) => c.groupId === g.id).length,
      })),
      recentChats: chats.slice(0, 20).map((c) => ({
        id: c.id,
        title: c.title,
        groupId: c.groupId,
        messageCount: c.messages.length,
        createTime: c.createTime,
        isPinned: c.orderNum !== null && c.orderNum !== undefined,
      })),
      statistics: {
        totalChats: chats.length,
        totalGroups: groups.length,
      },
      type: "functional-page",
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated: false,
      originalLength: 0,
      totalLength: 0,
    };
  }
}
