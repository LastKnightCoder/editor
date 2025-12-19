import { downloadFileWithDialog } from "@/commands/extra";

export const downloadMarkdown = (markdown: string, fileName: string) => {
  const blob = new Blob([markdown], {
    type: "text/markdown",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * 通用下载函数 - 使用 Electron 的保存对话框
 * 1. 弹出文件保存对话框让用户选择保存位置
 * 2. 使用主进程下载文件（自动处理跨域问题）
 * 3. 保存到用户选择的位置
 */
export const downloadFile = async (url: string, fileName?: string) => {
  // 从 URL 提取文件名
  const defaultFileName = url.split("/").pop()?.split("?")[0] || "download";
  const finalFileName = fileName || defaultFileName;

  // 调用 Electron 主进程，弹出保存对话框并下载
  const savedPath = await downloadFileWithDialog(url, finalFileName);

  if (!savedPath) {
    throw new Error("用户取消了下载");
  }

  return savedPath;
};
