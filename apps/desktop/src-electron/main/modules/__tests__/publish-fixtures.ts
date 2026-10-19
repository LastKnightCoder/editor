import type { PublishDataSource, PublishSelectionInput } from "../publish-site-generator";
import type { IArticle } from "@/types/article";
import type { ICard } from "@/types/card";
import { EProjectItemType, type ProjectItem, type Project } from "@/types/project";
import type { IQuestion } from "@/types/question";
export const text = (value: string) => ({
  type: "paragraph",
  children: [{ type: "formatted", text: value }],
});
export function makePublishFixture(title = "第一篇文章") {
  const counter = (initial: number) => ({
    type: "example.portable-counter",
    metadata: { target: { key: "widget-local-key", type: "internal" } },
    initial,
    children: [{ type: "formatted", text: "" }],
  });
  const reference = (contentType: string, refId: number, label: string) => ({
    type: "paragraph",
    children: [
      { type: "formatted", text: "" },
      {
        type: "content-link",
        contentType,
        refId,
        contentTitle: label,
        children: [{ type: "formatted", text: label }],
      },
      { type: "formatted", text: "" },
    ],
  });
  const cards: ICard[] = [
    {
      id: 7,
      contentId: 107,
      content: [text("共享协议卡片")],
      tags: ["发布/协议"],
      create_time: 1,
      update_time: 2,
      count: 6,
      isTop: false,
      linkCount: 0,
    } as ICard,
  ];
  const articles: IArticle[] = [1, 2, 3].map(
    id =>
      ({
        id,
        contentId: 100 + id,
        title: id === 1 ? title : `共享协议文章 ${id}`,
        author: "作者",
        content: [
          text("共享协议：数据与模板分离"),
          counter(id === 1 ? 7 : 19),
          ...(id === 1
            ? [
                reference("article", 2, "预览第二篇"),
                reference("article", 1, "预览本篇"),
                reference("project-item", 34, "项目说明"),
                {
                  type: "html-block",
                  html: '<p class="text-red-500">动态 CSS 正文</p>',
                  children: [{ type: "formatted", text: "" }],
                },
                {
                  type: "html-block",
                  html: '<button id="html-fragment-button" class="text-red-500" onclick="this.textContent=String(Number(this.textContent)+1)">0</button>',
                  children: [{ type: "formatted", text: "" }],
                },
              ]
            : []),
        ],
        tags: ["发布"],
        create_time: 1,
        update_time: id,
      }) as IArticle
  );
  const project: Project = {
    id: 12,
    title: "项目说明",
    children: [33],
    desc: [],
    archived: false,
    pinned: false,
    createTime: 1,
    updateTime: 2,
  };
  const items: ProjectItem[] = [
    {
      id: 33,
      title: "目录",
      children: [34],
      content: [],
      projectItemType: EProjectItemType.Document,
    },
    {
      id: 34,
      title: "共享协议文档",
      children: [],
      content: [text("项目共享协议"), counter(31)],
      projectItemType: EProjectItemType.Document,
    },
  ].map(
    item =>
      ({
        ...item,
        parents: [],
        projects: [12],
        refType: "content",
        refId: 134,
        createTime: 1,
        updateTime: 2,
        count: 6,
        contentId: item.id === 34 ? 134 : 133,
        whiteBoardContentId: 0,
      }) as ProjectItem
  );
  const question: IQuestion = {
    id: 9,
    questionContent: "如何分离模板？",
    description: [text("共享协议问题")] as any,
    answers: [209],
    groupId: 5,
    sortIndex: 0,
    status: "in_progress",
    createTime: 1,
    updateTime: 2,
  };
  const data: PublishDataSource = {
    getCardByIds: ids => cards.filter(card => ids.includes(card.id)),
    getCardById: id => cards.find(card => card.id === id) ?? null,
    getCardByContentId: id => cards.find(card => card.contentId === id) ?? null,
    getContentLinkTargetContentIds: () => [],
    getArticleByIds: ids => articles.filter(article => ids.includes(article.id)),
    getArticleByContentId: id => articles.find(article => article.contentId === id) ?? null,
    getProject: () => project,
    getProjectItemsByIds: ids => items.filter(item => ids.includes(item.id)),
    getProjectItemsByContentId: id => items.filter(item => item.contentId === id),
    listQuestionGroups: () =>
      [
        { id: 5, title: "技术探究", color: "blue", createTime: 1, updateTime: 2, sortIndex: 0 },
      ] as any,
    listQuestionsByGroup: () => [question],
    getQuestionAnswerById: id => ({
      id,
      createTime: 1,
      updateTime: 2,
      content:
        id === 101
          ? articles[0].content
          : id === 134
            ? items[1].content
            : id === 107
              ? cards[0].content
              : ([text("独立答案"), counter(42)] as any),
    }),
    getQuestionDetail: () =>
      ({
        question,
        materials: [209, 101, 134, 107].map(id => ({
          targetType: "answer",
          targetId: id,
          contentId: id,
          missing: false,
        })),
        chats: [],
        events: [],
      }) as any,
  };
  const selections: PublishSelectionInput[] = [
    ...articles.map(article => ({
      contentType: "article" as const,
      contentId: article.id,
      parentPath: "",
    })),
    { contentType: "card", contentId: 7, parentPath: "" },
    { contentType: "project", contentId: 12, parentPath: "" },
    { contentType: "quest", contentId: 5, parentPath: "" },
  ];
  return { data, selections, cards, articles };
}
