import {
  InitData,
  CardTagTree,
  ArticleListItem,
  DocCollection,
} from "@blog/types";
import { Descendant } from "slate";

// Mock 卡片内容
const mockCardContent: Descendant[] = [
  {
    type: "header",
    level: 1,
    children: [{ type: "formatted", text: "这是一张示例卡片" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "这是卡片的第一段内容。卡片是知识管理的基本单位，可以记录任何想法、笔记或知识点。",
      },
      {
        type: "formatted",
        text: " 你也可以把一段内容做成",
      },
      {
        type: "content-link",
        refId: 9001,
        contentId: 105,
        contentType: "card",
        contentTitle: "内容",
        children: [{ type: "formatted", text: "内容" }],
      } as any,
      {
        type: "formatted",
        text: "链接，在开发模式下直接 hover 测试预览弹窗。",
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "卡片的特点" }],
  },
  {
    type: "bulleted-list",
    children: [
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "formatted", text: "简洁：每张卡片只记录一个核心概念" },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "代码示例" }],
  },
  {
    type: "code-block",
    language: "typescript",
    code: 'const greeting = "Hello, World!";\nconsole.log(greeting);',
    uuid: Math.random().toString(36).substring(7),
    children: [{ type: "formatted", text: "" }],
  },
  {
    type: "blockquote",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "知识就是力量。—— 培根",
            italic: true,
          },
        ],
      },
    ],
  },
];

// Mock 文章内容
const mockArticleContent: Descendant[] = [
  {
    type: "header",
    level: 1,
    children: [{ type: "formatted", text: "如何高效学习编程" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "学习编程是一个循序渐进的过程，需要理论与实践相结合。本文将分享一些高效学习编程的方法和技巧。",
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "1. 选择合适的学习路径" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "不同的编程语言适合不同的应用场景。在开始学习之前，先确定自己的目标：",
      },
    ],
  },
  {
    type: "bulleted-list",
    children: [
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "formatted", text: "Web 开发：JavaScript、TypeScript" },
            ],
          },
        ],
      },
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "数据科学：Python、R" }],
          },
        ],
      },
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "移动开发：Swift、Kotlin" }],
          },
        ],
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "2. 实践是最好的老师" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "仅仅阅读教程是不够的，必须动手写代码。建议从小项目开始，逐步增加复杂度。",
      },
    ],
  },
  {
    type: "header",
    level: 3,
    children: [{ type: "formatted", text: "推荐的练习方式" }],
  },
  {
    type: "numbered-list",
    children: [
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "完成教程中的示例代码" }],
          },
        ],
      },
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "参与开源项目" }],
          },
        ],
      },
      {
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "解决实际问题" }],
          },
        ],
      },
    ],
  },
];

