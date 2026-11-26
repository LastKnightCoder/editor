查询数据库把已有内容组织成一张自动更新的表，例如带「读书」标签的卡片、本月日记、各项目的文档数量。可以用查询语言 DSL 编写，也可以用 JavaScript 组合多个来源的数据。

在电脑的「数据库」里点「新建数据库」，选择「实时查询」；在正文里输入 `/`，选择「查询数据库」。两处使用相同的查询语言、脚本约定和结果格式。

结果只读，修改原内容请回到对应页面，或点击结果中的「来源」。筛选、排序、分组、汇总、列宽和视图设置仍然可用。

## 从读书卡片开始

点「查询」展开查询，语言选「查询语言」，输入：

```sql
TABLE title AS "内容", tags AS "标签", updatedAt AS "更新时间", source AS "来源"
FROM cards
WHERE hasTag("读书")
SORT updatedAt DESC
LIMIT 100
```

`TABLE` 决定显示哪些列，`FROM` 选择来源，`WHERE` 筛选记录，`SORT` 排序，`LIMIT` 限制返回的行数。`hasTag("读书")` 同时匹配「读书/编程」等子标签。

新建一张符合条件的卡片后，它会进入结果；移除标签后，它会移出结果。修改查询代码或参数会重新运行，已创建的数据库会自动保存查询定义。

## DSL 语法

子句顺序固定，方括号表示可省略的部分：

```text
TABLE 表达式 [AS 名称] [TYPE 类型], ...
FROM 来源
[WHERE 条件]
[GROUP BY 表达式]
[SORT 表达式 [ASC|DESC], ...]
[LIMIT 非负整数]
```

关键字和函数名不区分大小写；来源名、字段名和类型按文档中的拼写填写。文字用单引号或双引号括起来，可写数字、`true`、`false` 和 `null`。`//` 后面到行末是注释。

