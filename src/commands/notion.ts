import { invoke } from "@/electron";

export interface NotionVerifyResult {
  success: boolean;
  userInfo?: {
    name: string;
    email: string;
    avatar: string;
  };
  error?: string;
}

export interface NotionBlockInfo {
  success: boolean;
  blockType?: string;
  videoUrl?: string;
  error?: string;
}

export async function verifyNotionToken(
  token: string,
): Promise<NotionVerifyResult> {
  return await invoke("verify_notion_token", { token });
}

export async function getNotionBlockInfo(
  token: string,
  blockId: string,
): Promise<NotionBlockInfo> {
  return await invoke("get_notion_block_info", { token, blockId });
}

export async function createNotionPage(
  token: string,
  parentId: string,
  title: string,
  blocks: any[] = [],
): Promise<{ success: boolean; pageId?: string; error?: string }> {
  return await invoke("create_notion_page", { token, parentId, title, blocks });
}

export async function getNotionPageBlocks(
  token: string,
  pageId: string,
): Promise<{ success: boolean; blocks?: any[]; error?: string }> {
  return await invoke("get_notion_page_blocks", { token, pageId });
}

export async function updateNotionPageBlocks(
  token: string,
  pageId: string,
  blocks: any[],
): Promise<{ success: boolean; error?: string }> {
  return await invoke("update_notion_page_blocks", { token, pageId, blocks });
}

export async function getNotionPageInfo(
  token: string,
  pageId: string,
): Promise<{
  success: boolean;
  title?: string;
  lastEditedTime?: string;
  error?: string;
}> {
  return await invoke("get_notion_page_info", { token, pageId });
}

export async function appendNotionBlock(
  token: string,
  parentId: string,
  block: any,
): Promise<{ success: boolean; blockId?: string; error?: string }> {
  return await invoke("append_notion_block", { token, parentId, block });
}

export async function updateNotionBlock(
  token: string,
  blockId: string,
  content: any,
): Promise<{ success: boolean; error?: string }> {
  return await invoke("update_notion_block", { token, blockId, content });
}

export async function deleteAllNotionBlocks(
  token: string,
  pageId: string,
): Promise<{ success: boolean; error?: string }> {
  return await invoke("delete_all_notion_blocks", { token, pageId });
}

export async function searchNotionPages(
  token: string,
  query: string,
): Promise<{
  success: boolean;
  pages?: Array<{ id: string; title: string }>;
  error?: string;
}> {
  return await invoke("search_notion_pages", { token, query });
}

export async function updateNotionPageTitle(
  token: string,
  pageId: string,
  title: string,
): Promise<{ success: boolean; error?: string }> {
  return await invoke("update_notion_page_title", { token, pageId, title });
}
