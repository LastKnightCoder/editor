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
    count: 15,
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
        count: 8,
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
            count: 3,
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
            count: 2,
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
        ],
      },
      {
        tag: "后端",
        count: 4,
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
    ],
  },
  {
    tag: "读书笔记",
    count: 10,
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
        count: 5,
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
    ],
  },
  {
    tag: "生活",
    count: 5,
    cards: [
      {
        id: 301,
        summary: "今天突然想到的一个点子",
        href: "/cards/301",
        category: "temporary",
        createTime: Date.now() - 3600000,
      },
    ],
    children: [],
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

// 卡片页 Mock 数据
export const mockCardPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/cards",
  })),
  docCollections: mockDocCollections,
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
export const mockListPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map((n) => ({
    ...n,
    active: n.href === "/cards",
  })),
  docCollections: mockDocCollections,
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
        id: 201,
        title: undefined,
        summary: "《代码整洁之道》读书笔记 - 整洁的代码是一种艺术",
        href: "/cards/201",
        tags: ["读书笔记/编程"],
        createTime: Date.now() - 86400000 * 10,
      },
    ],
    pagination: {
      current: 1,
      total: 15,
      pageSize: 10,
    },
    tags: [
      { name: "技术", count: 15 },
      { name: "前端", count: 8 },
      { name: "React", count: 5 },
      { name: "读书笔记", count: 10 },
      { name: "生活", count: 5 },
    ],
  },
  meta: {
    type: "list",
    publishTime: Date.now(),
  },
};

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
      return mockListPageData;
    default:
      return mockHomePageData;
  }
}
