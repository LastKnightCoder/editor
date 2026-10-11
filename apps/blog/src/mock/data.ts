import { InitData, CardTagTree, ArticleListItem, DocCollection } from "@blog/types";
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
            children: [{ type: "formatted", text: "简洁：每张卡片只记录一个核心概念" }],
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
            children: [{ type: "formatted", text: "Web 开发：JavaScript、TypeScript" }],
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
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "3. CustomBlock 主题切换验证" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "下面这个示例用于验证 blog 场景下 CustomBlock 内 Tailwind dark: 样式是否会随着主题切换同步变化。",
      },
    ],
  },
  {
    type: "custom-block",
    content: `const Component = () => {
  const { useTheme } = hooks;
  const { theme, isDark } = useTheme();

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/90 p-5 text-stone-900 shadow-sm transition-colors dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            Tailwind Theme Check
          </div>
          <div className="mt-2 text-lg font-semibold">
            CustomBlock 会跟随 blog 主题切换
          </div>
        </div>
        <div
          className={
            isDark
              ? "rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200"
              : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
          }
        >
          当前主题：{theme === "dark" ? "暗色" : "亮色"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200/80 bg-white/80 p-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
          亮色主题下，这张卡片应为暖白底、柔和石色边框与深棕灰文字。
        </div>
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          暗色主题下，这张卡片应切为深石色底，并保留偏暖的强调色层次。
        </div>
      </div>
    </div>
  );
};`,
    children: [{ type: "formatted", text: "" }],
  } as any,
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
            createTime: Date.now() - 86400000 * 3,
          },
          {
            id: 103,
            summary: "CSS 布局技巧总结",
            href: "/cards/103",
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
                createTime: Date.now() - 86400000,
              },
              {
                id: 105,
                summary: "React 性能优化策略",
                href: "/cards/105",
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
            createTime: Date.now() - 86400000 * 2,
          },
          {
            id: 303,
            summary: "PARA 与标签如何共存",
            href: "/cards/303",
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
            createTime: Date.now() - 86400000 * 2,
          },
          {
            id: 302,
            summary: "周回顾模板：从回顾到行动",
            href: "/cards/302",
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
  { label: "求索录", href: "/quests", active: false },
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
      {
        id: 101,
        title: "创意仓库",
        href: "/docs/project/101.html",
        kind: "project",
      },
      {
        id: 102,
        title: "读书笔记",
        href: "/docs/project/102.html",
        kind: "project",
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

const buildDocSidebarValidationDemo = () => {
  const longVersionChildren = Array.from({ length: 18 }, (_, index) => ({
    title: `0.4.${index + 1}`,
    href: `/docs/changelog/0.4.${index + 1}.html`,
  }));

  return [
    {
      title: "0.3",
      children: Array.from({ length: 14 }, (_, index) => ({
        title: `0.3.${index + 1}`,
        href: `/docs/changelog/0.3.${index + 1}.html`,
      })),
    },
    {
      title: "0.4",
      href: "/docs/changelog/0.4.html",
      children: longVersionChildren,
    },
    {
      title: "0.5",
      children: [
        { title: "0.5.0", href: "/docs/changelog/0.5.0.html" },
        { title: "0.5.1", href: "/docs/changelog/0.5.1.html" },
      ],
    },
    {
      title: "FAQ",
      children: [
        { title: "同步相关", href: "/docs/faq/sync.html" },
        { title: "发布相关", href: "/docs/faq/publish.html" },
      ],
    },
  ];
};

const buildDocOutlineValidationContent = (): Descendant[] => [
  {
    type: "header",
    level: 1,
    children: [{ type: "formatted", text: "0.4.4 更新说明" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "这个 demo 用来验证左侧长导航滚动、带链接分组点击跳转、以及右侧页面目录高亮跟随。",
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "修复目标" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "确认长分组在展开后不会因为固定高度被截断，同时切换章节时，手动收起的其它分组状态仍会保留。",
      },
    ],
  },
  {
    type: "header",
    level: 3,
    children: [{ type: "formatted", text: "左侧导航验证点" }],
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
              {
                type: "formatted",
                text: "收起 0.3 分组后，点击 0.4.4 或 0.4 分组链接，不应把 0.3 自动展开。",
              },
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
              {
                type: "formatted",
                text: "展开 0.4 分组后，应能继续滚动看到后面的 0.4.10 以后内容，而不是被中途截断。",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "header",
    level: 3,
    children: [{ type: "formatted", text: "右侧目录高亮验证点" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "向下滚动正文时，右侧页面目录应从“修复目标”切到“左侧导航验证点”，再切到“右侧目录高亮验证点”。",
      },
    ],
  },
  {
    type: "header",
    level: 4,
    children: [{ type: "formatted", text: "深层标题缩进" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "这个四级标题同时用于验证右侧目录的深层缩进不会回退到顶格。",
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "滚动填充区块 A" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "为了方便观察目录高亮变化，这里加入较长说明文字。你可以持续下滚，观察右侧目录项的激活状态是否同步变化。",
      },
    ],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "当正文高度足够长时，目录高亮切换更容易暴露边界问题，例如标题已经越过顶部，但高亮还停留在上一个标题。",
      },
    ],
  },
  {
    type: "header",
    level: 2,
    children: [{ type: "formatted", text: "滚动填充区块 B" }],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "这里继续补充一段较长内容，让右侧目录具备多个可切换目标。你也可以点击右侧目录，确认跳转后高亮状态会同步到对应标题。",
      },
    ],
  },
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "如果需要重复验证左侧折叠状态，可以先收起 FAQ，再点击 0.4.4，对应跳转后 FAQ 仍应保持收起。",
      },
    ],
  },
];

