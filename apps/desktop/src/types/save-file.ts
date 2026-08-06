/**
 * 通用「保存对话框 + 写文件」IPC 的载荷
 */
export interface SaveFileWithDialogPayload {
  defaultFileName: string;
  filters?: { name: string; extensions: string[] }[];
  /** 文本内容直接传字符串，二进制内容传 Uint8Array */
  data: string | Uint8Array;
}

export interface SaveFileWithDialogResult {
  canceled: boolean;
  filePath: string | null;
}
