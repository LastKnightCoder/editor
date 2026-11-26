# 查询语言与脚本参考

查询代码读取当前资料库，返回列定义与行数据。结果只读，计算结果不持久化。不提供写入、网络、DOM、Node.js、文件系统或 npm 包导入能力。修改读到的数组和对象只影响这次结果。

真实的项目、表、正文编号与字段 ID 来自当前代码、参数、用户输入或实际工具读取，不从字段目录猜造编号。缺少目标范围信息时保留参数化，不把用户指定的范围扩大为全部。单次代码补全没有工具查询能力，也没有已执行结果可供核验。

## DSL

子句顺序固定：

```text
TABLE 表达式 [AS 名称] [TYPE 类型], ...
FROM 来源
[WHERE 条件]
[GROUP BY 表达式]
[SORT 表达式 [ASC|DESC], ...]
[LIMIT 非负整数]
```

- 每条 DSL 读取一个来源；跨来源关联使用 JavaScript。
- 关键字和函数名不区分大小写，来源名、字段名与类型区分大小写。
- 直接字段的 AS 只改标题，key 仍是字段名：`updatedAt AS "更新时间"` 排序用 `updatedAt`。
- 计算列必须有 AS，AS 同时决定 key 和标题：`wordCount / 500 AS 阅读分钟` 可用 `SORT 阅读分钟 DESC`。
- 列 key 不能重复。TYPE 只校验类型，不转换值；转换使用 toNumber/toText/toDate。空结果仍有列定义。
- 字面值支持数字、单/双引号文字、true/false/null，文字支持 JSON 转义。注释用 `//`。
- 运算：`+ - * / %`；比较 `= == != > >= < <=`；逻辑 `AND OR NOT && || !`；括号可组合条件。
- IN 右侧用数组字段或参数，例如 `title IN params.titles`；DSL 没有数组字面量语法。
- 参数表达式是 `params.键名`。查询参数对象同时作为该来源的读取参数。
- GROUP BY 接受一个表达式；普通选择列必须与分组表达式一致，其余列用聚合。
- SORT 默认升序，可写 ASC/DESC，多条用逗号分开；可引用计算列 key。
- LIMIT 仅限制结果数量，不能绕过读取预算。

| 函数                   | 语义                                            |
| ---------------------- | ----------------------------------------------- |
| hasTag(tag)            | 当前记录的 tags 匹配该标签或 `tag/子标签`       |
| contains(value, part)  | 文字包含子串，或数组包含一个值                  |
| lower/upper(value)     | 转小写/大写文字                                 |
| length(value)          | 数组元素数或 JavaScript 字符串长度              |
| round(value)           | 四舍五入为整数                                  |
| toNumber(value)        | 转有限数字；null/空字符串为 null，转换失败报错  |
| toText(value)          | 转文字，null 为空字符串                         |
| toDate(value)          | 将 ISO 日期文字或毫秒时间戳转成时间戳           |
| today()/now()          | 当前日期 YYYY-MM-DD / 当前毫秒时间戳            |
| year(date)/month(date) | 年/月，月为 1–12；带时间值按 ctx.timeZone 取值  |
| coalesce(a,b,...)      | 第一个非 null 值，保留空字符串、0、false        |
| count()/count(expr)    | 行数 / 非空值数量                               |
| sum/avg/min/max(expr)  | 数值汇总，忽略 null 和非数字；无可计算值为 null |
| field("字段ID")        | 按字段 ID 读取普通数据库字段，动态字段仍须有 AS |

```sql
TABLE title AS "内容", tags AS "标签", updatedAt AS "更新时间", source AS "来源"
FROM cards
WHERE hasTag("读书")
SORT updatedAt DESC
LIMIT 100
```

```sql
TABLE pinned, count() AS 数量, sum(wordCount) AS 总字数
FROM cards
GROUP BY pinned
SORT 总字数 DESC
```

```sql
TABLE date AS 日期, weather AS 天气, mood AS 心情, wordCount AS 字数
FROM diary
WHERE year(date) = year(today()) AND month(date) = month(today())
SORT date DESC
```

## JavaScript

代码是异步函数正文，直接 await/return，不要 export 或只定义一个未调用的函数。只有数据 API `data` 和上下文 `ctx` 需要由 Tau 提供。