// Mock 卡片标签树
const mockCardTagTree: CardTagTree[] = [
  {
    tag: "技术",
    count: 9,
    cards: [
      {
        id: 101,
        summary: "关于技术的通用思考",
        href: "/cards/101",
        category: "permanent",
        createTime: Date.now() - 86400000 * 5,
      },
    ],
    children: [
      {
        tag: "前端",
        count: 5,
        cards: [
          {
            id: 102,
            summary: "前端开发的核心概念和最佳实践",
            href: "/cards/102",
            category: "permanent",
            createTime: Date.now() - 86400000 * 3,
          },
          {
            id: 103,
            summary: "CSS 布局技巧总结",
            href: "/cards/103",
            category: "theme",
            createTime: Date.now() - 86400000 * 2,
          },
        ],
        children: [
          {
            tag: "React",
            count: 2,
            cards: [
              {
                id: 104,
                summary: "React Hooks 使用心得",
                href: "/cards/104",
                category: "permanent",
                createTime: Date.now() - 86400000,
              },
              {
                id: 105,
                summary: "React 性能优化策略",
                href: "/cards/105",
                category: "theme",
                createTime: Date.now() - 86400000 * 4,
              },
            ],
            children: [],
          },
          {
            tag: "Vue",
            count: 1,
            cards: [
              {
                id: 106,
                summary: "Vue 3 组合式 API 实践",
                href: "/cards/106",
                category: "permanent",
                createTime: Date.now() - 86400000 * 6,
              },
            ],
            children: [],
          },
          {
            tag: "TypeScript",
            count: 1,
            cards: [
              {
                id: 108,
                summary: "TypeScript 类型体操中的常见误区",
                href: "/cards/108",
                category: "theme",
                createTime: Date.now() - 86400000 * 9,
              },
            ],
            children: [],
          },
          {
            tag: "CSS",
            count: 1,
            cards: [
              {
                id: 109,
                summary: "CSS Grid 复杂布局拆解",
                href: "/cards/109",
                category: "theme",
                createTime: Date.now() - 86400000 * 11,
              },
            ],
            children: [],
          },
        ],
      },
      {
        tag: "后端",
        count: 2,
        cards: [
          {
            id: 107,
            summary: "Node.js 异步编程模式",
            href: "/cards/107",
            category: "permanent",
            createTime: Date.now() - 86400000 * 7,
          },
        ],
        children: [
          {
            tag: "Node.js",
            count: 1,
            cards: [
              {
                id: 107,
                summary: "Node.js 异步编程模式",
                href: "/cards/107",
                category: "permanent",
                createTime: Date.now() - 86400000 * 7,
              },
            ],
            children: [],
          },
          {
            tag: "数据库",
            count: 1,
            cards: [
              {
                id: 111,
                summary: "PostgreSQL 索引选择备忘",
                href: "/cards/111",
                category: "theme",
                createTime: Date.now() - 86400000 * 13,
              },
            ],
            children: [],
          },
        ],
      },
      {
        tag: "AI",
        count: 2,
        cards: [],
        children: [
          {
            tag: "Prompt",
            count: 1,
            cards: [
              {
                id: 110,
                summary: "提示词链路设计：从目标到约束",
                href: "/cards/110",
                category: "theme",
                createTime: Date.now() - 86400000 * 12,
              },
            ],
            children: [],
          },
          {
            tag: "Agent",
            count: 1,
            cards: [
              {
                id: 112,
                summary: "多 Agent 协作中的上下文切分",
                href: "/cards/112",
                category: "theme",
                createTime: Date.now() - 86400000 * 15,
              },
            ],
            children: [],
          },
        ],
      },
    ],
  },
  {
    tag: "读书笔记",
    count: 3,
    cards: [
      {
        id: 201,
        summary: "《代码整洁之道》读书笔记",
        href: "/cards/201",
        category: "literature",
        createTime: Date.now() - 86400000 * 10,
      },
    ],
    children: [
      {
        tag: "编程",
        count: 2,
        cards: [
          {
            id: 202,
            summary: "《重构》核心思想",
            href: "/cards/202",
            category: "literature",
            createTime: Date.now() - 86400000 * 8,
          },
        ],
        children: [],
      },
      {
        tag: "设计",
        count: 1,
        cards: [
          {
            id: 203,
            summary: "《写给大家看的设计书》摘录",
            href: "/cards/203",
            category: "literature",
            createTime: Date.now() - 86400000 * 16,
          },
        ],
        children: [],
      },
    ],
  },
  {
    tag: "知识管理",
    count: 3,
    cards: [
      {
        id: 301,
        summary: "个人知识系统的卡片流",
        href: "/cards/301",
        category: "permanent",
        createTime: Date.now() - 86400000 * 2,
      },
    ],
    children: [
      {
        tag: "卡片方法",
        count: 2,
        cards: [
          {
            id: 301,
            summary: "个人知识系统的卡片流",
            href: "/cards/301",
            category: "permanent",
            createTime: Date.now() - 86400000 * 2,
          },
          {
            id: 303,
            summary: "PARA 与标签如何共存",
            href: "/cards/303",
            category: "theme",
            createTime: Date.now() - 86400000 * 6,
          },
        ],
        children: [],
      },
      {
        tag: "工作流",
        count: 2,
        cards: [
          {
            id: 301,
            summary: "个人知识系统的卡片流",
            href: "/cards/301",
            category: "permanent",
            createTime: Date.now() - 86400000 * 2,
          },
          {
            id: 302,
            summary: "周回顾模板：从回顾到行动",
            href: "/cards/302",
            category: "theme",
            createTime: Date.now() - 86400000 * 5,
          },
        ],
        children: [],
      },
    ],
  },
  {
    tag: "生活",
    count: 2,
    cards: [
      {
        id: 301,
        summary: "今天突然想到的一个点子",
        href: "/cards/301",
        category: "temporary",
        createTime: Date.now() - 3600000,
      },
    ],
    children: [
      {
        tag: "运动",
        count: 1,
        cards: [
          {
            id: 401,
            summary: "晨跑后的能量记录",
            href: "/cards/401",
            category: "temporary",
            createTime: Date.now() - 86400000 * 3,
          },
        ],
        children: [],
      },
      {
        tag: "旅行",
        count: 1,
        cards: [
          {
            id: 402,
            summary: "京都旅行观察清单",
            href: "/cards/402",
            category: "temporary",
            createTime: Date.now() - 86400000 * 14,
          },
        ],
        children: [],
      },
    ],
  },
  {
    tag: "产品",
    count: 2,
    cards: [],
    children: [
      {
        tag: "需求分析",
        count: 1,
        cards: [
          {
            id: 501,
            summary: "产品需求评审备忘",
            href: "/cards/501",
            category: "theme",
            createTime: Date.now() - 86400000 * 4,
          },
        ],
        children: [],
      },
      {
        tag: "写作",
        count: 1,
        cards: [
          {
            id: 502,
            summary: "写作时的结构化提纲",
            href: "/cards/502",
            category: "theme",
            createTime: Date.now() - 86400000 * 17,
          },
        ],
        children: [],
      },
    ],
  },
];

