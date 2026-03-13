export const WEREAD_UPLOAD_INPUT_SELECTOR =
  'input[type="file"].bookUpload_fileSelectPanel_file, input[type="file"]';

export interface WeReadUploadInputState {
  found: boolean;
  fileCount: number;
  fileName: string;
  vueInvokerKeys?: string[];
  vueMethodNames?: string[];
}

export interface WeReadUploadSnapshot {
  successCount: number;
  failureCount: number;
  processingCount: number;
  readNowCount: number;
  text: string;
}

export const parseWeReadUploadSnapshot = (
  text: string,
): WeReadUploadSnapshot => {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  return {
    successCount: (normalizedText.match(/导入完成/g) || []).length,
    failureCount: (normalizedText.match(/失败|出错|错误/g) || []).length,
    processingCount: (normalizedText.match(/导入中|上传中|处理中/g) || [])
      .length,
    readNowCount: (normalizedText.match(/立即阅读/g) || []).length,
    text: normalizedText,
  };
};