一条 DSL 查询读取一个来源。组合项目、文档等多个来源时，使用 [JavaScript](#javascript-脚本)。

### 列名与类型

直接选择字段时，`AS` 修改显示标题，字段 key 保持原名。例如 `updatedAt AS "更新时间"` 排序时仍写 `SORT updatedAt DESC`。

计算列必须写 `AS`，这个名称同时作为列的 key 和显示标题。计算列可以用自己的名称排序：

```sql
TABLE title AS "文章", wordCount / 500 AS "阅读分钟" TYPE number
FROM articles
WHERE wordCount > 0
SORT 阅读分钟 DESC
```

字段和表达式会自动确定类型，空结果也保留列定义。`TYPE` 明确声明并校验类型；需要转换值时使用 `toNumber`、`toText`、`toDate`。

同一条查询中的列 key 必须唯一。直接字段即使取了不同的显示标题，也不能重复选择。

### 条件与运算

| 想表达的条件 | 写法                                                   |
| ------------ | ------------------------------------------------------ |
| 等于、不等于 | `pinned = true`、`title != ""`；等于也可以写 `==`      |
| 大小比较     | `wordCount > 500`、`updatedAt >= toDate("2026-11-01")` |
| 同时满足     | `hasTag("读书") AND wordCount > 0`，也可以用 `&&`      |
| 满足其一     | `hasTag("读书") OR hasTag("写作")`，也可以用 `\|\|`    |
| 排除         | `NOT pinned`，也可以用 `!pinned`                       |
| 在数组中     | `title IN params.titles`，把 `titles` 数组填进参数     |
| 算术         | `+`、`-`、`*`、`/`、`%`，例如 `round(wordCount / 500)` |

用括号明确条件的组合，例如 `(hasTag("读书") OR hasTag("写作")) AND wordCount > 0`。比较空值使用 `= null` 或 `!= null`。除数为零时，除法和余数返回 `null`。

### 函数

| 函数                           | 用法                                                    |
| ------------------------------ | ------------------------------------------------------- |
| `hasTag("读书")`               | 当前记录带有这个标签或它的子标签                        |
| `contains(title, "笔记")`      | 文字包含子串；传入数组时检查是否包含某个值              |
| `lower(title)`、`upper(title)` | 转成小写、大写                                          |
| `length(tags)`                 | 数组元素数量；传入文字时返回长度                        |
| `round(wordCount / 500)`       | 四舍五入到整数                                          |
| `toNumber(value)`              | 转成有限数字；空值或空字符串返回 `null`，无法转换时报错 |
| `toText(value)`                | 转成文字；空值变成空字符串                              |
| `toDate(value)`                | 将日期文字或时间戳转成毫秒时间戳；空值返回 `null`       |
| `today()`、`now()`             | 今天的日期文字、当前毫秒时间戳                          |
| `year(date)`、`month(date)`    | 日期所在的年、月；月份为 1–12，带时间的值按当前时区取值 |
| `coalesce(a, b, ...)`          | 取第一个非 null 值，空字符串、0 和 false 会保留         |
| `field("字段ID")`              | 读取普通数据库中以字段 ID 命名的列                      |

本月日记可以这样写，跨月后条件会跟着日期变化：

```sql
TABLE date AS "日期", weather AS "天气", mood AS "心情", wordCount AS "字数", source AS "来源"
FROM diary
WHERE year(date) = year(today()) AND month(date) = month(today())
SORT date DESC
```

### 分组与汇总

`count()` 统计行数；`count(表达式)` 统计非空值。`sum`、`avg`、`min`、`max` 计算数值，忽略空值和非数字；没有可计算的数值时返回 `null`。

例如，把读书卡片按是否置顶分组，统计数量和总字数：

```sql
TABLE pinned AS "置顶", count() AS "数量", sum(wordCount) AS "总字数"
FROM cards
WHERE hasTag("读书")
GROUP BY pinned
SORT 总字数 DESC
```

`GROUP BY` 接受一个表达式。分组查询中，普通列需要与分组表达式一致，其余列使用汇总函数。省略 `GROUP BY` 时可以对整个来源汇总，例如 `TABLE count() AS 数量 FROM cards`。

## 数据来源与字段

`id` 是记录的字符串身份，直接保留即可。`createdAt`、`updatedAt` 是创建与更新时间，`wordCount` 是字数，`pinned` 表示置顶，`archived` 表示归档。

| 内容         | 来源名        | 可查询字段                                                                                                                     |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 卡片         | `cards`       | `id`, `title`, `createdAt`, `updatedAt`, `tags`, `wordCount`, `pinned`, `source`, `contentRef`                                 |
| 文章         | `articles`    | `id`, `title`, `createdAt`, `updatedAt`, `tags`, `wordCount`, `pinned`, `source`, `contentRef`, `author`                       |
| 项目文档     | `documents`   | `id`, `title`, `createdAt`, `updatedAt`, `tags`, `wordCount`, `pinned`, `source`, `contentRef`, `parent`, `projectIds`, `kind` |
| 项目         | `projects`    | `id`, `title`, `createdAt`, `updatedAt`, `archived`, `pinned`, `documentCount`, `source`                                       |
| 待办         | `todos`       | `id`, `title`, `completed`, `archived`, `dueAt`, `listId`, `source`, `recurrence`                                              |
| 日程         | `calendar`    | `id`, `title`, `start`, `end`, `allDay`, `calendarId`, `kind`, `source`                                                        |
| 日记         | `diary`       | `id`, `date`, `title`, `weather`, `mood`, `tags`, `wordCount`, `source`                                                        |
| 普通数据库行 | `tables`      | `id`，以及目标表的字段 ID                                                                                                      |
| 正文         | `contents`    | `id`, `markdown`, `nodes`, `wordCount`                                                                                         |
| 白板         | `whiteboards` | `id`, `title`, `createdAt`, `updatedAt`, `tags`, `description`, `pageCount`, `source`                                          |
| Notebook     | `notebooks`   | `id`, `title`, `createdAt`, `updatedAt`, `archived`, `pinned`, `resourceCount`                                                 |
| 材料         | `materials`   | `id`, `title`, `createdAt`, `updatedAt`, `kind`, `quote`, `note`, `url`                                                        |
| 对话信息     | `chats`       | `id`, `title`, `createdAt`, `updatedAt`, `scene`, `messageCount`, `archived`                                                   |

`tags` 是标签文字数组。`source` 是可打开的来源引用，部分记录可能没有可打开的来源。`contentRef` 是读取正文需要的句柄，包含 `contentId` 和 `createdAt`。

项目的 `documentCount` 统计根目录条目数。项目文档的 `projectIds` 是项目编号数组；`parent` 是上级标题，指定项目范围时按该目录位置取值。需要只查看文档时，可以加 `WHERE kind = "document"`。

待办的 `recurrence` 是重复规则，`dueAt` 是截止时间；日程的 `kind` 区分事件 `event`、待办安排 `todo-schedule` 和虚拟日程 `virtual`。对话信息包含标题和数量等信息，不包含聊天消息正文。

## 读取参数与查询参数

查询里写到的 `params.名称` 会以参数的形式出现在查询顶部一行，点值就能改，按回车生效。日程范围、指定数据库这类查询里没写到的参数，点这一行右侧的「⋯」，选「添加参数」。值可以是文本、数字、`true` / `false`，也可以是 JSON 数组或对象。DSL 会把参数用于读取来源，并可通过 `params.名称` 在表达式中使用。

例如，填写这两个参数：

```json
{ "tag": "读书", "minWords": 500 }
```

然后按标签和字数筛选：

```sql
TABLE title AS "内容", wordCount AS "字数", source AS "来源"
FROM cards
WHERE hasTag(params.tag) AND wordCount >= params.minWords
```

### 各来源的读取参数

| 来源                           | 参数                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 卡片、文章、项目文档、白板     | `tag`：一个标签，包含子标签；`createdAfter`、`updatedAfter`：毫秒时间戳下界                                                           |
| 项目、Notebook、材料、对话信息 | `createdAfter`、`updatedAfter`：毫秒时间戳下界；Notebook、材料、对话信息不能按 `tag` 查询                                             |
| 项目文档                       | `projectId`：项目编号；`deep`：是否包含子条目，默认 `true`，设为 `false` 只读根目录                                                   |
| 待办                           | `source`：`all`、`todo` 或 `document`；`completed`、`archived`、`keyword`；`groupId` 或 `listId`；`contentId`；`view`、`start`、`end` |
| 日程                           | `view`：`display` 或 `stored`；`start`、`end`；`calendarIds`：数字形式的日历编号数组                                                  |
| 普通数据库行                   | 必填 `tableId`：普通数据库编号；查询数据库不能作为 `tables` 的来源                                                                    |
| 正文                           | 必填 `contentId`、`createdAt`；`format` 为 `markdown` 或 `nodes`，默认 `markdown`                                                     |

待办默认读取独立待办和正文待办，默认排除已归档内容。`source: "todo"` 只查独立待办，`source: "document"` 只查正文待办；`listId` 会限定为独立待办。默认的 `view: "tasks"` 返回任务与重复系列，重复系列行的 `completed` 为 `false`；查询某天是否完成时，使用 `view: "occurrences"` 并同时提供 `start`、`end`。时间窗口最长 366 天。

日程默认按展示方式读取，需要同时提供 `start`、`end`，结果可包含重复与虚拟日程，时间窗口最长 366 天。`view: "stored"` 读取真实保存的日程记录，可以不填时间范围。

例如，查看一个时间范围内的日程，先填写：

```json
{ "start": "2026-11-01", "end": "2026-12-01" }
```

```sql
TABLE title AS "日程", start AS "开始", end AS "结束", source AS "来源"
FROM calendar
SORT start ASC
```

编号需要使用资料库中的实际值。普通数据库的列按字段 ID 读取；假设「评分」列的 ID 为 `score`，参数中已填写目标 `tableId`：

```sql
TABLE id, field("score") AS "评分" TYPE number
FROM tables
SORT 评分 DESC
```

`field()` 读取的是字段 ID，而不是显示标题。包含连字符的字段 ID 也放在引号中。

## JavaScript 脚本

在查询里把语言切换为「JavaScript」，直接编写支持 `await` 和 `return` 的脚本正文。脚本通过 `data` 读取数据，通过 `ctx` 读取参数和日期，最后返回 `{ columns, rows }`。

```js
const cards = await data.cards.collect({ tag: "读书" });

return {
  columns: [
    { key: "title", title: "内容", type: "text" },
    { key: "words", title: "字数", type: "number" },
    { key: "source", title: "来源", type: "entity" },
  ],
  rows: cards.map(card => ({
    id: card.id,
    values: { title: card.title, words: card.wordCount, source: card.source },
  })),
};
```

### 读取约定

`await data.来源.collect(参数)` 返回记录对象数组，字段直接用 `card.title`、`card.tags` 访问。它会读完来源的所有分页，超出读取限制时失败。来源名和参数与前面的表格一致。

JavaScript 中，读取参数由 `collect()` 的实参决定。参数放在 `ctx.params` 中，需要显式传入读取方法：

```js
const cards = await data.cards.collect({ tag: ctx.params.tag ?? "读书" });

return {
  columns: [{ key: "title", title: "内容", type: "text" }],
  rows: cards.map(card => ({ id: card.id, values: { title: card.title } })),
};
```

也可以用 `data.cards.collect(ctx.params)` 传入整个参数对象。脚本中的 `filter`、`map`、排序和属性修改只影响这次返回的结果，源内容保持不变。

| 上下文         | 值                                     |
| -------------- | -------------------------------------- |
| `ctx.params`   | 查询参数组成的对象                     |
| `ctx.today`    | 今天的 `YYYY-MM-DD` 日期文字           |
| `ctx.now`      | 当前毫秒时间戳                         |
| `ctx.timeZone` | 日期上下文的时区，例如 `Asia/Shanghai` |

每次运行会取得新的日期上下文。读取 `ctx.today`、`ctx.now`，或在 DSL 中使用 `today()`、`now()` 时，查询会随时间重新计算。项目和正文范围需要通过读取参数指定。

脚本可以使用 JavaScript 的数组、字符串、`Math`、`Date` 等内置能力。DSL 的函数用于 DSL 表达式；JavaScript 中使用相应的原生方法。脚本不能写入资料库、访问页面 DOM、Node.js 或本机文件，也不能联网或导入 npm 包。

### 返回格式

| 部分          | 约定                                                               |
| ------------- | ------------------------------------------------------------------ |
| `columns`     | 至少一列。每列有 `key`、`title`、`type`；`key` 在列之间唯一        |
| `rows`        | 行数组；没有结果时返回 `[]`，仍需提供列定义                        |
| 行的 `id`     | 唯一、稳定的非空字符串。来自一个来源的结果可直接用原记录的 `id`    |
| 行的 `values` | 以列 `key` 为属性名的对象；例如 `values.words` 对应 `key: "words"` |

保持相同实体的 `id` 稳定，不用数组下标或随机值生成它。计算分组行时，可以用分组值生成 ID。组合不同来源时，需要确保组合后的行 ID 仍然唯一。

列的 `key` 用于筛选、排序等视图设置；`title` 用于显示。调整显示文字时保留 key，能继续沿用对应的视图设置。未提供的单元格值会按空值处理，多余的 values 属性不会成为列。

### 列类型与值

DSL 的 `TYPE` 和 JavaScript 的 `columns[].type` 使用同一组类型：

| 类型          | 单元格的值                                                                               |
| ------------- | ---------------------------------------------------------------------------------------- |
| `text`        | 字符串，例如 `"读书笔记"`                                                                |
| `number`      | 有限数字，例如 `12.5`；不接受 `NaN`、`Infinity`                                          |
| `boolean`     | `true` 或 `false`                                                                        |
| `date`        | 毫秒时间戳，或 `"2026-11-26"`、`"2026-11-26T09:00:00+08:00"` 这样的日期字符串            |
| `select`      | 一个选项文字，例如 `"在读"`                                                              |
| `multiSelect` | 选项文字数组，例如 `["读书", "编程"]`                                                    |
| `entity`      | 来源引用，例如 `{ kind: "card", id: "1", title: "读书笔记" }`；通常直接用记录的 `source` |
| `json`        | 由文字、有限数字、布尔值、空值、数组和普通对象组成的结构数据                             |

所有类型都可以返回 `null`。日期对象先用 `date.getTime()` 或 `date.toISOString()` 转换；函数、`Map`、`Set`、循环引用等不能作为结果值。

单选和多选列可在列定义中填写 `options: ["想读", "在读", "读完"]`。实际返回的选项也会显示。需要看板时，返回一列 `select`，再在看板视图中选择该列分组：

```js
const cards = await data.cards.collect({ tag: "读书" });

return {
  columns: [
    { key: "title", title: "内容", type: "text" },
    { key: "status", title: "状态", type: "select", options: ["置顶", "普通"] },
    { key: "updatedAt", title: "更新时间", type: "date" },
  ],
  rows: cards.map(card => ({
    id: card.id,
    values: {
      title: card.title,
      status: card.pinned ? "置顶" : "普通",
      updatedAt: card.updatedAt,
    },
  })),
};
```

## 组合项目与文档

可以同时读取项目和文档，在脚本里关联并统计。项目的 `source.id` 是原始编号文字，文档的 `projectIds` 是数字数组，比较前用 `Number()` 转换：

```js
const [projects, documents] = await Promise.all([
  data.projects.collect(),
  data.documents.collect(),
]);

return {
  columns: [
    { key: "title", title: "项目", type: "text" },
    { key: "count", title: "文档数", type: "number" },
    { key: "source", title: "来源", type: "entity" },
  ],
  rows: projects.map(project => ({
    id: project.id,
    values: {
      title: project.title,
      count: documents.filter(
        document =>
          document.kind === "document" && document.projectIds.includes(Number(project.source.id))
      ).length,
      source: project.source,
    },
  })),
};
```

这个例子统计文档记录的项目归属。需要指定项目的目录范围时，改用 `data.documents.collect({ projectId: 实际编号, deep: true })`；`deep: false` 只读取根目录。

## 按需读取正文

卡片、文章、项目文档的 `contentRef` 包含正文句柄。取得句柄后，用 `data.contents.collect()` 读取正文。例如，读取一张读书卡片的 Markdown：

```js
const cards = await data.cards.collect({ tag: "读书" });
const card = cards.find(item => item.contentRef);
const bodies = card ? await data.contents.collect({ ...card.contentRef, format: "markdown" }) : [];

return {
  columns: [
    { key: "title", title: "卡片", type: "text" },
    { key: "markdown", title: "正文", type: "text" },
  ],
  rows: card
    ? [
        {
          id: card.id,
          values: { title: card.title, markdown: bodies[0]?.markdown ?? "" },
        },
      ]
    : [],
};
```

`format: "nodes"` 返回正文节点，展示时使用 `json` 类型。正文体积可能较大，先筛选需要的内容，再按需读取；读取多篇时可以逐条 `await`，避免同时发起过多请求。

普通数据库行也可以用 `json` 查看原始字段和值，帮助确认字段 ID。先在参数里填目标 `tableId`：

```js
const rows = await data.tables.collect({ tableId: ctx.params.tableId });

return {
  columns: [{ key: "record", title: "原始字段", type: "json" }],
  rows: rows.map(row => ({ id: row.id, values: { record: row } })),
};
```

## 刷新、错误与限制

相关源内容变化后会重新读取并完整计算，重算期间旧结果保持可看。点状态（独立数据库在标题右侧，正文查询块在选中后出现）可以手动重算，不用展开查询。语法错误会标出所在行并写明原因；运行失败时提供「重试查询」。有上次成功结果时会保留并变淡，状态写明「查询出错」，成功重试后恢复。

独立数据库保存查询定义失败时，状态显示「查询未保存」，使用「重试保存」。点击「读取已保存的版本」会换成已保存的查询，你的本地改动另存为草稿，可以「恢复本地改动」。代码、参数或值类型有误时，先修改再重试；读取失败应显示错误，不用空数组掩盖读取失败。

| 限制       | 范围                                                      |
| ---------- | --------------------------------------------------------- |
| 读取记录   | 每次查询累计最多 50,000 行，多个来源和重复读取都计入      |
| 返回结果   | 最多 20,000 行、1–100 列                                  |
| 数据体积   | 读取数据和返回结果各受 16,000,000 字节限制，按 UTF-8 计算 |
| 等待与执行 | 共用 15 秒；同时运行多个查询时会排队                      |

`LIMIT` 和 JavaScript 的 `slice()` 限制输出行数，不能替代读取范围。优先用标签、项目或日期参数缩小读取范围。超过限制会明确报错，结果不会被悄悄截断。

查询保证源内容变化后重新收敛；组合多个来源时，各次读取可能发生在不同时间，不保证得到跨来源的同一瞬间快照。

## 在正文和 Markdown 中使用

正文输入 `/`，选择「查询数据库」，即可编写 DSL 或 JavaScript，参数和视图设置随正文保存，结果根据源数据重新计算。

导入 Markdown 时，`tau-query` 代码围栏会成为 DSL 查询块：

```tau-query
TABLE title AS "内容", source AS "来源"
FROM cards
WHERE hasTag("读书")
```

`tau-queryjs` 围栏用于 JavaScript，返回格式与前面的脚本一致。普通 `javascript` 围栏仍然显示为代码。

## 让 AI 编写和修改

如果希望用自然语言生成或修改查询，先为[对话功能](/docs/ai/)配置模型，再在查询最下面一行描述需求，按回车提交；展开查询后按 ⌘J 可以直接聚焦到这里。查询出错时，这一行会出现「让 AI 修复」。表格、看板和日历的视图操作见[数据库](/docs/database/#视图)。

AI 写完直接替换当前查询，点「撤销」可以回到原来的版本。生成期间你改过查询时，AI 的版本不会覆盖你的改动，可以选「用 AI 的版本」或「丢弃」。

AI 会收到查询语法、脚本返回约定、字段目录、当前语言、代码、参数、需求和最近一次运行错误，不额外附上查询结果行或源正文。

在主对话中请 Agent 编辑正文查询时，可使用内置的「查询数据库」Skill。它会帮助 AI 识别查询围栏、保留参数与视图配置，并按正文编辑工具的定位和审阅流程提交修改。独立数据库若没有可写查询定义的工具，Agent 会提供代码供你在面板使用。Skill 的自动和手动调用方式见 [Skill 与 MCP](/docs/skills-mcp/)。

查询的运行、失败、结果数量和更新时间提示会跟随界面语言。切换语言不会重新执行查询或重置更新时间；刷新与重试仍由原操作触发。

查询数据库的参数、配置、保存与 AI 辅助提示会跟随界面语言。切换语言会保留参数和输入草稿，不会重新执行查询或保存；SQL、列名、查询结果与已有名称保持原样。