// Mock 文章列表
const mockArticleList: ArticleListItem[] = [
  {
    id: 1,
    title: "如何高效学习编程",
    href: "/articles/1",
    createTime: Date.now() - 86400000,
  },
  {
    id: 2,
    title: "我的 2024 年度总结",
    href: "/articles/2",
    createTime: Date.now() - 86400000 * 3,
  },
  {
    id: 3,
    title: "构建个人知识管理系统",
    href: "/articles/3",
    createTime: Date.now() - 86400000 * 7,
  },
  {
    id: 4,
    title: "从零开始学 TypeScript",
    href: "/articles/4",
    createTime: Date.now() - 86400000 * 14,
  },
  {
    id: 5,
    title: "React 18 新特性详解",
    href: "/articles/5",
    createTime: Date.now() - 86400000 * 21,
  },
];

// 基础站点配置
const baseSiteConfig = {
  title: "我的知识库",
  description: "记录学习、思考与成长",
  basePath: "",
};

// 基础导航
const baseNavigation = [
  { label: "首页", href: "/", active: false },
  { label: "卡片", href: "/cards", active: false },
  { label: "文章", href: "/articles", active: false },
];

const mockDocCollections: DocCollection[] = [
  {
    type: "project",
    label: "项目",
    items: [
      {
        id: 1,
        title: "Tau 产品手册",
        href: "/docs/project/1.html",
        kind: "project",
      },
      {
        id: 2,
        title: "开放平台",
        href: "/docs/project/2.html",
        kind: "project",
      },
    ],
  },
  {
    type: "document",
    label: "知识库",
    items: [
      {
        id: 101,
        title: "创意仓库",
        href: "/docs/document/101.html",
        kind: "document",
      },
      {
        id: 102,
        title: "读书笔记",
        href: "/docs/document/102.html",
        kind: "document",
      },
    ],
  },
];

