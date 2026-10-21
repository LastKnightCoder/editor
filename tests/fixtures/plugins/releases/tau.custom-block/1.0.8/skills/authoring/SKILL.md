---
name: "自定义组件块"
description: "用户要求可交互的 React、DOM、Canvas 演示时加载，按运行时契约与主题规范生成 custom-block。"
---

# 自定义组件块（custom-block）

在文档里嵌入一个可交互的 React 组件，多用于演示 CSS / DOM / 图形特性。块会渲染在正文流中，外观要和应用融为一体：只用主题语义色、应用的字号与圆角刻度、`ui` 控件。

## 何时使用

- 只有用户明确要求交互演示、可操作的小组件、动态效果时才写。
- 静态内容（说明、列表、表格、提示框、代码示例）一律用普通 Markdown 与已有扩展语法。
- 原理说明写在块外的正文里，块内只放演示本身和操作所需的最少文字。

## 输出格式

````md
```custom-block
const { useState } = React;

const Component = () => {
  const [count, setCount] = useState(0);
  return (
    <div className="flex items-center gap-3">
      <ui.Button variant="secondary" size="sm" onClick={() => setCount(c => c + 1)}>
        点击 +1
      </ui.Button>
      <span className="text-tau-body text-ink-2">已点击 {count} 次</span>
    </div>
  );
};
```
````

- 单段 TSX，必须声明名为 `Component` 的无参组件。
- 不写 `import` / `export`，没有模块系统；hooks 从 `React` 解构。
- 可以在 `Component` 外声明常量和辅助组件。

## 可用绑定（只有这些）

| 绑定          | 用途                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `React`       | `const { useState, useEffect, useRef, useMemo, useCallback, useId } = React`                                                                                     |
| `ui`          | 应用设计系统控件，见下表                                                                                                                                         |
| `toast`       | 轻提示：`toast.success("已复制")`、`toast.error("失败")`、`toast.info(...)`                                                                                      |
| `useTokens()` | 返回 `{ isDark, color(word) }`。`color("accent")` 得到当前主题下的实际色值，只用于 Canvas、SVG 属性、JS 计算颜色；主题切换时组件自动重渲染，`color` 引用随之变化 |
| `icons`       | lucide 图标组件：`<icons.Copy className="size-4" />`，或作为 `ui.Button` 的 `icon={icons.Play}`；名称为 lucide 的 PascalCase 组件名                              |

`ui` 控件：

