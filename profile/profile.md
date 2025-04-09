## 个人介绍

<div style="display: flex; flex-wrap: wrap;">
  <p style="margin: 0 0 10px 0; line-height: 1.4; flex: 1;">姓名：熊滔</p>
  <p style="margin: 0 0 10px 0; line-height: 1.4; flex: 1;">出生年月：1999/02</p>
</div>
<div style="display: flex">
  <p style="margin: 0 0 10px 0; line-height: 1.4; flex: 1;">电话：178-5422-9670</p>
  <p style="margin: 0 0 10px 0; line-height: 1.4; flex: 1">邮箱：2223106858@qq.com</p>
</div>

[个人博客：https://lastknightcoder.github.io/blog](https://lastknightcoder.github.io/blog)

## 教育经历

2020 - 2022 哈尔滨工业大学 微波工程

2016 - 2020 山东大学 通信工程

## 个人技能

1. 熟悉 HTML/CSS/Less 的使用，能熟练使用 [Flex](https://lastknightcoder.github.io/slides-flex/1)、[Grid](https://lastknightcoder.github.io/slides-grid/1)、容器查询等现代布局手段进行响应式布局，有移动端开发经验

2. 熟悉 TypeScript/JavaScript，ES6+ 语法

3. 熟悉 React 及相关技术栈，了解源码实现

4. 熟悉基本的数据结构和算法

5. 了解 Node.js，Rust，Python 等后端语言，均有较短的开发经验

## 项目经历

### 离线笔记软件

基于 React + Electron + Sqlite 构建的跨端离线笔记软件，代码量 10w+，开源地址：[https://github.com/LastKnightCoder/editor](https://github.com/LastKnightCoder/editor)，关于软件支持的功能可参见[这里](https://lastknightcoder.github.io/editor/introduce/index.html)。

亮点：

- **所见即所得**的富文本编辑

  - 编辑体验追齐 Notion 的块编辑器

  - 插件系统，所有的块能力均通过插件集成，包括工具栏，命令面板，快捷键，Markdown 导出，即插即用

  - 丰富的块能力，除了常见的段落、列表、表格、代码块、数学公式等基本能力外，还支持 Tabs 布局，多列布局，React 组件，Tikz 绘图，批注，图册等高级能力

- 无限大小的白板画布

  - 无限大小可缩放拖拽的白板能力

  - 插件系统

    - 核心插件：历史记录，拖拽，选择，视口变换，复制粘贴

    - 组件插件：几何图形，箭头，富文本，图片，视频，思维导图

  - 思维导图

- AI 能力集成

  - AI 搜索，基于向量语义化的搜索能力

  - AI 剪藏，通过 AI 直接剪藏网页为编辑器支持的富文本格式

  - AI 对话，基于本地知识库的对话能力

  - AI 续写，基于上下文的创作能力

### M 站的开发与维护

参与了高德 PC 站(amap.com) 和 M 站(m.amap.com) 的开发与维护，负责开发 M 站的唤端体系改造，路线分享还原，技术栈升级等项目。

项目的难点/痛点：

- 唤端体系重构：设计基于配置的标准化唤端方案，回端率提升 20%（附技术文章 [H5 唤端实践](https://lastknightcoder.github.io/blog/h5-call-app)）

- 技术栈升级：主导制定渐进式迁移方案，支持新旧页面并行开发，使用新技术栈后页面秒开率提升 20%，回端率提升 5%

### WIA Web 端开发

参与 WIA(work in amap) 项目开发，负责 Web 端功能的开发。深度参与并主导图面资源绘制、海量点资源绘制、高清出图、图面性能优化等多个专项。

项目的难点/痛点：

- 海量点渲染优化：通过网格划分实现点抽稀/聚合算法，支持10万级点数据流畅交互（拖拽/移动），性能提升显著

- 高清出图：使用离屏 Canvas 分块渲染地图覆盖物，实现指定范围任意层级的高清地图打印

- 地图资源绘制库：统一绘制 API 与增量更新机制，解决资源分散绘制问题，消除拖拽闪烁（性能提升 40%）

- SVG合成渲染：将多层覆盖物合并为单 SVG 图片，使单点渲染覆盖物减少 70%，承载量从 3000 点提升至 5000+

### 低代码平台开发

参与内部低代码平台开发与维护，包括平台的功能开发与 H5 组件的开发，先后参与了模板中心、主题设置、数据统计等多个功能的开发，并为使用的 H5 物料搭建了一个公共组件库。

项目的难点/亮点：

- 主导模板中心、主题设置、数据统计等核心模块开发

- 搭建H5公共组件库，封装SVG/Canvas文本垂直居中组件，解决多机型适配问题（支持文本溢出/懒加载优化）

- 技术文章输出：[移动端文字垂直居中方案](https://lastknightcoder.github.io/blog/mobile-text-middle)

### 其他

- Web 部署平台，结合 Jenkins，实现 Web，微信小程序、支付宝小程序的自动部署

- AI 平台，图生代码平台，RAG 平台

- 高德春节拜年活动性能优化，秒开率从 37% -> 72%
