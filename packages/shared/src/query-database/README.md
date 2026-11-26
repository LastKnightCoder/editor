# 查询数据库核心

纯协议、字段目录、DSL 解析与计算从 `@tau/shared/query-database` 导入；浏览器执行器从 `@tau/shared/query-database/client` 导入。两者不加载 shared 根入口。Worker 由 Vite 打包，宿主提供只读分页读取函数。

面向使用者的完整语法、字段与脚本约定见[查询数据库使用参考](/apps/website/content/docs/query-database.md)。

## DSL

```text
TABLE title AS "内容", updatedAt AS "更新时间", wordCount / 500 AS "阅读分钟" TYPE number
FROM cards
WHERE hasTag("读书") AND wordCount > 0
SORT updatedAt DESC
LIMIT 100
```

来源与字段以 catalog.ts 为准。子句顺序固定；GROUP BY 位于 WHERE 与 SORT 之间。支持括号、算术、比较、AND / OR / NOT。计算列必须有 AS；直接字段的 key 保持字段名，AS 只改标题。TYPE 支持 text、number、boolean、date、select、multiSelect、entity、json，不做隐式类型转换。

函数：hasTag、contains、lower、upper、length、round、toNumber、toText、toDate、today、now、year、month、coalesce；聚合 count、sum、avg、min、max。分组查询的普通字段须与 GROUP BY 表达式一致。`field("字段key")` 用于 UUID 等不能写成标识符的字段，类型同样由目录推导。

## JavaScript

```js
const cards = await data.cards.collect({ tag: "读书" });
return {
  columns: [
    { key: "title", title: "内容", type: "text" },
    { key: "words", title: "字数", type: "number" },
  ],
  rows: cards.map(card => ({
    id: card.id,
    values: { title: card.title, words: card.wordCount },
  })),
};
```

collect 读取所有分页，超过预算或游标无法推进时失败。卡片、文章等支持 tag、createdAfter、updatedAfter；documents 另外支持 projectId 和 deep（默认包含子条目，false 只读根目录），parent 是该范围内的上级标题。todos 沿用任务查询的 source / view / completed / archived / start / end 等参数，默认包含正文待办；calendar 的 display 查询需要 start/end，stored 查询只读真实日程。tables 需要 tableId，contents 需要 contentId 与 createdAt（可直接传卡片等的 contentRef）。

cards / articles / projects / documents / whiteboards 的 id 带实体类型前缀，source.id 是原始编号字符串；documents.projectIds 是原始数字数组，可用 Number(project.source.id) 关联项目。

ctx 包含 params、now、today 和 timeZone。返回日期值使用时间戳或 ISO 日期，空值为 null；多选是文本数组；entity 是 `{kind,id,title?}`。ID 和 key 不能依赖当前数组下标，聚合行可按分组键生成稳定身份。

## 执行

`startQuery({definition,context,read,onDependency,onClock})` 返回 `{result,cancel}`。每次执行独占可中止的 Worker；DOM 客户端在隐藏、无同源权限的 iframe 中建立禁止网络的执行环境。宿主只处理白名单来源读取，不把任意命令通道传入 Worker。

Worker 必须是自包含的经典脚本。生产使用 Vite Worker 打包；仓库内的 Vite 开发宿主需注册 scripts/vite-query-database-worker.mjs 的 `queryDatabaseWorkerPlugin(build)`，不能直接把开发服务返回的 ESM 源码放入 Blob Worker。运行 `node apps/desktop/scripts/verify-query-database.mjs` 同时检查开发和生产路径。

每个渲染窗口同时运行最多 4 个查询，等待队列最多 64 个，等待与执行共用 15 秒期限。取消等待不启动 Worker；完成、失败和超时归还执行槽。读取与结果分别最多 50,000 行和 20,000 行，序列化数据按 UTF-8 字节计入 16 MB 预算。适配器返回非法分页或不可传递对象时明确失败。

窗口内复用一个隔离 iframe，各次执行的 Worker 与端口独立。面板挂载时调用 `retainQueryRuntime()`，卸载时调用返回的释放函数；无持有者且无执行时移除宿主。结束先确认 Worker 已终止，再归还宿主；无法确认或超时时退役该环境，受影响执行失败，后续执行重建，不复用查询结果或脚本全局。

`createQuerySession` 接受 run / publish / fail / loading 回调，合并失效通知，同一时刻最多一轮执行，隐藏时取消、恢复时重读。在途结果遇到更新后不发布，销毁后拒绝迟到结果。
