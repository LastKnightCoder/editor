---
name: "TikZ 绘图"
description: "在用户要求用 TikZ 绘图或修改文档中的 TikZ 源码时使用。"
---

# TikZ 绘图

在文档中使用 tikz 围栏插入绘图，围栏内容为 TikZ 源码：

```tikz
\begin{tikzpicture}
\draw[->] (0,0) -- (2,0);
\draw (0,0) circle (0.5);
\end{tikzpicture}
```

修改已有图时保留原始源码结构、注释和空白。可以保留已有 document 环境，不要添加 documentclass。不生成需要外部文件、网络服务或额外安装宏包的代码；仅使用插件引擎已包含的能力。编译失败时检查语法与宏包，不将失败当成保存成功。

该插件支持桌面文档及随文档发布的博客，不为移动端或浏览器扩展提供渲染能力。