| 组件                      | 关键 props                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.Button`               | `variant`: `primary`（每块至多一个）/ `secondary` / `soft` / `ghost` / `danger` / `danger-soft`；`size`: `sm` / `md`；`icon={icons.X}` 左位图标；`loading`；`block`    |
| `ui.IconButton`           | 纯图标按钮，原生 button 属性；子元素放图标，必须给 `aria-label`                                                                                                        |
| `ui.Input`                | 原生 input 属性；`size`; `clearable`                                                                                                                                   |
| `ui.Textarea`             | 原生 textarea 属性                                                                                                                                                     |
| `ui.NumberInput`          | `value: number \| null`、`onValueChange`、`min` / `max` / `step`、`size`                                                                                               |
| `ui.Switch`               | `checked`、`onCheckedChange(boolean)`、`label`、`size`                                                                                                                 |
| `ui.Checkbox`             | 原生 checkbox 属性（`checked` + `onChange`）；`label`                                                                                                                  |
| `ui.RadioGroup` + `Radio` | `RadioGroup`: `label`（必填，显示为组标题）、`value`、`onValueChange`、`orientation`: `horizontal` / `vertical`；`Radio`: `value`、`label`                             |
| `ui.Select`               | `options: { value, label }[]`、`value`、`onValueChange`、`size`、`aria-label`                                                                                          |
| `ui.Tag`                  | `color`: `red` / `orange` / `yellow` / `green` / `gray` / `blue` / `purple`                                                                                            |
| `ui.Spinner`              | 加载指示                                                                                                                                                               |
| `ui.Tooltip`              | 悬停 / 聚焦说明，不可交互：`content`、`placement`（默认 `top`）；子元素为单个原生元素                                                                                  |
| `ui.Popover`              | 点击打开、内容可继续操作：`trigger`（单个原生元素或 `ui.Button`）、`placement`、`className` 控宽；内容用 `ui.Popover.Header` / `ui.Popover.Body` / `ui.Popover.Footer` |

没有对话框、抽屉、菜单：块是文档内容，不弹出模态遮罩。悬停说明用 `ui.Tooltip`，点开查看或调整用 `ui.Popover`。

## 样式

**载体**：Tailwind 类名优先；Tailwind 写不了的（CSS 新特性、复杂选择器、keyframes）写在块内 `<style>`；少量动态值用 `style={{}}`。类名会在运行时按源码扫描编译，**必须完整出现在源码里**，不要拼接（`bg-tag-${i}` 编译不出来，改为数组里写全 `"bg-tag-1"`）。

**颜色只用语义类**，随主题自动切换。不写 `dark:`，也不按 `isDark` 分支选颜色：

| 用途          | 类名                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 舞台 / 区域底 | 默认透明，划区域用 `border border-line-1`；极浅底 `bg-hover`（读数区、序号圆点、代码标记）；`bg-surface`（舞台上的卡片、方块）。`bg-sunken` 颜色很重，只在确需深底对比时用 |
| 文字          | `text-ink-1` 正文、`text-ink-2` 次要、`text-ink-3` 注释与读数                                                                                                              |
| 描边          | `border-line-1` 常规、`border-line-2` 弱分隔                                                                                                                               |
| 强调          | `bg-accent text-ink-inverse` 实心、`bg-accent-soft text-accent-text` 轻量                                                                                                  |
| 状态          | `ok` / `warn` / `danger` / `info`，底色加 `-soft`（`bg-ok-soft text-ok`）                                                                                                  |
| 交互态        | `hover:bg-hover`、`active:bg-press`、选中 `bg-selected`                                                                                                                    |
| 并列对象      | `tag-1` … `tag-5`（及 `-soft`），用于多个方块、多条曲线等需要互相区分的对象                                                                                                |

`<style>` 和 `style={{}}` 里同样只写 `var(--tau-*)`，词与上表一致，如 `var(--tau-accent)`、`var(--tau-bg-surface)`、`var(--tau-line-1)`。

禁止：Tailwind 调色板（`bg-blue-500`、`text-zinc-800`）、hex、`rgb()`、`hsl()`、白底黑字这类写死的配色。

**演示色例外**：颜色本身就是演示内容时（渐变色标、混合模式、`color-mix()`），被演示的那个元素可以写字面颜色，要求浅色和深色背景下都清晰；舞台、文字、控件仍走语义色。

**尺度**：

- 字号：`text-tau-body`（默认）、`text-tau-meta`、`text-tau-sm`，大号数字或标题 `text-tau-title`；代码与数值 `font-tau-mono`。
- 圆角：`rounded-tau-sm`（舞台内元素）、`rounded-tau-md`（舞台）；正圆与胶囊形用 `rounded-full`；阴影只用 `shadow-card`；过渡缓动 `ease-tau-out`。
- 不用 Tailwind 默认字号、圆角、阴影刻度（`text-sm`、`rounded-lg`、`shadow-md`）；间距、宽高用默认刻度即可。

**版式**：

- 编辑器已提供块的外框与四周内边距（悬停时有浅底），模板最外层不要再加 padding，不要再包一层带阴影的大卡片，也不要给整块铺深色底。
- 宽度跟随正文栏，不写死宽度；高度由内容撑开，Canvas 这类需要定高时用 `h-[200px]`。
- 侧栏、读数面板用弹性宽度（`grid-cols-[minmax(0,1fr)_minmax(240px,38%)]`），不写死窄宽；方法名、URL 这类不能断行的等宽长串加 `min-w-0 break-all`，避免撑出容器。
- 推荐骨架：舞台 `rounded-tau-md border border-line-1 p-4`，不加底色（放被演示对象）→ 控件行 `flex flex-wrap items-center gap-3` → 读数 `text-tau-meta text-ink-3 font-tau-mono`，整体 `flex flex-col gap-4`。

**样式隔离**：块内 `<style>` 一律包在无前缀的 `@scope { }` 里，它只作用于 `<style>` 父元素的子树，不会影响页面其他部分。`@keyframes` 不受 `@scope` 约束，名字加前缀，如 `cb-bounce`。

## 行为

- `addEventListener`、`setInterval`、`requestAnimationFrame`、`ResizeObserver` 都要在 effect 的清理函数里释放：块可能因源码编辑、滚动而卸载。主题变化只刷新组件，不重新编译源码。
- 只通过 ref 操作自己的 DOM；不用 `document.querySelector` 读写块外元素，不改 `document.body`。
- 原生事件对象的 `eventPhase`、`currentTarget` 只在派发期间有效：在处理器里同步读出再交给 `setState`，不要在更新函数里读 `event`。
- 演示事件目标、冒泡路径时，目标元素内部的文字标签加 `pointer-events-none`，否则点在文字上时目标会变成文字节点所在的元素。
- 演示原生 DOM 行为（`value` 与特性同步、属性反射等）时，不要用 React 的 `defaultValue` / 受控 `value` 设初值：React 挂载时会赋值 `.value`，让输入框提前进入「已修改」状态；改为挂载后经 ref 调用 `setAttribute`。
- 不发网络请求，不用 `localStorage`，不读写 `window` 上的全局变量，不用动态 `import()`。
- Canvas：按 `devicePixelRatio` 设置画布像素尺寸，用 `ResizeObserver` 跟随宽度重绘；颜色取 `useTokens().color(...)`，并把 `color` 放进 effect 依赖，主题切换即重绘；`getContext` 可能返回 `null`，要判空。

## 文案

- 简体中文，短句，全角标点，不用 emoji。
- 控件文案用动词短语（「重置」「播放动画」）；读数写成 `标签：值`（`距离：128px`）。
- CSS 属性名、属性值、代码保持原文。

## 示例

### 控件驱动布局（并列对象用 tag 色）

```custom-block
const { useState } = React;

