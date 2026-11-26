# 查询数据库验证

## 核心与桌面契约

在仓库根目录运行：

```sh
pnpm --filter @tau/shared exec vitest run src/query-database/__tests__
pnpm --filter desktop exec vitest run src-electron/main/modules/__tests__/query-database.test.ts src-electron/main/modules/__tests__/query-database-migration.parity.test.ts src-electron/main/modules/__tests__/domain-events.test.ts src-electron/main/modules/__tests__/diary-table.test.ts --maxWorkers 1 --no-file-parallelism
pnpm --filter desktop exec tsc -p scripts/query-database/tsconfig.json --noEmit
pnpm --filter desktop test:query-runtime
```

通过条件：DSL 解析、类型、日期与分页边界正确；失效合并和取消不发布迟到结果；排队、超时与失败释放执行位置；定义条件更新拒绝过期写入；查询表拒绝数据写入；日记命令与通用正文提交通知同窗消费者，回滚不发正文通知。运行时检查使用真实 Electron、Worker、消息通道和文件协议，须拒绝网络并终止死循环，结束后释放执行环境。

`test:query-runtime` 默认逐个运行开发 HTTP 与生产文件协议两种模式，使用实际桌面 Vite 配置的无主进程构建模式和临时测试页面。两种模式都必须通过迁移卡片 DSL、JS、重读、网络拒绝、死循环终止、失败后重试与环境清理；不得用打包产物的通过代替开发服务验证。只定位一条路径时可设置 `TAU_QUERY_RUNTIME_MODE=development` 或 `production`。

## 准备真实副本

先完成桌面构建，确保 `apps/desktop/dist` 和 `dist-electron/preload/index.js` 存在。确认当前主库及对应索引库路径，使用 SQLite online backup 取得副本；应用运行时不要直接复制可能处于 WAL 模式的单个 `.db` 文件。

下面在本机创建私有目录，仅以只读方式打开源库。替换两个源文件路径；输出副本按测试器约定命名为 `data.db` 和 `index/data/data.index.db`。

```sh
export TAU_QUERY_STRESS_COPY="$(mktemp -d "${TMPDIR:-/tmp}/tau-query-baseline.XXXXXX")"
python3 - /absolute/source/data.db /absolute/source/index/data/data.index.db "$TAU_QUERY_STRESS_COPY" <<'PY'
import pathlib, sqlite3, sys
from urllib.parse import quote

target = pathlib.Path(sys.argv[3]).resolve()
target.chmod(0o700)
for source, name in zip(sys.argv[1:3], ["data.db", "index/data/data.index.db"]):
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    original = pathlib.Path(source).resolve()
    assert destination.resolve() != original
    src = sqlite3.connect("file:" + quote(str(original)) + "?mode=ro", uri=True)
    dst = sqlite3.connect(destination)
    try:
        src.backup(dst)
        assert dst.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    finally:
        dst.close()
        src.close()
PY
```

副本需要包含实际卡片、文章、项目、项目文档、日记、待办、日程和普通数据库，才能覆盖相应非空场景。测试器会补充 Notebook、待办、重复系列及大表夹具；它不是空库功能冒烟测试。

## 真实链路与压力

```sh
TAU_QUERY_STRESS=1 TAU_QUERY_STRESS_BULK=2000 \
  pnpm --filter desktop test:query-stress
```

`TAU_QUERY_STRESS_COPY` 必须指向上一步的副本目录。测试器拒绝 `.editor` 原目录及其子目录；每轮再从基准副本以只读 backup 克隆新的工作副本，变更只进入新的临时目录。窗口隐藏且只执行行为验证。正式 preload、主进程数据库命令、SQL 投影、事件、React 刷新宿主与沙箱 Worker 都参与执行。待办和日程传输接到真实 task-assistant 查询函数，不启动后台提醒与远程同步。

通过条件：

