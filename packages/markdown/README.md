# Markdown 无界面处理器

`createMarkdownProcessor({ codecs, textCodecs })` 创建显式组合的处理器。元素语法由 codec 提供；未知节点与未知文本字段走保真载体。默认 `getMarkdown()` 完整转换正文，`getMarkdownWithPositions()` 完整生成转换结果与位置映射，两者不使用跨次缓存。

## 只读正文的增量导出

`createIncrementalSerializer({ codecs, textCodecs })` 返回会话独有的序列化函数，接收只读正文数组。策略中的 codec 必须是创建处理器时传入的同一对象，且由调用方保证不依赖节点/父节点以外的可变业务状态；脚注状态由框架单独维护。

- 只缓存深冻结、全部转换器均被明确声明的顶层块。顶层数组可以重建、插入、删除或重排，分隔符与末尾换行每次重新组装。
- 未声明的插件、文本 codec 或可变属性使相应块回退为完整转换；转换前克隆整个块，保留块内父子关系和插件内部操作独立副本的能力，不把冻结节点交给这些插件写入。
- 包含脚注副作用的块不保存输出缓存；每次重新分配整篇脚注编号与定义，不缓存带旧编号的字符串。
- 缓存属于单个增量函数，不跨文档共享；不得通过修改节点或其子数组/属性原地更新正文，必须替换变化节点。
- `@tau/plugins/content` 的处理器包装会在插件快照换代时重建增量函数，使处理器与缓存一起失效。

Markdown 文件窗口以本地 Yjs 的独立只读快照调用该入口，只声明桌面自带的确定性 codec。其他消费者继续使用原有完整转换 API；新增缓存不改变导入、位置映射、保真语法或默认转换行为。

## Tau Markdown v1

Tau Markdown 是原生正文的可逆文本协议。`encodeTauMarkdown` / `decodeTauMarkdown` 负责全部持久化节点数据；既有 `getMarkdown()` 仍输出普通 Markdown，适合明确接受格式降级的对外导出。处理器的导入方法识别 Tau 文档和节点片段，不把损坏的原生数据降级为普通正文。

### 编码

- 文档头为 `<!-- tau-markdown:1 -->`。可选的 `tau-meta` JSON 围栏携带文档元信息，宿主使用其中的 `contracts` 保存契约字典。
- 元素以 `:::tau {JSON 属性}` 开始，独立的 `:::` 结束。属性头包含除 children 外的持久化属性；children 由嵌套节点和文本围栏表示。没有已知 codec 的元素也使用同一种表示。
- `tau-inline` 围栏承载行内 Markdown。只有实际编解码结果与原文本节点完全一致时才选择这种紧凑形式；不合并相邻同格式叶子，不丢弃显式 false、未知 marks 或零宽字符。
- 无语法的非空行内字面量子集直接还原为 formatted 文本；不含 ASCII 标点/控制字符、换行、首尾空白和零宽分隔符。此子集由协议规定，不接受插件重新解释；与普通 Markdown 处理器进行 parity 验证。
- `tau-text {JSON marks}` 围栏承载原始文本，正文不再解释 Markdown。长字符串或多行字符串属性放在 `tau-field {"key":"字段名"}` 围栏中，同一个字段只写一次。
- 字面量包含孤立代理字符时使用 `tau-text-json` / `tau-field-json`，载荷为 JSON 字符串。反引号围栏始终长于载荷中的反引号串，正文中的容器标记不参与解析。
- 属性键和文档元信息按有限、无循环 JSON 处理；拒绝重复 JSON 键和重复字符串字段，使用自有键赋值避免原型污染。对象中的 undefined 按 JSON 存储语义省略。

简化示例（实际文档还会携带宿主生成的契约和身份）：

````markdown
<!-- tau-markdown:1 -->

:::tau {"type":"table","collabId":"table-1"}
:::tau {"type":"table-row","collabId":"row-1","color":"blue"}
:::tau {"type":"table-cell","collabId":"cell-1"}
```tau-inline
**任务 A**
```
:::

:::
:::
````

### API 与边界

```ts
const options = { processor, metadata: { contracts } };
const source = encodeTauMarkdown(content, options);
const { content: restored, metadata } = decodeTauMarkdown(source, { processor });
const { markdown, positionMap, blockRanges } = getTauMarkdownWithPositions(content, options);
```

编码不修改输入。解码保留 type、collabId、tauContract、领域属性、未知节点/字段/marks 和文本边界；对象键顺序不属于语义。节点、字面量文本和字符串字段生成双向位置映射，顶层范围不含文档元信息及块间空行。

默认限制：32 Mi UTF-16 码元、150000 个节点、64 层节点、64 层属性 JSON。未知协议版本、无效结构、超限或未闭合围栏明确失败。`fragment: true` 允许解析读取工具返回的完整节点片段；普通全文必须有版本头。

契约恢复与写入权限不在纯编解码器里处理。`@tau/plugins/content` 的契约处理器验证文档字典及节点归属，已有版本不被当前 codec 重解释。已有正文回写仍走带修订/范围校验的宿主入口。

测试采用严格往返和修改局部性断言；真实资料库与压力命令见 [正文验证手册](/docs/guides/dev-content-verification.md#tau-markdown)。
