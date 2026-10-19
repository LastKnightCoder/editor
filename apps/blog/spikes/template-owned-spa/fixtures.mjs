const text = value => ({ type: "paragraph", children: [{ type: "formatted", text: value }] });
const counter = initial => ({
  type: "example.portable-counter",
  initial,
  children: [{ type: "formatted", text: "" }],
});
const reference = (contentType, refId, label) => ({
  type: "content-link",
  contentType,
  refId,
  children: [{ type: "formatted", text: label }],
});
const ref = (key, type, id) => ({ key, type, ...(id === undefined ? {} : { id }) });

export const contentCss = ".sample-html { font-weight: 600; }";

export function makeFixtures(articleTitle = "模板自己的文章页面") {
  const targets = {
    "project-item:34": ref("doc:project:12:34", "doc", 34),
    "card:7": ref("card:7", "card", 7),
    "article:2": ref("article:2", "article", 2),
  };
  const records = [
    {
      key: "article:1",
      type: "article",
      id: 1,
      stem: "articles/1",
      content: {
        title: articleTitle,
        content: [
          text("共享协议：数据、搜索和内容引用只通过 key 关联。"),
          counter(7),
          reference("project-item", 34, "项目说明"),
          reference("article", 2, "另一篇带插件的文章"),
          {
            type: "html-block",
            html: '<span class="sample-html">模板自行消费 CSS 资源</span>',
            children: [],
          },
        ],
      },
    },
    {
      key: "article:2",
      type: "article",
      id: 2,
      stem: "articles/2",
      content: {
        title: "独立预览的文章",
        content: [text("共享协议也可用于模板自己的预览。"), counter(19)],
      },
    },
    {
      key: "article:3",
      type: "article",
      id: 3,
      stem: "articles/3",
      content: {
        title: "用于取消测试的慢数据",
        content: [text("迟到数据不应该覆盖模板当前状态。")],
      },
    },
    {
      key: "card:7",
      type: "card",
      id: 7,
      stem: "cards/7",
      content: {
        title: "关联卡片",
        content: [text("共享协议中的卡片正文。"), reference("project-item", 34, "文档引用")],
      },
    },
    {
      key: "doc:project:12:34",
      type: "doc",
      id: 34,
      projectId: 12,
      stem: "projects/12/34",
      content: {
        title: "项目说明",
        projectId: 12,
        content: [text("共享协议中的项目文档。这个目标不需要对应的 HTML 文件。")],
        tree: [{ title: "项目说明", target: ref("doc:project:12:34", "doc", 34) }],
      },
    },
    {
      key: "quest:5",
      type: "quest",
      id: 5,
      stem: "quests/5",
      content: {
        title: "求索问题",
        description: [text("共享协议如何支持不同内容类型？")],
        answers: [
          { content: [text("模板自行选择展示和交互。"), reference("card", 7, "关联材料")] },
        ],
        materials: [ref("article:1", "article", 1)],
      },
    },
    {
      key: "home",
      type: "home",
      stem: "home",
      content: {
        title: "数据驱动模板实验",
        timeline: [ref("article:1", "article", 1), ref("doc:project:12:34", "doc", 34)],
      },
    },
    {
      key: "list:articles",
      type: "list",
      stem: "lists/articles",
      content: {
        title: "文章集合",
        items: [ref("article:1", "article", 1), ref("article:2", "article", 2)],
      },
    },
  ];
  return records.map(record => ({
    ...record,
    data: {
      version: 1,
      key: record.key,
      meta: { type: record.type, publishTime: 1 },
      content: record.content,
      contentLinkTargets: targets,
    },
  }));
}
