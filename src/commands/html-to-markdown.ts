import { invoke } from "@tauri-apps/api";

export const htmlToMarkdown = async (html: string): Promise<string> => {
  return await invoke("html_to_markdown", {
    html,
  });
}