const mockContentLinkTargets = {
  "card:9001": {
    contentType: "card",
    refId: 9001,
    href: "/src/templates/card/index.html",
    title: "React 性能优化策略",
  },
  "doc:9002": {
    contentType: "doc",
    refId: 9002,
    href: "/src/templates/doc/index.html",
    title: "快速开始 - 介绍",
  },
};

// 卡片页 Mock 数据
export const mockCardPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/cards",
  })),
  docCollections: mockDocCollections,
  contentLinkTargets: mockContentLinkTargets,
  cardTagTree: mockCardTagTree,
  activeTag: "",
  content: {
    id: 104,
    content: mockCardContent,
    tags: ["技术/前端/React", "编程"],
    category: "permanent",
    createTime: Date.now() - 86400000,
    updateTime: Date.now(),
    linkedCards: [
      {
        id: 105,
        href: "/cards/105",
        summary: "React 性能优化策略",
        tags: ["技术/前端/React"],
        category: "theme",
      },
      {
        id: 102,
        href: "/cards/102",
        summary: "前端开发的核心概念和最佳实践",
        tags: ["技术/前端"],
        category: "permanent",
      },
    ],
    relatedCards: [
      {
        id: 106,
        href: "/cards/106",
        summary: "Vue 3 组合式 API 实践",
        tags: ["技术/前端/Vue"],
        category: "permanent",
      },
    ],
  },
  meta: {
    type: "card",
    publishTime: Date.now(),
  },
};

// 文章页 Mock 数据
export const mockArticlePageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/articles",
  })),
  docCollections: mockDocCollections,
  articleList: mockArticleList,
  content: {
    id: 1,
    title: "如何高效学习编程",
    author: "作者",
    content: mockArticleContent,
    tags: ["编程", "学习方法", "效率"],
    bannerBg:
      "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200",
    createTime: Date.now() - 86400000,
    updateTime: Date.now(),
  },
  meta: {
    type: "article",
    publishTime: Date.now(),
  },
};

// 文档页 Mock 数据
export const mockDocPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/docs",
  })),
  contentLinkTargets: mockContentLinkTargets,
  sidebar: [
    {
      title: "快速开始",
      children: [
        { title: "介绍", href: "/docs/intro" },
        { title: "安装", href: "/docs/install" },
        { title: "配置", href: "/docs/config" },
      ],
    },
    {
      title: "基础",
      children: [
        { title: "卡片管理", href: "/docs/cards" },
        { title: "文章写作", href: "/docs/articles" },
        { title: "标签系统", href: "/docs/tags" },
      ],
    },
    {
      title: "进阶",
      children: [
        { title: "发布配置", href: "/docs/publish" },
        { title: "主题定制", href: "/docs/theme" },
      ],
    },
  ],
  docCollections: mockDocCollections.map((collection) => ({
    ...collection,
    items: collection.items.map((item) => ({
      ...item,
      active: collection.type === "project" ? item.id === 1 : undefined,
    })),
  })),
  content: {
    id: 1,
    title: "快速开始 - 介绍",
    content: [
      {
        type: "header",
        level: 1,
        children: [{ type: "formatted", text: "介绍" }],
      },
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "欢迎使用 Tau 知识管理系统！这是一个强大的个人知识库工具，帮助你更好地组织和管理知识。",
          },
          {
            type: "formatted",
            text: " 想测试关联内容预览时，可以直接 hover 这里的",
          },
          {
            type: "content-link",
            refId: 9002,
            contentId: 1,
            contentType: "doc",
            contentTitle: "内容",
            children: [{ type: "formatted", text: "内容" }],
          } as any,
          {
            type: "formatted",
            text: "。",
          },
        ],
      },
      {
        type: "header",
        level: 2,
        children: [{ type: "formatted", text: "核心特性" }],
      },
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                children: [
                  { type: "formatted", text: "卡片式笔记：原子化的知识管理" },
                ],
              },
            ],
          },
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                children: [
                  { type: "formatted", text: "双向链接：构建知识网络" },
                ],
              },
            ],
          },
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                children: [
                  { type: "formatted", text: "静态发布：一键发布为博客" },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "header",
        level: 2,
        children: [{ type: "formatted", text: "下一步" }],
      },
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "阅读 ",
          },
          {
            type: "link",
            url: "/docs/install",
            children: [{ type: "formatted", text: "安装指南" }],
          },
          {
            type: "formatted",
            text: " 开始使用。",
          },
        ],
      },
    ],
    breadcrumb: [
      { label: "文档", href: "/docs" },
      { label: "快速开始", href: "/docs/getting-started" },
      { label: "介绍", href: "/docs/intro" },
    ],
    prevPage: undefined,
    nextPage: { title: "安装", href: "/docs/install" },
    createTime: Date.now() - 86400000 * 30,
    updateTime: Date.now() - 86400000 * 2,
  },
  meta: {
    type: "doc",
    publishTime: Date.now(),
  },
};

