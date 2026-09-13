import { resolve } from "node:path";

export interface ServerConfig {
  dataDir: string;
  host: string;
  port: number;
  publicUrl: string;
  maxDocumentsPerDevice: number;
  maxMembers: number;
  maxConnections: number;
  maxActiveDocuments: number;
  maxDocumentBytes: number;
  maxAssetBytes: number;
  maxDocumentAssetBytes: number;
  maxStorageBytes: number;
  /** HTTP 限流：按来源地址计数；自用部署可通过环境变量提高。 */
  globalRateLimit: number;
  deviceRateLimit: number;
  documentRateLimit: number;
  joinRequestRateLimit: number;
  logger: boolean;
  /**
   * 信任的反代地址（Fastify trustProxy）。Docker 部署时对端是网桥网关，
   * 不配置会导致所有客户端共享同一限流桶；设为 "true" 表示全部信任（仅当端口只暴露给反代时）。
   */
  trustProxy: string | boolean;
}

const positiveInteger = (name: string, fallback: number) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} 必须是正整数`);
  return value;
};

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const trustProxy = process.env.COLLAB_TRUST_PROXY || "127.0.0.1";
  return {
    dataDir: resolve(process.env.COLLAB_DATA_DIR || "./data"),
    host: process.env.COLLAB_HOST || "127.0.0.1",
    port: positiveInteger("COLLAB_PORT", 3210),
    publicUrl: process.env.COLLAB_PUBLIC_URL || "https://collab.xiongtao.life",
    maxDocumentsPerDevice: positiveInteger("COLLAB_MAX_DOCUMENTS", 5),
    maxMembers: positiveInteger("COLLAB_MAX_MEMBERS", 10),
    maxConnections: positiveInteger("COLLAB_MAX_CONNECTIONS", 100),
    maxActiveDocuments: positiveInteger("COLLAB_MAX_ACTIVE_DOCUMENTS", 20),
    maxDocumentBytes: positiveInteger("COLLAB_MAX_DOCUMENT_BYTES", 8 * 1024 * 1024),
    maxAssetBytes: positiveInteger("COLLAB_MAX_ASSET_BYTES", 25 * 1024 * 1024),
    maxDocumentAssetBytes: positiveInteger("COLLAB_MAX_DOCUMENT_ASSET_BYTES", 200 * 1024 * 1024),
    maxStorageBytes: positiveInteger("COLLAB_MAX_STORAGE_BYTES", 5 * 1024 ** 3),
    globalRateLimit: positiveInteger("COLLAB_GLOBAL_RATE_LIMIT", 3000),
    deviceRateLimit: positiveInteger("COLLAB_DEVICE_RATE_LIMIT", 20),
    documentRateLimit: positiveInteger("COLLAB_DOCUMENT_RATE_LIMIT", 200),
    joinRequestRateLimit: positiveInteger("COLLAB_JOIN_RATE_LIMIT", 100),
    logger: process.env.COLLAB_LOGGER !== "0",
    trustProxy: trustProxy === "true" ? true : trustProxy === "false" ? false : trustProxy,
    ...overrides,
  };
}
