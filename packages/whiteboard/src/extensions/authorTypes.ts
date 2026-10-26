import type { DataJson } from "@tau/db-schema/content-contracts";
import type { PreviousDataVersion } from "@tau/db-schema/data-versions";
import type { EditorTextField } from "@tau/editor/text-field-contract";
import type {
  WhiteboardAPI as HostAPI,
  WhiteboardElementDefinition as HostElement,
  WhiteboardContributions as HostContributions,
  WhiteboardExtension as HostExtension,
} from "./api";

export type WhiteboardData = Readonly<Record<string, DataJson>>;
export interface WhiteboardGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}
export type WhiteboardParent = { kind: "page" | "element"; id: string };
export type WhiteboardAnchor =
  | { beforeId: string; afterId?: never }
  | { afterId: string; beforeId?: never }
  | { beforeId?: never; afterId?: never };
export interface WhiteboardShellPatch {
  name?: string;
  geometry?: WhiteboardGeometry;
  style?: WhiteboardData;
}
export interface WhiteboardElement {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly style?: WhiteboardData;
  readonly data: WhiteboardData;
  readonly geometry: WhiteboardGeometry;
  readonly children?: readonly WhiteboardElement[];
}
export type WhiteboardIdCommand =
  | ({
      type: "create";
      element: { type: string; data: WhiteboardData; geometry: WhiteboardGeometry };
      parent: WhiteboardParent;
    } & WhiteboardAnchor)
  | { type: "set_node"; id: string; patch: WhiteboardShellPatch }
  | { type: "set_data"; id: string; patch: WhiteboardData; unset?: readonly string[] }
  | ({ type: "move_node"; id: string; parent: WhiteboardParent } & WhiteboardAnchor)
  | { type: "remove_nodes"; ids: readonly string[] };
export interface WhiteboardSnapshot {
  readonly pageId: string;
  readonly children: readonly WhiteboardElement[];
}
export interface WhiteboardAPI extends Omit<
  HostAPI,
  | "children"
  | "getSnapshot"
  | "getElement"
  | "submit"
  | "apply"
  | "updateElement"
  | "captureSubmission"
> {
  readonly children: readonly WhiteboardElement[];
  getSnapshot(): WhiteboardSnapshot;
  getElement(id: string): WhiteboardElement | undefined;
  updateElement(id: string, patch: WhiteboardShellPatch): boolean;
  updateElementData(
    id: string,
    patch: WhiteboardData,
    options?: { unset?: readonly string[]; historyGroup?: string }
  ): boolean;
  getTextBinding(id: string, field: string): EditorTextField;
  submit(
    commands: readonly WhiteboardIdCommand[],
    options?: { historyGroup?: string }
  ): { readonly createdIds: readonly string[] };
  captureSubmission(target?: string | { readonly id: string }): () => boolean;
}
export interface WhiteboardElementDefinition<TData = unknown> extends Omit<
  HostElement<TData>,
  "schemaVersion" | "previousVersions" | "create"
> {
  dataVersion: number;
  previousVersions?: readonly PreviousDataVersion<WhiteboardElementDefinition<any>>[];
  create?: Omit<NonNullable<HostElement<TData>["create"]>, "build" | "gesture"> & {
    gesture:
      | "click"
      | "drag"
      | {
          begin(
            context: Omit<import("./api").CreatePointerContext, "api"> & {
              api: WhiteboardAPI;
              preview(
                element: import("./api").TypedBoardElement<TData> | null,
                options?: import("./api").CreatePreviewOptions
              ): void;
            }
          ): {
            move(
              context: Omit<import("./api").CreatePointerContext, "api"> & { api: WhiteboardAPI }
            ): void;
            end(
              context: Omit<import("./api").CreatePointerContext, "api"> & {
                api: WhiteboardAPI;
                moved: boolean;
              }
            ):
              | import("./api").TypedBoardElement<TData>
              | null
              | Promise<import("./api").TypedBoardElement<TData> | null>;
            cancel?(): void;
          } | null;
        };
    build?(
      context: Omit<import("./api").CreateBuildContext, "api"> & { api: WhiteboardAPI }
    ):
      | import("./api").TypedBoardElement<TData>
      | null
      | Promise<import("./api").TypedBoardElement<TData> | null>;
  };
  schemaVersion?: never;
}
export interface WhiteboardContributions extends Omit<
  HostContributions,
  "commands" | "menus" | "ingest"
> {
  commands?: readonly {
    id: string;
    enabled?(api: WhiteboardAPI): boolean;
    execute(api: WhiteboardAPI, payload?: unknown): unknown;
  }[];
  menus?: readonly {
    id: string;
    label: string;
    command: string;
    order: number;
    when?(api: WhiteboardAPI): boolean;
  }[];
  ingest?: readonly {
    id: string;
    source: "paste" | "drop";
    accepts(event: ClipboardEvent | DragEvent): boolean;
    run(api: WhiteboardAPI, event: ClipboardEvent | DragEvent): void | Promise<void>;
  }[];
}
export interface WhiteboardExtension extends Omit<HostExtension, "elements" | "create"> {
  readonly elements?: readonly WhiteboardElementDefinition<any>[];
  create(api: WhiteboardAPI): WhiteboardContributions;
}

/** 宿主实现注册到作用域，不包含 Y.Doc 或画布内核。 */
export interface WhiteboardAuthorBridge {
  canWrite(): boolean;
  getPageId(): string;
  getSnapshot(): Pick<WhiteboardSnapshot, "pageId" | "children">;
  getElement(id: string): WhiteboardElement | undefined;
  submit(
    owner: string,
    commands: readonly WhiteboardIdCommand[],
    historyGroup?: string
  ): { readonly createdIds: readonly string[] };
  getTextBinding(owner: string, id: string, field: string): EditorTextField;
}
