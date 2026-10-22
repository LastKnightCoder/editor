# 白板扩展

白板扩展让你在 Tau 的白板上添加自己的元素（如图形、图表、组件），以及创建它们的工具。白板扩展分为两部分：

- **元素**：静态声明，描述元素长什么样、能怎么交互。没有打开任何画布时，Tau 也需要读取这些声明，例如生成预览图。
- **交互贡献**：每块画布单独创建，提供工具、命令、属性面板、快捷键等。

## 第一个元素：方块

### 1. 在 manifest 中声明

```json
{
  "whiteboard": true
}
```

### 2. 定义扩展

```tsx
import { definePlugin } from "@tau/plugins";
import { defineElement, defineWhiteboardExtension } from "@tau/plugins/whiteboard";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

const BOX = `${__PLUGIN_META__.id}.box`;

function BoxIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  );
}

const boxExtension = defineWhiteboardExtension({
  id: __PLUGIN_META__.id,
  // 元素：静态声明
  elements: [
    defineElement({
      type: BOX,
      presentation: { label: "方块", icon: BoxIcon },
      render: ({ element }) => (
        <rect
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx={8}
          fill="var(--tau-accent-soft)"
          stroke="var(--tau-accent)"
        />
      ),
      create: {
        gesture: "drag",
        defaultSize: [160, 90],
        build: ({ rect }) => ({ id: crypto.randomUUID(), type: BOX, ...rect, data: {} }),
      },
    }),
  ],
  // 交互贡献：每块画布调用一次
  create: () => ({
    tools: [
      {
        id: `${__PLUGIN_META__.id}.box-tool`,
        label: "方块",
        icon: BoxIcon,
        element: BOX,
        group: "drawing",
        order: 90,
      },
    ],
  }),
});

export default definePlugin({ ...__PLUGIN_META__, whiteboardExtensions: [boxExtension] });
```

### 3. 构建、安装、重启

白板扩展在 Tau 启动时装配，启用、停用和更新都要**完全退出并重新打开 Tau** 才生效。之后打开白板，在「扩展工具」菜单中就能找到「方块」。

## 命名规则

- 扩展 `id` 是你的插件 ID，或以插件 ID 加点开头（如 `yourname.shapes.box`）。
- 元素 `type` 必须以插件 ID 加点开头（如 `yourname.shapes.box`）。
- 工具、命令的 `id` 同样以插件 ID 作前缀。

已经有白板用了某个元素类型，就不要再改名，否则已有的元素会显示为未知元素。

## 元素

元素的通用字段（`id`、`type`、`x`、`y`、`width`、`height` 等）在元素顶层，你自己的数据放在 `data` 里。

### 元素声明