// 首页 Mock 数据
export const mockHomePageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/",
  })),
  docCollections: mockDocCollections,
  content: {
    hero: {
      title: "我的知识库",
      description:
        "记录学习、思考与成长的地方。这里有我的技术笔记、读书心得和生活感悟。",
    },
    docStats: {
      projects: 2,
      documents: 3,
    },
    timeline: [
      {
        type: "card",
        id: 104,
        title: undefined,
        summary:
          "React Hooks 使用心得 - 分享在实际项目中使用 Hooks 的经验和最佳实践...",
        href: "/cards/104",
        tags: ["技术/前端/React", "编程"],
        publishTime: Date.now() - 86400000,
      },
      {
        type: "article",
        id: 1,
        title: "如何高效学习编程",
        summary: "学习编程是一个循序渐进的过程，需要理论与实践相结合...",
        href: "/articles/1",
        tags: ["编程", "学习方法"],
        publishTime: Date.now() - 86400000 * 2,
      },
      {
        type: "doc",
        id: 1,
        title: "快速开始指南",
        summary: "欢迎使用 Tau 知识管理系统！这是一个强大的个人知识库工具...",
        href: "/docs/intro",
        tags: ["文档"],
        publishTime: Date.now() - 86400000 * 3,
      },
      {
        type: "card",
        id: 201,
        title: undefined,
        summary:
          "《代码整洁之道》读书笔记 - 整洁的代码是一种艺术，需要不断练习...",
        href: "/cards/201",
        tags: ["读书笔记/编程"],
        publishTime: Date.now() - 86400000 * 5,
      },
      {
        type: "article",
        id: 2,
        title: "我的 2024 年度总结",
        summary: "回顾这一年的收获与成长，展望新的一年...",
        href: "/articles/2",
        tags: ["生活", "总结"],
        publishTime: Date.now() - 86400000 * 7,
      },
    ],
  },
  meta: {
    type: "home",
    publishTime: Date.now(),
  },
};

