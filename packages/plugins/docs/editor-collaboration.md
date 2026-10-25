# 编辑器节点的同步与协作

本页对应 SDK 0.45.0 的作者契约。运行时由 Tau 客户端提供，升级 npm 依赖不会更新用户的客户端；插件最低宿主版本须以实际通过验收的发行版为准。

## 从旧 SDK 升级

1. 将 `@tau/plugins` 别名依赖固定为 `npm:@xiongtao.xt/tau-plugins@0.45.0`，重新生成锁文件并执行类型检查。
2. 为节点声明 `dataVersion`，把需要并发编辑的字符串列入 `collaboration.textFields`；资源字段沿用 `resources`。
3. 将源码编辑改为 `SourceBlockEditor` 的 `element + field` 或 `useTextField`，移除 `initValue/onChange` 及通过普通属性补丁整段覆盖源码的写法。
4. 无损传递正文时同时保留 `nodes` 和 `contracts`；需要保留的折叠、标签等本机视图状态使用 `view/updateView`。
5. 保存形状变化须声明精确的 `previousVersions` 和 `migrations`，由宿主显式执行转换。只升级插件包不改写已有文档。

## 声明与源码编辑

```tsx
const diagram = defineEditorElement<DiagramElement>({
  type: "example.diagram",
  dataVersion: 1,
  kind: "block",
  isVoid: true,
  collaboration: { textFields: ["source"] },
  resources: [{ path: "images[].url", kind: "image" }],
  render: ({ element, attributes, children }) => (
    <div {...attributes}>
      <SourceBlockEditor element={element} field="source" mode="text" title="图表" icon={Code}>
        <DiagramPreview source={element.source} />
      </SourceBlockEditor>
      {children}
    </div>
  ),
});
```

`DiagramElement`、`Code` 和 `DiagramPreview` 是插件自己的节点类型、图标与预览组件。`textFields` 只列不重复的顶层字符串属性。字段不能与宿主身份、结构属性或资源地址重叠。正文其它属性默认同步，对象和数组按整个属性更新。

源码使用 `SourceBlockEditor` 的 `element + field`；不要再传 `initValue/onChange`，也不要通过 `useElement().update` 整段覆盖声明的源码字段。预览与编译可以防抖，输入提交不防抖。

自定义原生输入复用同一文本句柄：

```tsx
const source = useTextField(element, "source");
return <textarea ref={source.inputRef} defaultValue={source.value} readOnly={source.readOnly} />;
```

`inputRef` 处理输入法、远端更新、选区、撤销和卸载冲刷，不要再给该输入传受控 `value/onChange`。其它输入组件使用 `edit({ offset, remove, text })` 或 `editBatch`；操作携带句柄读取时的修订，冲突后保留待应用输入。`error` 表示未确认保存，不能当成功关闭并丢弃输入。宿主的原生绑定在失败时保留输入框草稿并停止写入。

普通属性仍使用 `useElement(element).update(patch)`。需要重启保留的本机标签、折叠等状态使用同一接口的 `view / updateView(patch)`；临时弹窗放组件状态。编译产物放可重建缓存，不写正文。`activeKey`、`isFold`、`svg` 等名字没有全局过滤规则，插件不得依赖宿主替自己过滤数据。

附件沿用 `resources`。没有 `resourceRefs`、`localFields`、`private` 或 `sync` 第二套声明。资源声明只说明位置，上传、解析、访问权限仍由宿主资源能力处理。

## 版本升级

首次声明用 `dataVersion: 1`。只改渲染、菜单或修复实现不升数据版本；改变源码字段、资源字段或持久化形状时升数据版本。宿主生成契约摘要，作者不编写摘要或客户端兼容范围。

以下完整入口使用 `lucide-react` 图标；在插件工程先执行 `pnpm add lucide-react`。

