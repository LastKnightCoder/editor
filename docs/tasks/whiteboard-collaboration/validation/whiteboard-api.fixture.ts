import type { EditorTextField } from "@tau/editor/api";
import type { ContentResourceSpec } from "@tau/db-schema/content-resources";
import type { WhiteboardJson } from "@tau/collaboration";

/** W1 冻结的作者数据入口；同时检查正式 SDK 的结构兼容。 */
export interface WhiteboardAuthorOptions {
  type: string;
  dataVersion: number;
  collaboration?: { textFields?: readonly string[] };
  resources?: readonly ContentResourceSpec[];
  previousVersions?: readonly {
    element: WhiteboardAuthorOptions;
    access: "read" | "edit" | "none";
  }[];
  migrations?: readonly {
    from: number;
    migrate(data: Data): Data;
  }[];
  schemaVersion?: never;
  migrate?: never;
}

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
type Data = Readonly<Record<string, WhiteboardJson>>;
type Parent = { kind: "page" | "element"; id: string };
type Anchor =
  | { beforeId: string; afterId?: never }
  | { afterId: string; beforeId?: never }
  | { beforeId?: never; afterId?: never };
type ShellPatch = {
  name?: string;
  geometry?: Readonly<Geometry>;
  style?: Data;
};
export type WhiteboardIdCommand =
  | ({
      type: "create";
      element: { type: string; data: Data; geometry: Readonly<Geometry> };
      parent: Parent;
    } & Anchor)
  | { type: "set_node"; id: string; patch: ShellPatch }
  | { type: "set_data"; id: string; patch: Data; unset?: readonly string[] }
  | ({ type: "move_node"; id: string; parent: Parent } & Anchor)
  | { type: "remove_nodes"; ids: readonly string[] };

export interface FrozenWhiteboardElement {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly style?: Data;
  readonly data: Data;
  readonly geometry: Readonly<Geometry>;
  readonly children?: readonly FrozenWhiteboardElement[];
}

export interface FrozenWhiteboardDataAPI {
  getSnapshot(): { readonly pageId: string; readonly children: readonly FrozenWhiteboardElement[] };
  getElement(id: string): FrozenWhiteboardElement | undefined;
  updateElement(id: string, patch: ShellPatch): boolean;
  updateElementData(
    id: string,
    patch: Data,
    options?: { unset?: readonly string[]; historyGroup?: string }
  ): boolean;
  getTextBinding(id: string, field: string): EditorTextField;
  submit(
    commands: readonly WhiteboardIdCommand[],
    options?: { historyGroup?: string }
  ): { readonly createdIds: readonly string[] };
}

export function authorTypeFixture(api: FrozenWhiteboardDataAPI): void {
  const name: string | undefined = api.getElement("shape")?.name;
  const style: Data | undefined = api.getElement("shape")?.style;
  api.updateElement("shape", { name: name ?? "图形", style: style ?? {} });
  api.updateElementData(
    "shape",
    { title: "标题", settings: { compact: true } },
    { unset: ["oldTitle"] }
  );
  const text: EditorTextField = api.getTextBinding("shape", "source");
  text.edit({ offset: 0, remove: 0, text: "输入", revision: text.getSnapshot().revision });
  const created = api.submit([
    {
      type: "create",
      element: {
        type: "example.shape",
        data: {},
        geometry: { x: 0, y: 0, width: 100, height: 60, rotation: 0 },
      },
      parent: { kind: "page", id: api.getSnapshot().pageId },
    },
  ]);
  const id: string | undefined = created.createdIds[0];
  if (id)
    api.submit([
      { type: "move_node", id, parent: { kind: "page", id: "other-page" }, beforeId: "anchor" },
    ]);
  // @ts-expect-error 身份字段不能经过外壳属性入口写入。
  api.updateElement("shape", { id: "another" });
  // @ts-expect-error 不能把整 data 对象交给外壳入口覆盖。
  api.updateElement("shape", { data: {} });
  // @ts-expect-error 批量移动只能按稳定 ID，禁止数组路径。
  api.submit([{ type: "move_node", path: [0], newPath: [1] }]);
  api.submit([
    {
      type: "move_node",
      id: "shape",
      parent: { kind: "page", id: "p" },
      beforeId: "a",
      // @ts-expect-error before/after 锚点互斥。
      afterId: "b",
    },
  ]);
  // @ts-expect-error 补丁只能携带 JSON，字段删除须用 unset。
  api.updateElementData("shape", { title: undefined });
  // @ts-expect-error 不向作者暴露原始 Y.Doc。
  api.doc;
  // @ts-expect-error 首期不增加通用 Map 作者 API。
  api.map("votes");
  const declaration: WhiteboardAuthorOptions = {
    type: "example.source",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
  };
  const next: WhiteboardAuthorOptions = {
    type: declaration.type,
    dataVersion: 2,
    collaboration: { textFields: ["code"] },
    previousVersions: [{ element: declaration, access: "edit" }],
    migrations: [
      {
        from: 1,
        migrate(data) {
          const { source, ...rest } = data;
          if (typeof source !== "string" || Object.hasOwn(rest, "code"))
            throw new Error("转换冲突");
          return { ...rest, code: source };
        },
      },
    ],
  };
  void next;
  const old: WhiteboardAuthorOptions = {
    type: "example.source",
    dataVersion: 1,
    // @ts-expect-error 旧版本命名不能和新版本契约并存。
    schemaVersion: 1,
  };
  void old;
}

export function sdkContractFixture(api: import("@tau/plugins/whiteboard").WhiteboardAPI): void {
  const frozen: FrozenWhiteboardDataAPI = api;
  authorTypeFixture(frozen);
  // @ts-expect-error 作者入口不允许直接应用路径操作或跳过历史。
  api.apply({ type: "remove_node", path: [0] }, false);
  // @ts-expect-error 身份提交不能传路径。
  api.submit([{ type: "move_node", path: [0], newPath: [1] }]);
  // @ts-expect-error 外壳入口不能替换全部载荷。
  api.updateElement("id", { data: {} });
}