// 列表页 Mock 数据
export const mockCardListPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/cards",
  })),
  docCollections: mockDocCollections,
  cardTagTree: mockCardTagTree,
  activeTag: "",
  content: {
    title: "全部卡片",
    type: "card",
    items: [
      {
        id: 104,
        title: undefined,
        summary:
          "React Hooks 使用心得 - 分享在实际项目中使用 Hooks 的经验和最佳实践",
        href: "/cards/104",
        tags: ["技术/前端/React", "编程"],
        createTime: Date.now() - 86400000,
      },
      {
        id: 105,
        title: undefined,
        summary: "React 性能优化策略 - 如何让 React 应用更快更流畅",
        href: "/cards/105",
        tags: ["技术/前端/React"],
        createTime: Date.now() - 86400000 * 4,
      },
      {
        id: 106,
        title: undefined,
        summary: "Vue 3 组合式 API 实践 - 组合式心智如何组织中型组件",
        href: "/cards/106",
        tags: ["技术/前端/Vue"],
        createTime: Date.now() - 86400000 * 6,
      },
      {
        id: 108,
        title: undefined,
        summary: "TypeScript 类型体操中的常见误区 - 条件类型并不总是越复杂越好",
        href: "/cards/108",
        tags: ["技术/前端/TypeScript"],
        createTime: Date.now() - 86400000 * 9,
      },
      {
        id: 109,
        title: undefined,
        summary: "CSS Grid 复杂布局拆解 - 从版心、卡片到瀑布流的组织方式",
        href: "/cards/109",
        tags: ["技术/前端/CSS"],
        createTime: Date.now() - 86400000 * 11,
      },
      {
        id: 107,
        title: undefined,
        summary: "Node.js 异步编程模式 - 任务队列、重试与超时边界",
        href: "/cards/107",
        tags: ["技术/后端/Node.js"],
        createTime: Date.now() - 86400000 * 7,
      },
      {
        id: 111,
        title: undefined,
        summary: "PostgreSQL 索引选择备忘 - 什么时候该上组合索引",
        href: "/cards/111",
        tags: ["技术/后端/数据库"],
        createTime: Date.now() - 86400000 * 13,
      },
      {
        id: 110,
        title: undefined,
        summary: "提示词链路设计：从目标到约束 - 让大模型更稳定地产出",
        href: "/cards/110",
        tags: ["技术/AI/Prompt"],
        createTime: Date.now() - 86400000 * 12,
      },
      {
        id: 112,
        title: undefined,
        summary: "多 Agent 协作中的上下文切分 - 怎么拆任务才不会互相污染",
        href: "/cards/112",
        tags: ["技术/AI/Agent"],
        createTime: Date.now() - 86400000 * 15,
      },
      {
        id: 201,
        title: undefined,
        summary: "《代码整洁之道》读书笔记 - 整洁的代码是一种艺术",
        href: "/cards/201",
        tags: ["读书笔记/编程"],
        createTime: Date.now() - 86400000 * 10,
      },
      {
        id: 202,
        title: undefined,
        summary: "《重构》核心思想 - 小步迭代如何降低设计债务",
        href: "/cards/202",
        tags: ["读书笔记/编程"],
        createTime: Date.now() - 86400000 * 8,
      },
      {
        id: 203,
        title: undefined,
        summary: "《写给大家看的设计书》摘录 - 对比���重复、对齐、亲密性",
        href: "/cards/203",
        tags: ["读书笔记/设计"],
        createTime: Date.now() - 86400000 * 16,
      },
      {
        id: 301,
        title: undefined,
        summary: "个人知识系统的卡片流 - 从捕获到沉淀的最小闭环",
        href: "/cards/301",
        tags: ["知识管理/卡片方法", "知识管理/工作流"],
        createTime: Date.now() - 86400000 * 2,
      },
      {
        id: 302,
        title: undefined,
        summary: "周回顾模板：从回顾到行动 - 把复盘真正转成下一周安排",
        href: "/cards/302",
        tags: ["知识管理/工作流"],
        createTime: Date.now() - 86400000 * 5,
      },
      {
        id: 303,
        title: undefined,
        summary: "PARA 与标签如何共存 - 文件夹负责收纳，标签负责横切",
        href: "/cards/303",
        tags: ["知识管理/卡片方法"],
        createTime: Date.now() - 86400000 * 6,
      },
      {
        id: 401,
        title: undefined,
        summary: "晨跑后的能量记录 - 运动对上午专注度的影响",
        href: "/cards/401",
        tags: ["生活/运动"],
        createTime: Date.now() - 86400000 * 3,
      },
      {
        id: 402,
        title: undefined,
        summary: "京都旅行观察清单 - 城市动线、店铺陈列与步行尺度",
        href: "/cards/402",
        tags: ["生活/旅行"],
        createTime: Date.now() - 86400000 * 14,
      },
      {
        id: 501,
        title: undefined,
        summary: "产品需求评审备忘 - 需求澄清会里最该先问的五个问题",
        href: "/cards/501",
        tags: ["产品/需求分析"],
        createTime: Date.now() - 86400000 * 4,
      },
      {
        id: 502,
        title: undefined,
        summary: "写作时的结构化提纲 - 先列论点，再决定叙述顺序",
        href: "/cards/502",
        tags: ["产品/写作"],
        createTime: Date.now() - 86400000 * 17,
      },
    ],
    pagination: {
      current: 1,
      total: 40,
      pageSize: 20,
    },
    tags: [
      { name: "技术", count: 9 },
      { name: "前端", count: 5 },
      { name: "React", count: 2 },
      { name: "AI", count: 2 },
      { name: "读书笔记", count: 3 },
      { name: "知识管理", count: 3 },
      { name: "生活", count: 2 },
      { name: "产品", count: 2 },
    ],
  },
  meta: {
    type: "list",
    publishTime: Date.now(),
  },
};

