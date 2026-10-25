import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import type { ContentNode } from "./protocol";
import type { WhiteboardJson } from "./whiteboard-contract";

export type WhiteboardData = Readonly<Record<string, WhiteboardJson>>;
export interface WhiteboardGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}
export interface WhiteboardParent {
  readonly kind: "page" | "element";
  readonly id: string;
}
export type WhiteboardAnchor =
  | { beforeId: string; afterId?: never }
  | { afterId: string; beforeId?: never }
  | { beforeId?: never; afterId?: never };
export interface WhiteboardPlacement {
  readonly parent: WhiteboardParent;
  readonly token: string;
  readonly fallbackPageId: string;
}
export interface WhiteboardReference {
  readonly id: string;
  readonly token: string;
}
export interface WhiteboardFieldBindings {
  readonly data: Readonly<Record<string, string>>;
  readonly body?: { readonly mode: "plain" | "richtext"; readonly rootId: string };
}
export interface WhiteboardShellPatch {
  readonly name?: string;
  readonly geometry?: WhiteboardGeometry;
  readonly style?: WhiteboardData;
}
export interface WhiteboardTextEdit {
  readonly offset: number;
  readonly remove: number;
  readonly text: string;
}

/** 宿主纯模型命令；插件入口在适配层解析类型/契约，不直接接收这些内部参数。 */
export type WhiteboardModelCommand =
  | ({ type: "create_page"; id?: string; title: string } & WhiteboardAnchor)
  | ({ type: "move_page"; id: string } & WhiteboardAnchor)
  | { type: "remove_page"; id: string; observedElementIds: readonly string[] }
  | { type: "edit_page_title"; id: string; edit: WhiteboardTextEdit }
  | { type: "edit_title"; edit: WhiteboardTextEdit }
  | {
      type: "set_page_sketch";
      id: string;
      sketch: { mode: "normal" | "sketch"; level: "neat" | "natural" | "loose" };
    }
  | {
      type: "set_presentation";
      before: readonly WhiteboardPresentation[];
      after: readonly WhiteboardPresentation[];
    }
  | ({
      type: "create";
      id?: string;
      contractId: string;
      data: WhiteboardData;
      geometry: WhiteboardGeometry;
      parent: WhiteboardParent;
      body?: string | readonly ContentNode[];
      entity?: ContentEntityReference;
    } & WhiteboardAnchor)
  | ({ type: "move_node"; id: string; parent: WhiteboardParent } & WhiteboardAnchor)
  | { type: "set_entity"; id: string; entity: ContentEntityReference | null }
  | { type: "remove_nodes"; ids: readonly string[] }
  | { type: "set_node"; id: string; patch: WhiteboardShellPatch }
  | { type: "set_data"; id: string; patch: WhiteboardData; unset?: readonly string[] }
  | { type: "edit_text"; id: string; field: string | null; edit: WhiteboardTextEdit };

export type WhiteboardRecoveryReason = "parent-unavailable" | "containment" | "cycle" | "depth";
export interface WhiteboardElementSnapshot {
  readonly id: string;
  readonly type: string;
  readonly contractId: string;
  readonly name?: string;
  readonly geometry: WhiteboardGeometry;
  readonly style: WhiteboardData;
  readonly data: WhiteboardData;
  readonly fieldBindings: WhiteboardFieldBindings;
  readonly body?: string | readonly ContentNode[];
  readonly entity?: ContentEntityReference;
  readonly children: readonly WhiteboardElementSnapshot[];
  readonly recoveryReason?: WhiteboardRecoveryReason;
}
export interface WhiteboardPageSnapshot {
  readonly sketch?: { mode: "normal" | "sketch"; level: "neat" | "natural" | "loose" };
  readonly id: string;
  readonly title: string;
  readonly children: readonly WhiteboardElementSnapshot[];
  readonly recovery: readonly WhiteboardElementSnapshot[];
}
export interface WhiteboardSnapshot {
  readonly presentations?: readonly WhiteboardPresentation[];
  readonly title: string;
  readonly pages: readonly WhiteboardPageSnapshot[];
  readonly recovery: readonly WhiteboardElementSnapshot[];
}

export interface WhiteboardPresentation {
  id: string;
  name: string;
  frames: { id: string; elements: string[] }[];
  createTime: number;
  updateTime: number;
}
export type TransferElement = Omit<
  WhiteboardElementSnapshot,
  "children" | "fieldBindings" | "recoveryReason"
> & { children: TransferElement[] };
export interface WhiteboardTransfer {
  assets?: { reference: string; name: string; mime: string; base64: string }[];
  format: "whiteboard-transfer-v1";
  sourceDocumentId: string;
  title: string;
  pages: {
    id: string;
    title: string;
    sketch?: WhiteboardPageSnapshot["sketch"];
    elements: TransferElement[];
  }[];
  contracts: ContentContractDictionary;
  resources: string[];
  presentations: WhiteboardPresentation[];
}
