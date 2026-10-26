/** 当前跨存储安装的候选身份；不提供历史格式转换。 */
export interface DocumentInstallFingerprint {
  expectedRevision: string;
  candidateHash: string;
  targetVersion: number;
  baselineId: string;
}

export interface DocumentInstallReceipt {
  operationId: string;
  documentId: string;
  epoch: number;
  revision: string;
  version: number;
  baselineId: string;
}
