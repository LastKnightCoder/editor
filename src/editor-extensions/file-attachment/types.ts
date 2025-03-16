export interface FileAttachmentElement {
  type: "file-attachment";
  fileName: string;
  filePath: string;
  localFilePath?: string;
  isLocal: boolean;
  uuid: string;
}