| 字段                       | 说明                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `type`                     | 元素类型                                                                             |
| `render`                   | 渲染组件，收到 `element`，返回 SVG 内容                                              |
| `presentation`             | 可选。`label`（类型名）、`icon`（图标）、`getName(element)`（列表中显示的名称）      |
| `create`                   | 可选。创建方式，声明后才能注册创建型工具，见[创建工具](#创建工具)                    |
| `interaction`              | 可选。缩放手柄与连接点，见下文                                                       |
| `schema`                   | 可选。约束 `data` 结构的 [Standard Schema](https://standardschema.dev)，必须同步校验 |
| `schemaVersion`、`migrate` | 可选。`data` 结构的版本号，以及从旧版本逐步升级的迁移函数                            |
| `sketch`                   | 可选。为 `true` 时元素支持手绘画风，见[手绘画风](#手绘画风)                          |
| `schematic`                | 可选。简略预览，见[简略预览](#简略预览)                                              |

用 `defineElement<TData>` 声明 `data` 的类型，或者传入 `schema` 让类型自动推断：

```ts
interface StickyData {
  text: string;
}

defineElement<StickyData>({
  type: `${__PLUGIN_META__.id}.sticky`,
  render: ({ element }) => <text x={element.x} y={element.y}>{element.data.text}</text>,
});
```

### 缩放与连接

```ts
interaction: {
  resize: { handles: "corners", preserveAspectRatio: true },
  connect: "rect",
},
```

- `resize.handles` 可选 `corners`（只有四角）或 `all`（默认，四角加四边）。`preserveAspectRatio` 默认 `false`，用户按住 Shift 时仍可等比缩放。
- 缩放手柄、吸附、撤销都由 Tau 处理，不要在元素里自己画缩放手柄。
- `connect: "rect"` 让元素有矩形连接点，可以用连线连接。不声明就没有连接点。

### 显示名称

`presentation.getName(element)` 返回元素在列表中显示的名称，例如便签显示它的文字。用户手动起的名字优先；返回空时显示 `label`。

### 版本迁移

`data` 的结构需要变化时，提高 `schemaVersion`，并在 `migrate` 中提供每一步升级：

```ts
schemaVersion: 2,
migrate: {
  // 从版本 1 升到版本 2
  1: element => ({ ...element, data: { ...element.data, color: "accent" } }),
},
```

`migrate` 必须覆盖从 1 到当前版本的每一步。

## 创建工具

### 创建型工具

元素声明了 `create` 后，注册一个 `element` 指向它的工具，用户就能在画布上用手势创建元素。

| `create` 字段 | 说明                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| `gesture`     | `"click"`（点击放置）或 `"drag"`（拖拽绘制）                                                             |
| `build`       | 根据手势生成元素，收到 `rect`、`start`、`end`、`click`、`options` 等，返回 `null` 则不创建；可以是异步的 |
| `defaultSize` | `click` 时必填，元素的默认尺寸；`drag` 时用于单击创建                                                    |
| `minSize`     | 可选。`drag` 绘制的尺寸小于它时不创建                                                                    |
| `constrain`   | 可选。`drag` 时按 Shift 的约束：`box`（等比，默认）或 `line`（45° 吸附）                                 |
| `after`       | 可选。创建后 `select`（选中，默认）、`edit`（进入编辑）或 `none`                                         |
| `stay`        | 可选。为 `true` 时创建后保持当前工具，可以连续创建                                                       |
| `hint`        | 可选。工具激活时画布底部的提示文字                                                                       |

### 工具

| 工具字段         | 说明                                                   |
| ---------------- | ------------------------------------------------------ |
| `id`             | 工具 ID                                                |
| `label`          | 名称，显示在菜单和提示中                               |
| `icon`           | 图标组件                                               |
| `element`        | 创建型工具：要创建的元素类型（与 `command` 二选一）    |
| `command`        | 命令型工具：点击时执行的命令 ID（与 `element` 二选一） |
| `group`、`order` | 分组与排序                                             |
| `panel`          | 可选。参数面板，见下文                                 |

插件的工具统一放在工具栏的「扩展工具」菜单里。

### 创建前选择参数

工具可以提供 `panel`，让用户先选好参数再执行：

```tsx
panel: ({ run }) => (
  <div>
    <button onClick={() => run({ color: "accent" })}>强调色</button>
    <button onClick={() => run({ color: "neutral" })}>中性色</button>
  </div>
),
```

- 创建型工具在 `create.build` 的 `options` 中读到 `run` 传入的参数；命令型工具在命令的 `payload` 中读到。
- 返回、关闭和面板卸载由 Tau 管理，`run` 执行后面板自动关闭。不要在面板里自己监听画布的指针事件。

## 交互贡献

`create(api)` 在每块画布上调用一次，返回这块画布上的交互贡献：

| 字段         | 说明                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `tools`      | 工具                                                                                                     |
| `commands`   | 命令：`{ id, execute(api, payload), enabled?(api) }`                                                     |
| `hotkeys`    | 快捷键：`{ key, command }`，键串格式如 `"mod+shift+b"`                                                   |
| `menus`      | 菜单项：`{ id, label, command, order, when? }`                                                           |
| `inspectors` | 属性面板：`{ [元素类型]: 组件 }`。选中单个该类型元素时显示在浮动属性栏，组件收到 `element` 和 `onChange` |
| `activate`   | 可选。画布显示时调用，返回的清理函数在画布隐藏时执行                                                     |
| `dispose`    | 可选。画布销毁时调用                                                                                     |

- 每块画布的状态放在 `create` 的闭包里，不要放在模块顶层，否则会在多块画布之间共享。
- `elements` 必须写在扩展顶层，不能放进 `create` 的返回值。
- `mod+k`、`mod+p`、`mod+j`、Alt+方向键和 Esc 由 Tau 保留，不能声明。

### 修改画布

通过 `api` 修改画布，不要直接修改读到的元素对象：

| 方法                                      | 用途                                           |
| ----------------------------------------- | ---------------------------------------------- |
| `api.updateElement(id, patch)`            | 修改一个元素的属性                             |
| `api.submit(operations)`                  | 提交一组结构性操作（增删元素等），作为一步撤销 |
| `api.select(ids)`                         | 设置选区                                       |
| `api.getElement(id)`、`api.getSnapshot()` | 读取元素与画布快照                             |
| `api.setActiveTool(id)`                   | 切换当前工具                                   |
| `api.readonly`                            | 画布是否只读                                   |

这些方法统一处理只读、撤销和生命周期。元素组件中可以用 `useWhiteboardAPI()` 拿到所属扩展的 `api`。

## 手绘画风

声明 `sketch: true` 后，元素可以跟随白板的手绘画风设置：

- 在元素组件中调用 `useSketch(element)`，得到 `enabled`、`level`、`seed`，据此决定怎么绘制。页面画风变化时组件会自动更新。
- `SketchPaths` 渲染手绘路径；`sketch` 命名空间提供手绘算法（`wobble`、`resample`、`inkOutline` 等），直接复用，不要自己复制实现。
- `usePageSketch()` 读取所在页面的画风；`sketch.hashSeed(text)` 为预览生成稳定的随机种子。
- 属性面板可以使用 `AttrPopover`、`AttrToggle`、`OptionGrid`、`Seg` 组件，`SketchPopover` 提供与 Tau 一致的笔触设置。

## 简略预览

`schematic(element, { dark })` 返回一组简单图元（矩形、路径等，类型见 `SchematicShape`），用于白板列表和导出弹窗里的缩略预览：

```ts
schematic: element => [
  { kind: "rect", x: element.x, y: element.y, w: element.width, h: element.height, r: 3, fill: "var(--tau-accent)" },
],
```

它必须是纯函数：只读元素数据，不调用 hook，也不依赖某块画布已经打开。真正导出图片时仍然使用完整的 `render`。

## 记住用户的选择

交互贡献需要保存用户偏好（如上次选的颜色）时，在扩展上声明依赖存储服务：

```ts
import { IPluginStorage, defineWhiteboardExtension } from "@tau/plugins/whiteboard";

defineWhiteboardExtension({
  id: __PLUGIN_META__.id,
  requires: [IPluginStorage],
  elements: [/* ... */],
  create: api => {
    const storage = api.getService(IPluginStorage);
    // storage.get / set / delete，与 context.storage 相同
    return { tools: [/* ... */] };
  },
});
```

- 存储按插件和工作区隔离，与 [`context.storage`](storage-and-network.md) 是同一份数据。
- 只在交互贡献、工具面板、属性面板和 `create.build` 中使用。元素的 `render` 和 `schematic` 只能依据元素数据，不能读存储。
- 读取失败时不要当成空数据再写回，否则会覆盖用户原有的偏好。

## 样式

- 颜色使用 Tau 的主题变量（如 `var(--tau-accent)`），这样会跟随明暗主题。
- 需要 Tailwind 工具类时，可以导入 `@tau/plugins/tailwind.css`，它提供 Tau 语义类到主题变量的映射。

## 停用与卸载

插件停用或卸载后，白板里已有的元素会保留，显示为未知元素的占位；重新安装并启用后恢复显示。保存、复制白板时也会保留这些元素的数据。
