import { defineElement, defineWhiteboardExtension } from "@tau/plugins/whiteboard";
const first = defineElement<{ source: string }>({
  type: "fixture.board.source",
  dataVersion: 1,
  collaboration: { textFields: ["source"] },
  schema: {
    "~standard": { version: 1, vendor: "fixture", validate: () => ({ value: { source: "" } }) },
  },
  render: ({ element }) => {
    const source: string = element.data.source;
    void source;
    return null;
  },
});
export const sdkFixture = defineWhiteboardExtension({
  id: "fixture.board",
  elements: [first],
  create(api) {
    const field = api.getTextBinding("element", "source");
    // @ts-expect-error 公共文本句柄不暴露底层文档。
    field.doc;
    // @ts-expect-error 观察修订是字符串，不是本机时间戳。
    field.edit({ offset: 0, remove: 0, text: "", revision: 1 });
    field.edit({ offset: 0, remove: 0, text: "输入", revision: field.getSnapshot().revision });
    // @ts-expect-error 不允许通过整段 data 覆盖字段。
    api.updateElement("element", { data: {} });
    return {};
  },
});
export const next = defineElement({
  type: first.type,
  dataVersion: 2,
  collaboration: { textFields: ["code"] },
  previousVersions: [{ element: first, access: "read" }],
  migrations: [
    {
      from: 1,
      migrate(data) {
        const { source, ...rest } = data;
        return { ...rest, code: String(source) };
      },
    },
  ],
  render: () => null,
});
export const invalid = defineElement({
  type: "fixture.board.invalid",
  dataVersion: 1,
  render: () => null,
  // @ts-expect-error 旧版本名称不能进入正式作者定义。
  schemaVersion: 1,
});
