import type { PluginEntityRef, PluginPickOptions, PluginPickedEntity } from "@tau/plugins";
import type { AppAdapter, PluginOwner } from "@tau/plugins/host";

export const MOBILE_ENTITY_KINDS = [
  "card",
  "article",
  "project",
  "document",
  "todo",
  "event",
] as const;
export type MobileEntityKind = (typeof MOBILE_ENTITY_KINDS)[number];

/** 选择窗口保留创建身份，确认时阻止同编号的新内容继承授权。 */
export interface MobileEntityCandidate extends PluginPickedEntity {
  identity: string;
}

export interface MobileEntityPickRequest {
  id: number;
  plugin: PluginOwner;
  options: Required<PluginPickOptions>;
  signal: AbortSignal;
  query(input: {
    kind: MobileEntityKind;
    keyword: string;
    cursor?: string;
    limit: number;
    signal: AbortSignal;
  }): Promise<{ items: MobileEntityCandidate[]; nextCursor?: string }>;
  submit(items: MobileEntityCandidate[]): Promise<void>;
  cancel(): void;
}

export type MobileEntityOpenTarget =
  | { kind: "card" | "article" | "document" | "project" | "event"; id: number }
  | { kind: "todo"; id: number; groupId: number }
  | { kind: "document-task"; contentId: number; taskId: string };
export type MobileEntityOpenOptions = Parameters<AppAdapter["open"]>[2];

export function mobileEntityKind(ref: Pick<PluginEntityRef, "kind">): MobileEntityKind {
  if (!(MOBILE_ENTITY_KINDS as readonly string[]).includes(ref.kind))
    throw new Error("移动端尚未开放此类内容的选择与打开");
  return ref.kind as MobileEntityKind;
}