- 来源身份、项目与文档的跨来源关联、分组聚合与独立 SQL 对账一致，普通表所有字段可查询，正文节点与 Markdown 均可读取；冷查询前后的所有主库表记录摘要一致。
- 新增、正文修改、标签进出与删除自动收敛；文章、项目文档、项目、白板、Notebook、材料、对话、日记、待办和日程修改后自动刷新。日记同时覆盖通用正文写入与分块投影；待办覆盖第二连接提交。
- 批量新增和批量移出范围无遗漏或重复，事务回滚无数据泄漏。20 个并发查询不串数；队列超载受控拒绝且随后仍可运行。
- 32 个相同修订的定义写入仅一个成功，结果不持久化；普通表写入、行补丁与差量接口对查询表全部拒绝，拒绝前后主库摘要相同。
- 10,000 / 20,000 行结果分页完整；20,001 行结果、50,001 行读取、17 MB 输入与超出 UTF-8 预算的输出明确失败。
- 代码替换、隐藏恢复、切库、普通重连、读失败恢复和同名文件替换不混入旧结果。文件替换后旧连接代次被拒绝，待办索引不得带入旧库内容。
- 语法错误、未知字段、脚本抛错、重复行身份、错误字段类型、非法分页及不可传递对象均受控返回；没有 renderer crash 或未处理的 Promise。
- 替换前后 SQLite `quick_check` 为 `ok`，`foreign_key_check` 无异常；执行环境最终释放。

脚本输出 `QUERY_CASE` 逐项结果，末尾输出脱敏 JSON 和报告、诊断路径。批量新增同时报告 `writeMs` 与 `commitToRefreshMs`：前者是源业务写入耗时，后者才是提交到查询刷新完成的耗时。大表耗时是端到端结果返回时间，不是界面绘制时间。内存与进程数量只作本机观测，不作为跨机器性能承诺。

诊断日志和工作副本可能含业务内容，只留在本机。核验完成后删除脚本输出的本轮临时目录以及自己创建的基准副本；只保留不含标题、正文、标签或凭据的计数与结论。

## 受限堆内存故障

```sh
TAU_QUERY_STRESS_OOM=1 pnpm --filter desktop test:query-runtime
```

该门控在独立 Electron 进程中将 V8 old-space 限为 128 MB，两次执行持续分配数组的 Worker 脚本。通过条件是两次都受控拒绝、每次后续查询都成功、主渲染进程存活且执行环境释放。V8 的 OOM 诊断输出属于预期故障证据。默认运行时检查不执行内存耗尽。

该实验覆盖受限 V8 堆失败恢复，不证明操作系统整体内存耗尽不会终止应用。真实云端上传下载、跨设备同步与移动端承载仍需在各自环境验证；这里的同步验证覆盖本机写入传播与下载后的真实同名库替换链路。

## 旧关联表自动迁移

在真实副本上增加 `TAU_QUERY_STRESS_LEGACY=1`：

```sh
TAU_QUERY_STRESS=1 TAU_QUERY_STRESS_LEGACY=1 TAU_QUERY_STRESS_BULK=100 \
  pnpm --filter desktop test:query-stress
```

脚本在本轮工作副本内附加卡片、文章、日记及项目根目录与含子文档五种旧关联定义，再通过正式开库链路迁移。通过条件：迁移后的查询行身份与独立 SQL 一致，旧行列不再持久化，源业务记录摘要相同，后续只读、刷新、预算、切库与同名替换矩阵均通过。Schema 当前指纹下再次带回旧表仍须触发升级。桌面与 Rust 的升级测试还须证明中途失败整体回滚、重复开库不再次释放正文，以及 shared 手写夹具的定义与视图输出一致。

## AI 提示与内置技能

```sh
pnpm --filter @tau/ai exec vitest run src/__tests__/query-database.test.ts src/skills/__tests__/skills.test.ts
pnpm --filter desktop exec vitest run src/services/content-editing/__tests__/scoped-plan.test.ts src/editor-extensions/query-database/markdown.test.ts --maxWorkers 1 --no-file-parallelism
```

通过条件：面板输入包含共用的完整语言参考和本次定义、参数、需求、错误，不携带额外结果行或源正文；内置技能可通过真实技能注册表按需读取相同参考；用户文档与技能中的示例在有数据和空结果时均通过真实解析与结果校验。完整正文查询块替换须保留参数和视图配置，无关正文同时输入时不被覆盖。该检查不调用远程模型，不以此证明模型生成的任意脚本都正确。