export const mockArticleListPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/articles",
  })),
  docCollections: mockDocCollections,
  content: {
    title: "全部文章",
    type: "article",
    items: [
      {
        id: 1,
        title: "如何高效学习编程",
        summary: "学习编程是一个循序渐进的过程，需要理论与实践相结合。",
        href: "/articles/1",
        tags: ["编程", "学习方法", "效率"],
        createTime: Date.now() - 86400000,
      },
      {
        id: 3,
        title: "构建个人知识管理系统",
        summary:
          "从卡片、文章到项目文档，如何建立一套可持续演进的个人知识管理系统。",
        href: "/articles/3",
        tags: ["知识管理", "工作流"],
        createTime: Date.now() - 86400000 * 7,
      },
      {
        id: 4,
        title: "从零开始学 TypeScript",
        summary:
          "从基础类型系统到工程实践，梳理 TypeScript 入门到进阶的核心学习路径。",
        href: "/articles/4",
        tags: ["TypeScript", "前端"],
        createTime: Date.now() - 86400000 * 14,
      },
    ],
    pagination: {
      current: 1,
      total: 12,
      pageSize: 10,
    },
    tags: [
      { name: "编程", count: 6 },
      { name: "知识管理", count: 4 },
      { name: "TypeScript", count: 3 },
    ],
  },
  meta: {
    type: "list",
    publishTime: Date.now(),
  },
};

export const mockDocListPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/docs",
  })),
  docCollections: mockDocCollections,
  content: {
    title: "全部文档",
    type: "doc",
    items: [
      {
        id: 1,
        title: "快速开始指南",
        summary: "从安装、配置到基础使用，帮助你快速进入 Tau 的工作流。",
        href: "/docs/intro",
        tags: [],
        createTime: Date.now() - 86400000 * 2,
      },
      {
        id: 2,
        title: "发布配置说明",
        summary: "介绍发布站点配置、模板能力与静态页面生成方式。",
        href: "/docs/publish",
        tags: [],
        createTime: Date.now() - 86400000 * 6,
      },
    ],
    pagination: {
      current: 1,
      total: 2,
      pageSize: 10,
    },
  },
  meta: {
    type: "list",
    publishTime: Date.now(),
  },
};

export const mockListPageData = mockCardListPageData;

export function getMockListPageData(
  type: "card" | "article" | "doc" = "card",
): InitData {
  switch (type) {
    case "article":
      return mockArticleListPageData;
    case "doc":
      return mockDocListPageData;
    case "card":
    default:
      return mockCardListPageData;
  }
}

// 根据页面类型获取 mock 数据
export function getMockData(pageType: string): InitData {
  switch (pageType) {
    case "card":
      return mockCardPageData;
    case "article":
      return mockArticlePageData;
    case "doc":
      return mockDocPageData;
    case "home":
      return mockHomePageData;
    case "list":
      return mockCardListPageData;
    default:
      return mockHomePageData;
  }
}
