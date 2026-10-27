/**
 * 插件开发文档的目录。正文直接取官方模板仓库（子模块 plugins/tau-plugin-template）的 docs/，
 * 不在官网另存副本。标题与各篇的一级标题一致（首篇除外），manifest.test.ts 对账。
 */
import { createDocCollection, type DocGroup } from "../collection.ts";

export const TEMPLATE_REPO_URL = "https://github.com/LastKnightCoder/tau-plugin-template";
/** 文档里指向模板仓库其他文件（如 AGENTS.md）的链接改到这里 */
export const TEMPLATE_BLOB_URL = `${TEMPLATE_REPO_URL}/blob/main/`;

const DEVELOPER_GROUPS: DocGroup[] = [
  {
    title: "开始",
    items: [
      {
        slug: "",
        title: "插件开发概览",
        summary: "Tau 插件能做什么、文档怎么读，以及写插件前的几条约定。",
      },
      {
        slug: "getting-started",
        title: "快速开始",
        summary: "跑通模板自带的计数器，在 Tau 里调试，再改成自己的插件。",
      },
      {
        slug: "plugin-basics",
        title: "插件的组成",
        summary: "manifest、入口、生命周期和 context，所有能力的基础。",
      },
      {
        slug: "portability",
        title: "多端适配",
        summary: "声明支持的平台、各平台可用的接口，以及适配手机屏幕。",
      },
    ],
  },
  {
    title: "界面与数据",
    items: [
      {
        slug: "ui",
        title: "界面",
        summary: "页面、功能入口、设置、命令，以及桌面的侧边栏与通知。",
      },
      {
        slug: "storage-and-network",
        title: "存储与网络",
        summary: "保存插件自己的数据，发起网络请求与 WebSocket 连接。",
      },
      {
        slug: "user-data",
        title: "用户数据",
        summary: "读写用户的卡片、文章、项目文档、待办与日程，以及插件自己的内容。",
      },
      {
        slug: "excerpts",
        title: "摘录",
        summary: "把外部服务里的划线、批注导入 Tau。",
      },
      {
        slug: "flashcards",
        title: "闪卡",
        summary: "帮用户创建闪卡、打开制卡窗口。",
      },
    ],
  },
  {
    title: "编辑器与白板",
    items: [
      {
        slug: "editor",
        title: "编辑器扩展",
        summary: "在文档里添加自定义块，显示图片、视频与音频。",
      },
      {
        slug: "editor-collaboration",
        title: "块的数据版本与协作",
        summary: "修改已发布块的数据结构，支持多人同时编辑块里的文字。",
      },
      {
        slug: "whiteboard",
        title: "白板扩展",
        summary: "在白板上添加自定义元素和工具，修改画布与数据版本。",
      },
    ],
  },
  {
    title: "AI",
    items: [
      { slug: "ai", title: "AI", summary: "调用用户在 Tau 中配置好的大模型。" },
      {
        slug: "mcp",
        title: "MCP 工具",
        summary: "给 Tau 的 AI 助手提供可调用的工具。",
      },
      {
        slug: "skills",
        title: "Skill",
        summary: "给 AI 写使用说明，或单独发布一套 Skill。",
      },
    ],
  },
  {
    title: "运行与服务",
    items: [
      {
        slug: "services",
        title: "编译与转换服务",
        summary: "编译 Tailwind、转换 Markdown、处理音视频。",
      },
      {
        slug: "backend",
        title: "本机后台",
        summary: "运行 Node.js 代码、调用本机程序。",
      },
      {
        slug: "site-data",
        title: "站点数据",
        summary: "开发独立博客站点，读取 Tau 发布的数据。",
      },
    ],
  },
  {
    title: "服务提供方",
    items: [
      {
        slug: "providers",
        title: "服务提供方",
        summary: "注册同步、上传、语音等服务提供方的共同写法。",
      },
      {
        slug: "providers/sync",
        title: "同步存储",
        summary: "让用户把笔记库同步到你接入的存储服务。",
      },
      {
        slug: "providers/upload",
        title: "资源上传",
        summary: "把编辑器里的图片、附件上传到你接入的存储。",
      },
      {
        slug: "providers/tts",
        title: "语音合成",
        summary: "朗读文字、生成播客与复刻音色。",
      },
      {
        slug: "providers/asr",
        title: "语音识别",
        summary: "用你接入的服务把语音转成文字。",
      },
      {
        slug: "providers/images",
        title: "图片生成",
        summary: "用你接入的模型生成或编辑图片。",
      },
      {
        slug: "providers/video",
        title: "视频来源",
        summary: "从视频网站或自建服务添加视频。",
      },
      {
        slug: "providers/publish",
        title: "博客发布",
        summary: "把 Tau 生成的博客站点发布到你接入的目标。",
      },
    ],
  },
  {
    title: "发布",
    items: [
      {
        slug: "release",
        title: "发布与更新",
        summary: "发布到插件中心，以及之后怎么发新版本。",
      },
    ],
  },
];

export const developerDocs = createDocCollection({
  site: "developers",
  basePath: "/developers/",
  name: "Tau 插件开发文档",
  groups: DEVELOPER_GROUPS,
});

/** 模板 docs/ 下的相对路径 → slug：providers/asr.md → providers/asr，README.md 对应所在目录 */
export const docSlugOfFile = (file: string) =>
  file.replace(/(^|\/)README\.md$/, "").replace(/\.md$/, "");
