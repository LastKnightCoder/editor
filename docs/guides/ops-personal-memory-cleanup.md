# 本地个人记忆一次性清理

## 准备

1. 使用项目支持的 Node.js，确认支持 `node:sqlite` 和 `backup`，并已安装工作区依赖。
2. 找到需要清理的资料库文件，默认位于用户目录的 `.editor/`。以下 `<资料库.db>` 替换为该文件的绝对路径。
3. 在仓库根目录运行命令。脚本只操作独立记忆库，资料库和原始卡片始终只读。

## 预览

```sh
node scripts/db/cleanup-personal-memory.mjs --library "<资料库.db>"
```

- `status=preview`：没有删除记忆内容。
- `selectedCount`：默认删除候选总数，输出最多展示前 20 项。
- `ambiguousCount`：同样只来自卡片、但属于个人表述或其他类别的条目，不自动删除。
- 默认候选为无手动更正、kind=fact、证据全部来自卡片正文、且没有明显个人表述的条目。含主对话、待办、日程、其他正文证据的条目保留。
- 自动按库身份定位记忆文件；若存在多个匹配文件，添加 `--memory "<记忆.sqlite>"` 明确选择。

## 执行

1. 完全退出 Tau，避免后台同时修改资料库或记忆库。
2. 执行默认候选清理：

```sh
node scripts/db/cleanup-personal-memory.mjs --library "<资料库.db>" --apply
```

3. 确认 `status=cleaned`，保存输出的 `backupPath`。备份位于记忆目录的 `backup/personal-memory-cleanup-*/`，包含删除前完整记忆库。
4. 确认原始卡片仍在。脚本同时清理被删除条目的证据、向量、全文索引、处理账本和依赖模型；保留其他个人记忆。
5. 重新启动 Tau。新的个人记忆不再从卡片正文提炼知识事实。

没有默认候选时返回 `status=unchanged`，不执行删除。备份期间数据库被其他连接修改时，脚本拒绝删除，完全退出 Tau 后重试。

## 明确选择不确定项

仅在已经确定条目应删除时指定 ID；先不带 `--apply` 预览，再执行：

```sh
node scripts/db/cleanup-personal-memory.mjs --library "<资料库.db>" --ids 12,34
node scripts/db/cleanup-personal-memory.mjs --library "<资料库.db>" --ids 12,34 --apply
```

`--ids` 仍拒绝手动更正和混合证据条目，不能用来删除任意个人记忆。

## 恢复

1. 完全退出 Tau。
2. 将原记忆文件以及同名的 `-wal`、`-shm` 文件（如果存在）一并另存。
3. 把 `backupPath` 的文件复制回原记忆文件路径，不覆盖资料库主文件。
4. 重新启动 Tau 并核对个人记忆相关行为。