```tsx
import {
  definePlugin, defineEditorExtension, defineEditorElement, SourceBlockEditor,
  type EditorElementRenderProps,
} from "@tau/plugins";
import { Code } from "lucide-react";

interface DiagramV1 {
  type: "example.diagram";
  source: string;
  title?: string;
  children: { type: "formatted"; text: string }[];
}
interface DiagramV2 {
  type: "example.diagram";
  code: string;
  title?: string;
  children: { type: "formatted"; text: string }[];
}
declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.diagram": DiagramV1 | DiagramV2;
  }
}
declare const __PLUGIN_META__: { id: string; name: string; version: string };

function DiagramV1View({ attributes, element, children }: EditorElementRenderProps<DiagramV1>) {
  return <div {...attributes}>
    <SourceBlockEditor element={element} field="source" mode="text" title={element.title ?? "图表"} icon={Code}>
      <pre contentEditable={false}>{element.source}</pre>{children}
    </SourceBlockEditor>
  </div>;
}
function DiagramV2View({ attributes, element, children }: EditorElementRenderProps<DiagramV2>) {
  return <div {...attributes}>
    <SourceBlockEditor element={element} field="code" mode="text" title={element.title ?? "图表"} icon={Code}>
      <pre contentEditable={false}>{element.code}</pre>{children}
    </SourceBlockEditor>
  </div>;
}

const v1 = defineEditorElement<DiagramV1>({
  type: "example.diagram", dataVersion: 1, kind: "block", isVoid: true,
  collaboration: { textFields: ["source"] }, render: DiagramV1View,
});
const v2 = defineEditorElement<DiagramV2>({
  type: "example.diagram", dataVersion: 2, kind: "block", isVoid: true,
  collaboration: { textFields: ["code"] }, render: DiagramV2View,
  previousVersions: [{ element: v1, access: "edit" }],
  migrations: [{ from: 1, migrate(data) {
    if (typeof data.source !== "string") throw new Error("旧版源码字段无效");
    if (Object.hasOwn(data, "code")) throw new Error("目标字段已存在，请保留两份内容后处理");
    const { source, ...rest } = data;
    return { ...rest, code: source };
  } }],
});

export default definePlugin({
  ...__PLUGIN_META__,
  editorExtensions: [defineEditorExtension({
    id: "example.diagram",
    elements: [v2],
    blockPanel: [{
      icon: Code,
      title: "源码图表",
      description: "插入可协作编辑的源码图表",
      keywords: ["图表", "源码"],
      onClick: editor => editor.insertNode({
        type: "example.diagram", code: "", children: [{ type: "formatted", text: "" }],
      }),
    }],
  })],
});
```

上例是 v2 的完整相关入口，`__PLUGIN_META__` 由模板注入。v1 发布时注册 `v1`，创建动作写 `source`；升级后只注册 `v2`，旧定义放在 `previousVersions`，不并列注册同名类型。新增可选 `title` 不改变文本或资源解释，仍可使用数据版本 1。安装 v2 不改写已有节点；共享文档的字段改名由宿主显式转换并切换基线。

`previousVersions` 按需保留准确的旧声明和渲染，`access` 选 `read` 或 `edit`。省略旧版本时宿主保留原数据并禁写，不把旧节点交给新版渲染器猜测。`migrations` 是旧版本到当前版本的直接转换，不需要维护任意版本之间的图。

转换函数同步返回完整业务属性，保留未知属性；不能访问网络、数据库、时间或随机数。`type`、`children` 与宿主身份由宿主保留，转换函数不能修改。宿主在用户选择升级后备份、校验并安装，不在打开文档或规范化时偷偷转换。

旧、新 Markdown 导出器用现有 `editorCodecs` 的 `dataVersion` 区分。普通 Markdown 只使用当前导入语法；导出按节点保存的精确契约分发，没有匹配导出器或导出失败时保留带契约的无损载荷。不能让旧 codec 抢占新版导入语法。

## 正文传递与旧数据

`content.read({ format: "nodes" })` 返回 `nodes` 与 `contracts`，无损写回应一起传回 `{ nodes, contracts }`。创建已声明的新节点可省略字典，由宿主准备；复制未知节点必须保留来源字典，或直接使用已有的 `copyOf`。`shareOf` 继续表示共用同一份正文。

缺插件、声明冲突或新版本不受支持时，原节点和资源声明仍随文档保存；插件不要用空节点替换读取失败的数据。旧 private blocks 只由升级入口收集与保全，普通正文不再按设备替换真身。旧私有内容进入共享正文需要持有者提供和所有者确认，不能借升级自动公开。
