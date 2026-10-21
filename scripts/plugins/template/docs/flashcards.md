# 闪卡

插件可以帮用户创建闪卡。有三种方式，从轻到重：

| 方式                            | 适合                                      | 需要的权限                                              |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| [打开制卡窗口](#打开制卡窗口)   | 让用户在 Tau 的制卡界面里确认、编辑后保存 | 不需要（AI 模式需要 `ai:flashcardGeneration`）          |
| [直接创建](#直接创建卡组与闪卡) | 插件已经整理好了题目，直接写入            | `flashcards:read`、`flashcards:write`                   |
| [AI 生成](#ai-生成)             | 从一段资料生成草稿，或生成后直接保存      | `ai:flashcardGeneration`，保存还需要 `flashcards:write` |

在 manifest 中声明用到的权限：

```json
{ "permissions": ["flashcards:read", "flashcards:write", "ai:flashcardGeneration"] }
```

AI 制卡沿用用户在 Tau 中为「闪卡制作」分配的模型，不需要插件另外配置。用量、额度与授权方式和 [AI](ai.md#使用-tau-已有的模型分配) 中的 `requestCapability` 相同，用户撤销授权会取消进行中的生成。

## 打开制卡窗口

```ts
const result = await context.flashcards.openCreate({
  mode: "ai", // 默认 "manual"：手动制卡
  content: "牛顿第二定律：F = ma。",
  title: "力学笔记",
});

// result.status：completed 或 cancelled
// result.cards：用户在窗口中已经保存的闪卡
```

| 参数         | 说明                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| `mode`       | `manual`（默认）预填题干和参考资料；`ai` 打开后自动开始生成，用户挑选、编辑后保存 |
| `content`    | 资料内容，Markdown 字符串或编辑器节点                                             |
| `title`      | 资料标题                                                                          |
| `deckId`     | 可选。目标卡组；省略时由用户选择，也可以现场新建                                  |
| `references` | 可选。闪卡的来源，见下文                                                          |

- 必须在用户操作（点击、按键）中调用。在定时器、后台任务里调用会被拒绝；也不要在 `activate` 中等待它。
- 返回的 Promise 在用户关闭窗口后才完成。用户取消时，`cards` 里仍包含取消前已经保存的闪卡，取消不会撤销它们。
- 同一个窗口同一时间只能打开一个制卡会话。
- 窗口里的保存由用户确认，所以不需要闪卡读写权限。

### 来源

不传 `references` 时，`content` 作为自定义参考资料随闪卡保存，`title` 是来源标题。传 `references: []` 表示不记录来源。

资料来自 Tau 中已有的正文时，传入正文引用，而不是把正文复制一份：

```ts
await context.flashcards.openCreate({
  mode: "ai",
  content: snapshot.markdown,
  references: [{ refType: "content", contentRef: card.contentRef, title: card.title }],
});
```

`contentRef` 来自 [`context.data`](user-data.md) 或 [`context.entities`](user-data.md#插件内容)。引用其他内容的正文时需要对应的读取权限，插件自己的内容不需要。引用已失效或没有权限时，保存会被拒绝。

## 直接创建卡组与闪卡

```ts
const decks = await context.flashcards.listDecks();
const deck = await context.flashcards.createDeck({ name: "力学", description: "基础概念" });

const card = await context.flashcards.createCard({
  deckId: deck.id,
  type: "qa",
  prompt: [
    { type: "paragraph", children: [{ type: "formatted", text: "牛顿第二定律的表达式是什么？" }] },
  ],
  data: { answer: "F = ma" },
  tags: ["力学"],
  difficulty: "foundation",
});
```

| 闪卡字段     | 说明                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `deckId`     | 所属卡组                                                                                                   |
| `type`       | 题型：`qa`（问答）、`boolean`（判断）、`cloze`（填空）、`single-choice`（单选）、`multiple-choice`（多选） |
| `prompt`     | 题干，编辑器节点                                                                                           |
| `detail`     | 可选。补充说明，编辑器节点                                                                                 |
| `data`       | 答案，结构随题型不同，见下表                                                                               |
| `tags`       | 可选。标签                                                                                                 |
| `difficulty` | 可选。`foundation`、`standard`、`advanced`                                                                 |
| `references` | 可选。来源，同上文                                                                                         |

| 题型                               | `data` 中的答案                                                |
| ---------------------------------- | -------------------------------------------------------------- |
| `qa`                               | `answer`                                                       |
| `boolean`                          | `booleanAnswer`                                                |
| `cloze`                            | `blanks`：`[{ id, placeholder, answer, alternativeAnswers? }]` |
| `single-choice`、`multiple-choice` | `options`：`[{ id, label, isCorrect, explanation? }]`          |

所有题型都可以附带 `explanation`（解析）、`hint`（提示）和 `referenceNotes`（参考笔记）。

- 这些方法直接写入用户的数据，调用前确认这是用户想要的。
- 闪卡属于用户，卸载插件不会删除。接口不提供修改和删除已有闪卡的能力。
- 创建后，打开中的卡组、闪卡列表和计数会自动刷新。

## AI 生成

```ts
// 只生成草稿，插件可以先筛选，再逐张 createCard
const drafts = await context.flashcards.generate({ content: "需要学习的内容", title: "资料" });

// 生成后直接保存，跳过用户预览
const result = await context.flashcards.generateAndSave({
  content: "需要学习的内容",
  title: "资料",
  deckId: deck.id,
});
// result.cards：保存成功的闪卡
// result.failed：保存失败的项，{ index, message }
```

- `generate` 返回的草稿和 `createCard` 的参数结构相同，可以直接传给 `createCard`。
- `generateAndSave` 会绕过用户预览直接写入，只在用户明确要求时使用。
- `generateAndSave` 逐张保存，不是一个整体事务：部分成功、部分失败都有可能。**不要对整个调用重试**，否则已成功的闪卡会重复创建。需要精确重试时，用 `generate` 拿到草稿，再逐张 `createCard`。
- 取消或切换工作区会阻止后续写入，但已经写入的闪卡不会回滚。
- 用户没有为「闪卡制作」分配模型、未授权、额度不足或内容为空时，调用会明确失败。

## 适用范围

闪卡接口只在插件运行时中可用，编辑器块的渲染组件、博客中都不能使用。
