/**
 * 原子提交：回调里对本插件内容、记录与关联的写入先由宿主记下，回调结束后一次提交，
 * 任何一条失败（revision 不符、目标不可关联等）全部不生效。
 */
import type { PluginEntityRef } from "./app";
import type { PluginOwnEntityInput, PluginOwnEntityPatch } from "./entities";
import type { PluginLinkOptions } from "./links";
import type { PluginRecordData } from "./records";

/** 事务里的修改与删除可以不带 revision：带了就核对，不带即不论当前版本直接写入 */
export interface PluginTransactionWriteOptions {
  expectedRevision?: string;
}

export interface PluginTransaction {
  readonly entities: {
    /** 立即返回新内容的 ID，同一事务里可以用它添加关联、写记录；提交失败时这个 ID 作废 */
    create(input: PluginOwnEntityInput): Promise<{ id: string }>;
    update(
      id: string,
      patch: PluginOwnEntityPatch,
      options?: PluginTransactionWriteOptions
    ): Promise<void>;
    delete(id: string, options?: PluginTransactionWriteOptions): Promise<void>;
  };
  readonly records: {
    insert(collection: string, data: PluginRecordData): Promise<{ id: string }>;
    update(
      collection: string,
      id: string,
      data: PluginRecordData,
      options?: PluginTransactionWriteOptions
    ): Promise<void>;
    delete(collection: string, id: string, options?: PluginTransactionWriteOptions): Promise<void>;
  };
  readonly links: {
    /** 已经关联过时什么也不做；需要关联的 ID 时在提交后 list */
    add(from: string, to: PluginEntityRef, options?: PluginLinkOptions): Promise<void>;
    remove(id: string): Promise<void>;
    reorder(from: string, ids: readonly string[]): Promise<void>;
  };
}

/**
 * 回调里的写入在回调结束后一次提交，返回回调的结果；回调抛错或任何一条写入失败时全部不生效。
 * 回调里用 context 读到的是已提交的数据，看不到本事务尚未提交的写入。最多 500 条写入。
 */
export type PluginTransactionRunner = <T>(
  run: (tx: PluginTransaction) => T | Promise<T>
) => Promise<T>;