`await data.来源.collect(options)` 自动读完分页，返回字段直接在记录上的对象数组，如 `card.title`。UI 查询参数位于 `ctx.params`，不会自动传给 collect；需要显式传入 `collect(ctx.params)` 或挑选需要的键。

ctx 只有应依赖的 `params`、`now`、`today`、`timeZone`；当前页面或正文不会自动成为查询范围。读取 now/today 会触发随时间重算。DSL 函数不作为 JavaScript 全局函数提供，使用 JavaScript 原生计算方法。

必须返回：

```js
const cards = await data.cards.collect({ tag: ctx.params.tag ?? "读书" });
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

- columns 至少一列，key 唯一、非空且稳定，title 为文字，type 必须有效；key 不使用 **proto**/prototype/constructor。
- rows[].id 是唯一、稳定的非空字符串。单来源沿用原记录 id；聚合行根据分组值生成，跨来源组合要避免 ID 冲突，不用数组下标或随机数。
- values 的键对应列 key；未给出的单元格转 null，多余属性不会成为列。空结果返回完整 columns 与 rows:[]。
- 只允许有限数字、文字、布尔值、null、数组与普通 JSON 对象；不用函数、Date 实例、Map、Set、循环引用或嵌套 undefined。
- 列 key 绑定视图设置，修改标题保留 key；没有用户要求时不重命名既有列 key。

## 类型和值

DSL 的 TYPE 和 JavaScript columns[].type 共用：

| 类型        | 值                                                                                |
| ----------- | --------------------------------------------------------------------------------- |
| text        | 字符串                                                                            |
| number      | 有限数字，拒绝 NaN/Infinity                                                       |
| boolean     | true/false                                                                        |
| date        | 毫秒时间戳或 YYYY-MM-DD / ISO 日期时间文字；Date 实例先转 getTime()/toISOString() |
| select      | 单个选项文字；列可带 options:文字数组                                             |
| multiSelect | 选项文字数组；列可带 options:文字数组                                             |
| entity      | 有 kind、id 和可选 title 的来源对象，优先沿用记录 source；无来源时用 null         |
| json        | 普通 JSON 结构数据                                                                |

所有列都允许 null。需要看板时生成 select 列，需要日历时生成 date 列。没有 image 等查询列类型。

## 读取参数与身份

- cards/articles/documents/whiteboards 支持 tag（包含子标签）、createdAfter/updatedAfter（毫秒下界）；projects 支持时间下界。notebooks/materials/chats 支持时间下界，拒绝 tag。
- documents 可用 projectId 与 deep 指定目录；deep 默认 true，false 只读根目录。仅文档用 `kind = "document"`。parent 是范围中的上级标题。
- cards/articles/projects/documents/whiteboards 的记录 id 带类型前缀，source.id 是原始编号文字。documents.projectIds 为数字数组，关联项目用 Number(project.source.id)，不要 Number(project.id)。projects.documentCount 是根目录条目数，不能当全项目文档总数。
- todos 支持 source:all/todo/document、completed、archived、keyword、groupId/listId、contentId、view、start/end。默认排除已归档；listId 强制独立待办。默认 view:tasks 返回任务或系列，系列 completed 为 false。看某日完成情况用 view:occurrences 并给 start/end。
- calendar 默认 view:display，必填 start/end；view:stored 可不填时间窗口，只读真实保存记录；calendarIds 为数字数组。待办/日程窗口不超过 366 天。虚拟日程 source 可为 null。
- diary 的日期是归属日，天气/心情为文字，tags 是片段标签并集。本月/今年用 year/month 与 today 表达。
- tables 必填 tableId，只读普通数据库。行属性为字段 ID，DSL 用 field("ID")。不要把显示列名当 ID，也不能将查询数据库当 tables 来源。
- contents 必填 contentId 和 createdAt，优先传入卡片等的 contentRef；format:markdown/nodes，默认 markdown。先筛选再按需逐条读取，避免过多并发。
- chats 只有对话信息，没有消息正文。不同来源的读取不构成同一事务快照。

错误应正常显示，不把读取失败伪装成空结果。缩小输入范围靠 tag、projectId 或时间参数；LIMIT/slice 只缩小输出。