// 卡片页 Mock 数据
export const mockCardPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map(n => ({
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
    createTime: Date.now() - 86400000,
    updateTime: Date.now(),
    linkedCards: [
      {
        id: 105,
        href: "/cards/105",
        summary: "React 性能优化策略",
        tags: ["技术/前端/React"],
      },
      {
        id: 102,
        href: "/cards/102",
        summary: "前端开发的核心概念和最佳实践",
        tags: ["技术/前端"],
      },
    ],
    relatedCards: [
      {
        id: 106,
        href: "/cards/106",
        summary: "Vue 3 组合式 API 实践",
        tags: ["技术/前端/Vue"],
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
  navigation: baseNavigation.map(n => ({
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
    bannerBg: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200",
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
  navigation: baseNavigation.map(n => ({
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
  docCollections: mockDocCollections.map(collection => ({
    ...collection,
    items: collection.items.map(item => ({
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
                children: [{ type: "formatted", text: "卡片式笔记：原子化的知识管理" }],
              },
            ],
          },
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                children: [{ type: "formatted", text: "双向链接：构建知识网络" }],
              },
            ],
          },
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                children: [{ type: "formatted", text: "静态发布：一键发布为博客" }],
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

export const mockQuestPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map(n => ({
    ...n,
    active: n.href === "/quests",
  })),
  docCollections: mockDocCollections,
  contentLinkTargets: mockContentLinkTargets,
  content: {
    id: 1,
    title: "React 列表重渲染时，为什么输入框会失焦？",
    summary: "排查 key、受控输入和父组件重建之间的关系，最后确认是列表项 key 不稳定。",
    href: "/quests/1.html",
    groupId: 1,
    groupTitle: "前端现场",
    groupColor: "#92816b",
    status: "resolved",
    description: [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "现象是每输入一个字符，输入框都会失焦。最初怀疑是防抖更新导致，后来发现根因在列表项标识。",
          },
        ],
      },
    ],
    answers: [
      {
        id: 9001,
        createTime: Date.now() - 86400000 * 2,
        updateTime: Date.now() - 86400000,
        content: [
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "先看 key 是否来自数组下标或临时生成值。如果父组件每次 render 都重新生成 key，React 会卸载并重建输入框，自然会丢失焦点。官方文档对 key 的说明也印证了这一点，之前整理的",
              },
              {
                type: "content-link",
                contentType: "card",
                refId: 9001,
                contentTitle: "React 性能优化策略",
                children: [{ type: "formatted", text: "性能优化卡片" }],
              } as any,
              { type: "formatted", text: "里也有相同结论。" },
            ],
          },
          {
            type: "code-block",
            language: "tsx",
            code: "items.map((item) => <Row key={item.id} item={item} />)",
            uuid: "quest-code-demo",
            children: [{ type: "formatted", text: "" }],
          } as any,
        ],
        source: {
          type: "custom",
          contentId: 9001,
          published: false,
        },
      },
    ],
    materials: [
      {
        index: 1,
        kind: "web-clip",
        group: "external",
        title: "Preserving and Resetting State",
        meta: "react.dev",
        excerpt:
          "React will destroy a component's state when it's removed from the tree, or when its key changes.",
        url: "https://react.dev/learn/preserving-and-resetting-state",
      },
      {
        index: 2,
        kind: "excerpt",
        group: "external",
        title: "微信读书 · 《深入浅出 React》 · 协调",
        meta: "",
        excerpt: "key 是 React 判断两次渲染中元素是否为同一个的唯一依据。",
        note: "下标当 key 在插入时一定出问题",
      },
      {
        index: 3,
        kind: "card",
        group: "note",
        title: "React 性能优化策略",
        meta: "",
        excerpt: "稳定的 key 与 memo 一起才能避免不必要的卸载重建。",
        href: "/src/templates/card/index.html",
        citeKey: "card:9001",
      },
      {
        index: 4,
        kind: "chat-session",
        group: "discussion",
        title: "排查输入框失焦",
        meta: "12 条消息",
        excerpt: "",
      },
    ],
    trail: [
      { time: Date.now() - 86400000 * 3, tone: "start", text: "提出问题", refs: [] },
      { time: Date.now() - 86400000 * 3, tone: "plain", text: "关联 2 份资料", refs: [1, 2] },
      {
        time: Date.now() - 86400000 * 2,
        tone: "note",
        text: "一开始怀疑是防抖更新导致，去掉防抖后依旧失焦，排除。",
        refs: [],
      },
      { time: Date.now() - 86400000 * 2, tone: "plain", text: "关联对话", refs: [4] },
      { time: Date.now() - 86400000 * 2, tone: "milestone", text: "写下卡片", refs: [3] },
      { time: Date.now() - 86400000, tone: "done", text: "标为已解决", refs: [] },
    ],
    createTime: Date.now() - 86400000 * 3,
    updateTime: Date.now() - 86400000,
    resolvedTime: Date.now() - 86400000,
  },
  meta: {
    type: "quest",
    publishTime: Date.now(),
  },
};

export const mockQuestMultiAnswerPageData: InitData = {
  ...mockQuestPageData,
  content: {
    ...(mockQuestPageData.content as any),
    id: 2,
    title: "发布页怎样避免重复打包同一份答案内容？",
    summary: "同一份 content 可以在卡片、文章和求索录之间复用，发布时按页面需求决定链接或内嵌。",
    href: "/quests/2.html",
    groupTitle: "发布",
    description: [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "这个调试样例用于观察多答案布局：一个答案直接内嵌，另一个答案来自已发布文章，页面需要保持轻量、清晰且不重复发布内容。",
          },
        ],
      },
    ],
    answers: [
      {
        id: 9101,
        createTime: Date.now() - 86400000 * 5,
        updateTime: Date.now() - 86400000 * 4,
        content: [
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "发布生成器先判断答案 contentId 是否已经投射为卡片或文章。如果本次也选择发布了对应页面，求索录只保留来源链接，由前端读取目标页面的初始化数据来展示正文。这个判断应该只服务于发布体积和阅读完整性，不应该反过来改变用户原本选择发布的范围。",
              },
            ],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "换句话说，求索录引用了卡片，并不代表这张卡片必须被公开发布。只有当卡片本身已经在发布选择里，答案才复用它的页面数据；否则答案内容直接内嵌在求索录详情里。这样读者打开求索录时能读完整内容，发布目录也不会因为引用关系膨胀。",
              },
            ],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "这个策略的关键是把“内容复用”和“页面生成”拆开：复用的是同一份 content 数据，生成的是用户明确选择的公开页面。求索录只是另一个阅读入口，不应该成为隐式发布卡片或文章的开关。",
              },
            ],
          },
        ],
        source: {
          type: "custom",
          contentId: 9101,
          published: false,
        },
      },
      {
        id: 9102,
        createTime: Date.now() - 86400000 * 3,
        updateTime: Date.now() - 86400000 * 2,
        content: [
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "如果对应卡片或文章没有发布，求索录会直接内嵌答案正文。这样读者不需要跳转，也不会因为引用关系额外生成未选择的页面。内嵌时仍然保留答案来源信息，方便以后排查这段答案原本来自哪类内容。",
              },
            ],
          },
          {
            type: "code-block",
            language: "ts",
            code: "const shouldInline = !source?.href;",
            uuid: "quest-multi-code-demo",
            children: [{ type: "formatted", text: "" }],
          } as any,
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "这里的 source.href 只在目标页面已经发布时存在。没有 href 不代表没有来源，只代表这份来源不适合在公开站点中作为独立页面出现。这个约定能让前端渲染逻辑非常直接：有 href 就取远程初始化数据，没有 href 就渲染内嵌 content。",
              },
            ],
          },
        ],
        source: {
          type: "article",
          id: 18,
          contentId: 9102,
          href: "/articles/18.html",
          title: "发布数据复用策略",
          published: true,
        },
      },
      {
        id: 9103,
        createTime: Date.now() - 86400000 * 2,
        updateTime: Date.now() - 86400000,
        content: [
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "列表页和详情页只需要知道答案的展示方式，不需要知道内部表名。对外仍然叫求索录，保留一点记录探索过程的味道。内部可以继续沿用 question、answer、content 这些命名，因为它们服务的是数据建模，不是读者看到的公开叙事。",
              },
            ],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "真正需要统一的是发布后的语言：导航、列表、详情页、空状态都应该使用求索录。这样不会把内部的问题管理感暴露出去，也能让页面读起来像一组持续整理的探索记录。",
              },
            ],
          },
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "答案的排版也应该服从这个定位。它不是评论流，也不是工单记录，而是一个题目下的几段完整笔记。因此调试样例必须使用接近真实卡片长度的答案，否则很容易误判布局，把页面设计成只适合短句的时间线。",
              },
            ],
          },
        ],
        source: {
          type: "project-item",
          id: 7,
          contentId: 9103,
          title: "发布模块设计记录",
          published: false,
        },
      },
    ],
    createTime: Date.now() - 86400000 * 7,
    updateTime: Date.now() - 86400000,
    resolvedTime: Date.now() - 86400000,
  },
};

