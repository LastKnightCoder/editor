import { createHash } from "node:crypto";
import {
  contentContractChecks,
  type ContentContractDictionary,
  type DataContract,
} from "./content-contracts";

/** 主库同步事务使用同一规范化规则，不在事务内等待 WebCrypto。 */
export function validateContentContractsSync(value: unknown): ContentContractDictionary {
  const verified: Record<string, DataContract> = {};
  for (const entry of contentContractChecks(value)) {
    if (createHash("sha256").update(entry.canonical).digest("hex") !== entry.id)
      throw new Error("契约内容与摘要不匹配");
    verified[entry.id] = entry.contract;
  }
  return Object.freeze(verified);
}
