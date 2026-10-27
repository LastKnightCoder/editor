import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import type { ElementContractDefinition } from "@tau/editor/contracts";

/**
 * 宿主节点的持久化声明：扩展的 `defineElement` 展开它们，Markdown 转换等无界面场景直接按组使用。
 * 新增宿主节点在此声明；`hostElementGroups` 漏登记时，带 Markdown 语法的节点建处理器即报错。
 */
export const contentLinkElementDefinition = {
  type: "content-link",
  dataVersion: 1,
  kind: "inline",
} as const satisfies ElementContractDefinition;

export const fileAttachmentElementDefinition = {
  type: "file-attachment",
  dataVersion: 1,
  resources: BUILTIN_CONTENT_RESOURCES["file-attachment"],
  kind: "block",
  isVoid: true,
} as const satisfies ElementContractDefinition;

export const skillRefElementDefinition = {
  type: "skill-ref",
  dataVersion: 1,
  kind: "inline",
  isVoid: true,
} as const satisfies ElementContractDefinition;

export const summaryTimestampElementDefinition = {
  type: "summary-timestamp",
  dataVersion: 1,
  kind: "inline",
  isVoid: true,
} as const satisfies ElementContractDefinition;

export const whiteboardElementDefinition = {
  type: "whiteboard",
  dataVersion: 1,
  kind: "block",
  isVoid: true,
} as const satisfies ElementContractDefinition;

export const databaseElementDefinition = {
  type: "database",
  dataVersion: 1,
  kind: "block",
  isVoid: true,
} as const satisfies ElementContractDefinition;

export const projectCardListElementDefinition = {
  type: "project-card-list",
  dataVersion: 1,
  kind: "block",
  isVoid: true,
} as const satisfies ElementContractDefinition;

/** 按扩展 id 分组：id 即契约 owner，须与对应 defineExtension 的 id 一致 */
export const hostElementGroups = [
  { id: "host.content-link", elements: [contentLinkElementDefinition] },
  { id: "host.file-attachment", elements: [fileAttachmentElementDefinition] },
  { id: "host.skill-ref", elements: [skillRefElementDefinition] },
  { id: "host.summary-timestamp", elements: [summaryTimestampElementDefinition] },
  { id: "host.whiteboard", elements: [whiteboardElementDefinition] },
  { id: "host.database", elements: [databaseElementDefinition] },
  { id: "host.project-card-list", elements: [projectCardListElementDefinition] },
] as const;