const OPTIONS = ["flex-start", "center", "space-between", "space-evenly"];
const BOXES = ["bg-tag-1", "bg-tag-2", "bg-tag-3"];

const Component = () => {
  const [justify, setJustify] = useState("flex-start");

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex h-28 items-center gap-2 rounded-tau-md border border-line-1 p-4"
        style={{ justifyContent: justify }}
      >
        {BOXES.map((color, index) => (
          <div
            key={color}
            className={`grid size-12 place-items-center rounded-tau-sm text-tau-meta text-ink-inverse ${color}`}
          >
            {index + 1}
          </div>
        ))}
      </div>
      <ui.RadioGroup
        label="justify-content"
        value={justify}
        onValueChange={setJustify}
        orientation="horizontal"
      >
        {OPTIONS.map(value => (
          <ui.Radio key={value} value={value} label={value} />
        ))}
      </ui.RadioGroup>
    </div>
  );
};
```

### CSS 特性演示（`@scope` 隔离样式）

```custom-block
const { useState } = React;

const SLIDES = [1, 2, 3, 4, 5, 6];

const Component = () => {
  const [snap, setSnap] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        @scope {
          .track { scroll-snap-type: x mandatory; }
          .track[data-snap="off"] { scroll-snap-type: none; }
          .slide { scroll-snap-align: center; }
        }
      `}</style>
      <div
        data-snap={snap ? "on" : "off"}
        className="track flex gap-3 overflow-x-auto rounded-tau-md border border-line-1 p-4"
      >
        {SLIDES.map(n => (
          <div
            key={n}
            className="slide grid h-24 w-[60%] shrink-0 place-items-center rounded-tau-sm border border-line-1 bg-surface text-tau-title text-ink-2"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ui.Switch checked={snap} onCheckedChange={setSnap} label="启用吸附" />
        <span className="font-tau-mono text-tau-meta text-ink-3">
          scroll-snap-type: {snap ? "x mandatory" : "none"}
        </span>
      </div>
    </div>
  );
};
```

### Canvas（`useTokens` 取色，主题切换自动重绘）

```custom-block
const { useEffect, useRef } = React;

const CURVES = [
  { token: "tag-1", frequency: 1 },
  { token: "tag-2", frequency: 2 },
];

const Component = () => {
  const canvasRef = useRef(null);
  const { color } = useTokens();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = color("line-1");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      for (const { token, frequency } of CURVES) {
        ctx.strokeStyle = color(token);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
          const y = height / 2 - Math.sin((x / width) * Math.PI * 2 * frequency) * height * 0.35;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [color]);

  return <canvas ref={canvasRef} className="h-[200px] w-full rounded-tau-md border border-line-1" />;
};
```

### 演示色（颜色就是演示内容）

```custom-block
const { useState } = React;

const SHAPES = [
  { value: "circle", label: "circle" },
  { value: "ellipse", label: "ellipse" },
];
const SIZES = [
  { value: "closest-side", label: "closest-side" },
  { value: "farthest-corner", label: "farthest-corner" },
];

const Component = () => {
  const [shape, setShape] = useState("circle");
  const [size, setSize] = useState("farthest-corner");
  const gradient = `radial-gradient(${shape} ${size} at 30% 40%, #f6c453, #e8604c 45%, #6a4c93)`;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-tau-md border border-line-1 p-4">
        <div className="h-40 rounded-tau-sm" style={{ backgroundImage: gradient }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ui.Select size="sm" aria-label="形状" options={SHAPES} value={shape} onValueChange={setShape} />
        <ui.Select size="sm" aria-label="尺寸" options={SIZES} value={size} onValueChange={setSize} />
      </div>
      <code className="break-all font-tau-mono text-tau-meta text-ink-3">
        background-image: {gradient};
      </code>
    </div>
  );
};
```

### 悬停说明与点开详情（`Tooltip` / `Popover` / `icons`）

```custom-block
const { useState } = React;

const EASINGS = [
  { name: "ease-out", value: "cubic-bezier(0.22, 1, 0.36, 1)", note: "先快后慢，适合进入" },
  { name: "ease-in", value: "cubic-bezier(0.55, 0, 1, 0.45)", note: "先慢后快，适合离开" },
  { name: "linear", value: "linear", note: "匀速，适合进度与旋转" },
];

const Component = () => {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-tau-md border border-line-1 p-4">
        {EASINGS.map(easing => (
          <div key={easing.name} className="flex items-center gap-3">
            <ui.Tooltip content={easing.value}>
              <span className="w-20 shrink-0 font-tau-mono text-tau-meta text-ink-2">{easing.name}</span>
            </ui.Tooltip>
            <div className="relative h-8 flex-1">
              <div
                className="absolute top-0 size-8 rounded-tau-sm bg-accent"
                style={{
                  left: playing ? "calc(100% - 2rem)" : "0",
                  transition: `left 1.2s ${easing.value}`,
                }}
              />
            </div>
            <ui.Popover
              placement="left"
              className="w-[240px]"
              trigger={
                <ui.IconButton aria-label={`${easing.name} 说明`}>
                  <icons.Info className="size-4" />
                </ui.IconButton>
              }
            >
              <ui.Popover.Header>{easing.name}</ui.Popover.Header>
              <ui.Popover.Body>
                <p className="text-tau-body text-ink-2">{easing.note}</p>
              </ui.Popover.Body>
            </ui.Popover>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <ui.Button
          variant="secondary"
          size="sm"
          icon={playing ? icons.RotateCcw : icons.Play}
          onClick={() => setPlaying(value => !value)}
        >
          {playing ? "复位" : "播放动画"}
        </ui.Button>
      </div>
    </div>
  );
};
```

## 输出前自查

1. 有 `const Component`，没有 `import` / `export`。
2. 没有 `antd`、`hooks.`、`components.`、`dark:`、`isDark ?` 选色。
3. 除演示色元素外，没有 hex / `rgb()` / Tailwind 调色板。
4. 类名完整写在源码里，没有字符串拼接出的类名。
5. `<style>` 包在 `@scope { }` 里；所有监听、定时器、观察器都有清理。
6. 文案为中文短句，没有 emoji。
