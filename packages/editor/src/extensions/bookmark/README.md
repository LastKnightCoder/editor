# 网页书签扩展

`@tau/editor/extensions/bookmark` 持有块级网页书签：节点模型、卡片渲染（横向 / 封面 / 紧凑三种外观）、「粘贴为」菜单、编辑面板、块面板入口与 Markdown codec。

```ts
import { createEditorKit } from "@tau/editor";
import bookmarkExtension from "@tau/editor/extensions/bookmark";
import linkExtension from "@tau/editor/extensions/link";

// 书签须排在链接之前：空段落的网址粘贴先由书签认领
export const kit = createEditorKit({ extensions: [bookmarkExtension, linkExtension] });
```

- 依赖链接扩展（复用粘贴成链与网址判断），装配书签时必须同时装配链接。
- /markdown 导出 bookmarkCodec，导出为独占一段的 `[标题](网址)`，导入不反向识别。
- 样式扫描须包含本模块 src；颜色只取 `--ed-*`。

## 宿主服务

| 服务                         | 用途                                   | 未注册时             |
| ---------------------------- | -------------------------------------- | -------------------- |
| `IFetchService`              | 跨域读取网页与下载封面 / 图标          | 插入后直接显示网址卡 |
| `IResourceService.upload`    | 存储封面与图标（跟随宿主资源存储设置） | 只记网站原地址       |
| `IOpenerService`             | 打开网页                               | `window.open` 新窗口 |
| `IEditorSlots.Image`（可选） | 封面与图标的本地路径解析               | 原生 `<img>`         |

## 交互约定

| 场景     | 行为                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| 打开     | 桌面单击整卡打开（编辑态也是）；触屏编辑态单击只选中，阅读态单击打开                               |
| 粘贴     | 顶层空段落粘贴单个网址：先成链接，并弹「粘贴为」菜单（链接 / 网页书签 / 纯文本）；行内粘贴不弹菜单 |
| 读取     | 插入时读取一次写进 `meta`，渲染只读快照；读取中是本机内存状态，不进文档                            |
| 编辑     | 改过的标题 / 描述 / 封面记入 `overrides`，「重新读取」只更新 `meta`                                |
| 外观     | `appearance` 缺省为横向卡；封面卡无封面时按横向卡显示；横向卡宽度 < 360px 时隐藏封面               |
| 图片回退 | 先用存储后的地址，加载失败退回网站原地址，再失败不显示                                             |
