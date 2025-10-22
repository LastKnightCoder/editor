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