export const mockDocPageSidebarDemoData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map(n => ({
    ...n,
    active: n.href === "/docs",
  })),
  contentLinkTargets: mockContentLinkTargets,
  sidebar: buildDocSidebarValidationDemo(),
  docCollections: mockDocCollections.map(collection => ({
    ...collection,
    items: collection.items.map(item => ({
      ...item,
      active: item.id === 101,
    })),
  })),
  content: {
    id: 404,
    title: "更新日志 / 0.4 / 0.4.4",
    content: buildDocOutlineValidationContent(),
    breadcrumb: [
      { label: "软件使用文档", href: "/docs" },
      { label: "更新日志", href: "/docs/changelog" },
      { label: "0.4", href: "/docs/changelog/0.4.html" },
      { label: "0.4.4", href: "/docs/changelog/0.4.4.html" },
    ],
    prevPage: { title: "0.4.3", href: "/docs/changelog/0.4.3.html" },
    nextPage: { title: "0.4.5", href: "/docs/changelog/0.4.5.html" },
    createTime: Date.now() - 86400000 * 40,
    updateTime: Date.now() - 86400000,
    currentPath: "/docs/changelog/0.4.4.html",
  },
  meta: {
    type: "doc",
    publishTime: Date.now(),
  },
};

// 首页 Mock 数据
export const mockHomePageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map(n => ({
    ...n,
    active: n.href === "/",
  })),
  docCollections: mockDocCollections,
  content: {
    hero: {
      title: "我的知识库",
      description: "记录学习、思考与成长的地方。这里有我的技术笔记、读书心得和生活感悟。",
    },
    docStats: {
      projects: 2,
    },
    timeline: [
      {
        type: "card",
        id: 104,
        title: undefined,
        summary: "React Hooks 使用心得 - 分享在实际项目中使用 Hooks 的经验和最佳实践...",
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
        summary: "《代码整洁之道》读书笔记 - 整洁的代码是一种艺术，需要不断练习...",
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
  navigation: baseNavigation.map(n => ({
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
        summary: "React Hooks 使用心得 - 分享在实际项目中使用 Hooks 的经验和最佳实践",
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
  navigation: baseNavigation.map(n => ({
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
        summary: "从卡片、文章到项目文档，如何建立一套可持续演进的个人知识管理系统。",
        href: "/articles/3",
        tags: ["知识管理", "工作流"],
        createTime: Date.now() - 86400000 * 7,
      },
      {
        id: 4,
        title: "从零开始学 TypeScript",
        summary: "从基础类型系统到工程实践，梳理 TypeScript 入门到进阶的核心学习路径。",
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
  navigation: baseNavigation.map(n => ({
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

export const mockQuestListPageData: InitData = {
  site: baseSiteConfig,
  navigation: baseNavigation.map(n => ({
    ...n,
    active: n.href === "/quests",
  })),
  docCollections: mockDocCollections,
  content: {
    title: "求索录",
    type: "quest",
    items: [
      {
        id: 1,
        title: "React 列表重渲染时，为什么输入框会失焦？",
        summary: "排查 key、受控输入和父组件重建之间的关系，最后确认是列表项 key 不稳定。",
        href: "/quests/1.html",
        tags: ["前端现场"],
        groupId: 1,
        groupTitle: "前端现场",
        status: "resolved",
        answerCount: 1,
        createTime: Date.now() - 86400000 * 3,
        updateTime: Date.now() - 86400000,
      },
      {
        id: 2,
        title: "发布页怎样避免重复打包同一份答案内容？",
        summary:
          "同一份 content 可以在卡片、文章和求索录之间复用，发布时按页面需求决定链接或内嵌。",
        href: "/quests/2.html",
        tags: ["发布"],
        groupId: 2,
        groupTitle: "发布",
        status: "in_progress",
        answerCount: 2,
        createTime: Date.now() - 86400000 * 5,
        updateTime: Date.now() - 86400000 * 2,
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

export const mockSearchInitDataList: InitData[] = [
  mockCardPageData,
  mockArticlePageData,
  mockDocPageData,
  mockDocPageSidebarDemoData,
  mockQuestPageData,
  mockCardListPageData,
  mockArticleListPageData,
  mockDocListPageData,
  mockQuestListPageData,
];

if (typeof window !== "undefined") {
  (window as typeof window & { __BLOG_DEV_MOCK_DATA__?: InitData[] }).__BLOG_DEV_MOCK_DATA__ =
    mockSearchInitDataList;
}

export function getMockListPageData(type: "card" | "article" | "doc" | "quest" = "card"): InitData {
  switch (type) {
    case "article":
      return mockArticleListPageData;
    case "doc":
      return mockDocListPageData;
    case "quest":
      return mockQuestListPageData;
    case "card":
    default:
      return mockCardListPageData;
  }
}

export function getMockDocPageData(demo?: string | null): InitData {
  switch (demo) {
    case "sidebar":
    case "nav":
      return mockDocPageSidebarDemoData;
    default:
      return mockDocPageData;
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
