// 根页注册：组件由 AppShell 经 PageHost rootContent 渲染（home 常驻 + inert 隔离），
// 此处仅提供 meta（栈语义、history 序列化参与返回判定）。

import { definePage } from "../../../router";

export default definePage({
  key: "home",
  params: {},
  transition: { preset: "none" },
  component: () => null,
});
