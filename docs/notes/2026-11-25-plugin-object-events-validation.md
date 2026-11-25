# 插件对象通知验证记录

业务对象只使用 context.events.on 的 created/updated/deleted 事件。待办、日程、清单、日历目录分别为 todo/event/todo-list/calendar，通知携带 get 使用的字符串 ID；workspace.reset 是资料库级例外。旧集合事件已移除，没有新增 data.changed 订阅格式。changes.query 保留为可靠补读接口。

桌面事件在事务性的连接 TEMP 队列中暂存，提交后分发，回滚不通知。四域复用持久变化日志的 action 字段；主库升级保留旧行和序号，不伪造历史动作。通知分页不丢不同身份，记录/实体按拥有者合并；异步回调串行等待，失败后继续。TEMP 队列不使用自增序列，防止遮蔽主库编号序列。

验证结果：

- SDK 381 项通过；SDK、桌面、手机类型检查通过。
- 桌面相关 66 项完成验证。并行构建时，一个既有正文运行时冷启动用例超过默认 5 秒；未改断言，串行以 15 秒验证窗口复验通过，实际约 4.97 秒。
- 手机 TS 数据/事件/任务适配 19 项通过；项目 Rust fmt/Clippy 及 399 项测试通过，保留两个既有环境门控忽略项。
- Schema build/check/prepare、AI Schema 对账、数据库/插件进程/白板边界通过；官网 69 项及发布行为 5 项通过；桌面 Vite 生产构建通过。
- 五个使用通知的官方插件均已在独立作者目录针对候选 SDK 构建和测试通过：expense、weight、questions、podcast、fakelink。它们已使用对象事件，无旧集合事件消费者。weight 仅补齐旧导航测试的真实页面 placement 参数，不改运行时功能。

官方合并验证报告：`/tmp/tau-object-official-authors/final-report.json`，保留首轮及 weight 复验原报告。候选 SDK 仅本地打包，没有发布 npm、客户端或插件。

压力验证覆盖千个目录、万级独立待办/日程、万条正文待办；全量期间改名及新增对应 10,012 个对象通知，四连接并发和颜色修改对应 5,544 个不同对象身份，均与独立预期集合逐项一致。千次重试、五百次无操作和百次回滚不产生额外对象通知；日志裁剪明确重置，21,001 个身份重新对账，正文和原始任务/事件行保持一致，完整性及外键检查通过。

压力输出 `/tmp/tau-object-stress.log`，临时资料库位于 `/var/folders/np/fm5y9kyj2b78fjytbyz8h5b4psthqs/T/tau-directory-stress-sD8qJk`。通知为可合并的状态失效提示，不是逐次审计记录；离线、停止或断档后需使用持久游标补读。没有进行视觉、真机或外部服务同步验收。
