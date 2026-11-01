import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { ContentNode } from "../protocol";
import type { ContentMetricRule } from "@tau/db-schema/content-metrics";
import type { SyncTable } from "./sql";

export const DEVICE_SYNC_PROTOCOL = 4;
export const DEVICE_SYNC_HISTORY_LIMIT = 128;
export const DEVICE_SYNC_CHUNK_BYTES = 256 * 1024;
export type SqlValue = null | string | number | { $blob: string } | { $integer: string };
export type Row = Record<string, SqlValue>;
export interface RowChange {
  table: string;
  key: SqlValue[];
  before: Row | null;
  after: Row | null;
}
export interface DeviceDocument {
  contentId: number;
  documentId: string;
  baselineId: string;
  epoch: number;
  state: string;
  paths: Record<string, string>;
  updatedAt: number;
  deleted?: boolean;
  fullHash?: string;
  metricRules?: readonly ContentMetricRule[];
}
export interface PreparedDeviceDocument extends DeviceDocument {
  projection: {
    content: ContentNode[];
    contracts: ContentContractDictionary;
    count: number;
    title: string;
    contentJson: string;
    contractsJson: string;
  };
}
export interface DeviceState {
  library: string;
  schema: string;
  node: string;
  authority: string;
  epoch: string;
  head: string;
  ackHead: string;
  ackSeq: number;
  enabled: boolean;
  revision: number;
  requiresSnapshot?: boolean;
  recovering?: boolean;
}
export interface DeviceSnapshot {
  rows: Record<string, Row[]>;
  documents: DeviceDocument[];
}
export interface HistoryEntry {
  id: string;
  parent: string;
  changes: RowChange[];
  documents: DeviceDocument[];
  snapshot?: boolean;
}
export interface DeviceView {
  tables?: SyncTable[];
  generation?: string;
  state: DeviceState;
  sequence: number;
  changes: RowChange[];
  allChanges: RowChange[];
  forceSnapshot?: boolean;
  documents: DeviceDocument[];
  history: HistoryEntry[];
  receipts: Record<
    string,
    {
      sequence: number;
      fingerprint: string;
      outcome?: { branchId?: string; noteCopies?: { document: DeviceDocument; reason: string }[] };
    }
  >;
  snapshot?: DeviceSnapshot;
}
export interface DeviceCommit {
  expectedGeneration?: string;
  replaceLocal?: boolean;
  generation?: string;
  assertActive?: () => void;
  expectedSequence: number;
  expectedHead: string;
  rollback?: RowChange[];
  changes?: RowChange[];
  documents?: PreparedDeviceDocument[];
  snapshot?: DeviceSnapshot;
  state: DeviceState;
  history?: HistoryEntry;
  receipt?: {
    node: string;
    sequence: number;
    fingerprint: string;
    outcome?: { branchId?: string; noteCopies?: { document: DeviceDocument; reason: string }[] };
  };
  branch?: { id: string; snapshot: DeviceSnapshot; reason: string };
  noteCopies?: { document: DeviceDocument; reason: string }[];
  pendingDocuments?: number[];
}
export interface DeviceStorage {
  replacementBase?(
    remote: DeviceState,
    sourceSequence: number
  ): Promise<Pick<DeviceView, "state" | "sequence" | "generation">>;
  read(snapshot?: boolean): Promise<DeviceView>;
  commit(plan: DeviceCommit): Promise<void>;
  loadDocuments(ids: number[]): Promise<DeviceDocument[]>;
}
export interface DeviceJsonIntent {
  contentId: number;
  base: DeviceDocument;
  content: ContentNode[];
  contracts: ContentContractDictionary;
  token: string;
}
export interface DeviceOffer {
  generation?: string;
  protocol: number;
  state: DeviceState;
  sequence: number;
  changes: RowChange[];
  documents: DeviceDocument[];
  snapshot?: DeviceSnapshot;
  vectors?: Record<string, { baselineId: string; vector: string }>;
  forceSnapshot?: boolean;
}
export interface DeviceReply {
  sourceSequence?: number;
  protocol: number;
  kind: "delta" | "snapshot" | "need-snapshot" | "need-vectors";
  state: DeviceState;
  changes: RowChange[];
  documents: DeviceDocument[];
  snapshot?: DeviceSnapshot;
  preserved?: boolean;
  documentIds?: number[];
  noteCopies?: { document: DeviceDocument; reason: string }[];
  branchId?: string;
}
