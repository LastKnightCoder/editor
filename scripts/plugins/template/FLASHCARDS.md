# 闪卡能力

需要 SDK 0.25.0 和支持闪卡接口的 Tau 0.59.0 客户端构建。能力通过激活时的 `context.flashcards` 使用，绑定本次激活的数据库；停用、切库后旧调用失效。旧客户端可用 `if (!context.flashcards)` 检查是否支持。

## 打开宿主制卡窗口

```ts
const result = await context.flashcards.openCreate({
  mode: "ai", // manual 为手动制卡，缺省为 manual
  content: "牛顿第二定律：F = ma。", // Markdown 或 Descendant[]
  title: "力学笔记",
  // deckId: 123, // 可选；省略时先选择卡组，也可以现场新建卡组
});

// result.status 为 completed 或 cancelled；cards 包含本次窗口已经保存的记录。
// 取消不会撤销「保存并新建」等已提交的记录。
console.log(
  result.status,
  result.cards.map(card => card.id)
);
```

AI 模式自动开始生成并展示预览，可选择、编辑后保存；手动模式预填题干和参考资料，支持连续创建。未指定 references 时，content 作为自定义参考资料保存，title 用于来源标题；指定 `references: []` 可省略来源。

引用 Tau 中已有正文时，显式传入来源，避免复制正文作为参考资料：

```ts
await context.flashcards.openCreate({
  mode: "ai",
  content: sourceContent,
  references: [{ refType: "content", contentId: sourceContentId, title: "原文" }],
});
```

窗口操作返回的 Promise 等待用户完成。请在命令、按钮或其他用户动作中调用；不要在 `activate()` 中等待用户操作，宿主激活有超时限制。同一窗口仅允许一个制卡会话，重复打开明确报错。

所有创建方式返回的卡片都沿用 `PluginFlashcardDraft` 的字段：自定义参考正文为 `references[].customContent`，已有正文引用为 `references[].contentId`。可以将返回卡片直接传给 `createCard` 创建副本；创建后来源窗口的卡组、闪卡和计数会自动刷新。

## 直接创建卡组与闪卡

```ts
const decks = await context.flashcards.listDecks();
const deck = await context.flashcards.createDeck({ name: "力学", description: "基础概念" });
const card = await context.flashcards.createCard({
  deckId: deck.id,
  type: "qa",
  prompt: [{ type: "paragraph", children: [{ text: "牛顿第二定律的表达式是什么？" }] }],
  data: { answer: "F = ma" },
  tags: ["力学"],
  difficulty: "foundation",
});
```

题型包括 `qa/boolean/cloze/single-choice/multiple-choice`，答案结构见 `PluginFlashcardData`。调用前必须确认用户意图；这些方法直接写入用户当前数据库，记录属于用户，不随插件卸载删除。API 不提供删除或修改已有闪卡的权限。

## 生成草稿与自动保存

```ts
// 只生成，插件可进一步筛选，再逐张 createCard。
const drafts = await context.flashcards.generate({ content: "需要学习的内容", title: "资料" });

// 只有明确调用此方法才绕过预览，直接保存。
const result = await context.flashcards.generateAndSave({
  content: "需要学习的内容",
  title: "资料",
  deckId: deck.id,
});
// result.cards：成功保存的记录；result.failed：失败项的零基下标和 message。
```

AI 使用应用「闪卡生成」模型，沿用用户的模型配置与用量记录，不读取或导出密钥，也不调用插件的独立 `context.ai` 功能。没有模型配置或内容为空时明确失败，不自动选择其他模型。

自动保存先校验全部草稿，再逐张写入；不承诺整批事务。不要对整个自动保存调用盲目重试，否则会重复创建成功项。需要精确重试时，使用 `generate` 保留草稿并逐张 `createCard`。取消与切库阻止后续写入，已发出的写入可能已在原库提交，不能将取消理解为事务回滚。

这些 API 面向已激活的桌面插件；静态内容组件、博客与移动端没有此宿主能力。
