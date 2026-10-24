// 内容引用（content-link）的节点读取、类型外观、详情查询与跳转，预览面板、行内节点、配件栏与选择器共用。

import { useQuery } from "@tanstack/react-query";
import { useCollaboration } from "@tau/editor-collab";
import { FileText, type LucideIcon } from "lucide-react";

import { getNavigator } from "../../../router";
import { parseInvokeError } from "../../../services/errors";
import * as tauri from "../../../services/tauri";
import type { ContentDetailResponse } from "../../../types";
import { ENTITY_KIND_META } from "../../context/model";
import { canOpenContextEntity, openContextEntity } from "../../context/open";
import type { ContextEntity, EntityKind } from "../../context/types";

export const CONTENT_LINK_TYPE = "content-link";

/** 选择器能搜到、配件栏能引用的内容类型 */
export const CONTENT_LINK_SEARCH_TYPES = ["card", "article", "project-item"];

export type ContentLinkElement = {
  type: typeof CONTENT_LINK_TYPE;
  contentId: number;
  contentType: string;
  contentTitle: string;
  refId: number;
  children: Array<{ type: "formatted"; text: string }>;
};

/** 选择器的用途：插入新引用（text 为选中的文字），或更换光标所在引用的目标（text 为其显示文字） */
export type ContentLinkPickerIntent = { mode: "insert" | "replace"; text: string };

/** 引用指向的内容；字段来自节点属性，存量节点可能缺省或是字符串 */
export type ContentLinkTarget = {
  contentId: number;
  contentType: string;
  /** 插入时记下的标题，详情未载入前用它显示 */
  contentTitle: string;
  refId: number;
};

function readNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : -1;
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readContentLinkTarget(element: unknown): ContentLinkTarget {
  const node = (element ?? {}) as Record<string, unknown>;
  return {
    contentId: readNumber(node.contentId),
    contentType: readText(node.contentType) || "card",
    contentTitle: readText(node.contentTitle),
    refId: readNumber(node.refId),
  };
}

export type ContentLinkKindMeta = { label: string; icon: LucideIcon; tone: string };

const KIND_TONES: Record<string, string> = {
  card: "bg-ok-soft text-ok",
  article: "bg-info-soft text-info",
  "project-item": "bg-tag-4-soft text-tag-4",
  "plugin-entity": "bg-tag-5-soft text-tag-5",
};

/** 类型名与图标沿用脉络的口径，色调与桌面预览卡一致 */
export function getContentLinkKindMeta(contentType: string): ContentLinkKindMeta {
  const base = ENTITY_KIND_META[contentType] ?? { label: "内容", icon: FileText };
  return { ...base, tone: KIND_TONES[contentType] ?? "bg-hover text-ink-2" };
}

/** 跳转规则与脉络条目一致，借用其实体结构 */
function toContextEntity(target: ContentLinkTarget): ContextEntity {
  return {
    kind: target.contentType as EntityKind,
    id: target.refId,
    contentId: target.contentId,
    title: target.contentTitle,
    meta: "",
    diary: null,
  };
}

export function canOpenContentLink(target: ContentLinkTarget): boolean {
  return target.refId > 0 && canOpenContextEntity(toContextEntity(target));
}

/** 按内容类型推入对应详情页（卡片 / 文章 / 项目文档） */
export function openContentLink(target: ContentLinkTarget): void {
  if (!canOpenContentLink(target)) return;
  openContextEntity(getNavigator(), toContextEntity(target));
}

export const contentLinkDetailKey = (contentId: number) =>
  ["content-link", "detail", contentId] as const;

/** 引用内容详情；内容已删除时为 null（而非报错），行内节点据此显示失效 */
async function fetchContentLinkDetail(contentId: number): Promise<ContentDetailResponse | null> {
  try {
    return await tauri.getContentDetail(contentId);
  } catch (error) {
    if (parseInvokeError(error).code === "CONTENT_NOT_FOUND") return null;
    throw error;
  }
}

/**
 * enabled 为 false 时只订阅缓存不发请求：行内节点用它读取「打开过的预览」得出的失效状态，
 * 避免一篇文档里每个引用都去拉一次完整正文。
 */
export function useContentLinkDetail(contentId: number, enabled: boolean) {
  return useQuery({
    queryKey: contentLinkDetailKey(contentId),
    queryFn: () => fetchContentLinkDetail(contentId),
    enabled: enabled && contentId > 0,
    staleTime: 10_000,
  });
}

/** 协作者视角：被引用内容只在创建者本机，本机库里同 ID 的内容与它无关 */
export function useIsUnsharedContentLink(): boolean {
  const collaboration = useCollaboration();
  return Boolean(collaboration && collaboration.mode !== "local" && collaboration.role !== "owner");
}
