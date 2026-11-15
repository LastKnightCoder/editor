# 正文验收对照证据

报告保留采集时的版本、命令与摘要。清单中的 `/tmp` 日志路径指向采集环境的临时文件。正文与白板的验证入口及夹具位于对应源码旁。 [执行命令](/docs/guides/dev-content-verification.md)

## 冻结投影基线

基线源码 `dee0f8bbe3ad4bebd899ad22647b87995e29b3ae`，相同机器上顺序运行三轮，每轮 14 个场景通过。基准进程采样最高 RSS 584 MiB，heap 236 MiB。下表 P95 单位为 ms。 [环境、原始命令与阈值摘要](./projection-baseline/manifest.json)

| 文档大小              | 空保存中位数 / 上限 | 编辑保存中位数 / 上限 |
| --------------------- | ------------------- | --------------------- |
| 32 段 × 256 字符      | 0.099 / 5.119       | 3.287 / 8.944         |
| 256 段 × 512 字符     | 0.093 / 5.112       | 2.414 / 7.897         |
| 1,024 段 × 1,024 字符 | 0.090 / 5.108       | 7.476 / 13.971        |

[第一轮](./projection-baseline/stress-1.json)、[第二轮](./projection-baseline/stress-2.json)、[第三轮](./projection-baseline/stress-3.json)。

## 共享恢复

一次生产构建的真实正文 IPC 10 项和独立协作 Electron 9 项通过。发布与解绑在真实事务提交后的断点硬杀，核对原房间或预存本机基线。共享整篇替换同时丢失提交与回查响应后重开，只查询原 ID，远端只应用一次。该候选的三轮正文压力均通过，百万字符编辑保存 P95 中位 13.401 ms。 [生产与压力清单](./sharing-recovery/manifest.json)

[发布硬杀](./sharing-recovery/publish-crash-result.json)、[解绑硬杀](./sharing-recovery/demote-crash-result.json)、[整篇替换回执](./sharing-recovery/shared-replacement-restart-result.json)。

## 跨端与派生

- 两组 SQLite 往返经过真实桌面与 Rust 存储适配。第一组保留原夹具，第二组增加共享房间、表与行正文持有和流水回滚。移动 TS 84 项与独立 Rust 17 项通过。实际手机、同步提供方及 WebView 输入由设备验收。 [普通往返](./cross-runtime/storage-roundtrip.json) · [共享往返](./cross-runtime/shared-storage-roundtrip.json) · [移动清单](./cross-runtime/mobile-manifest.json)
- 同一桌面候选的白板生产 IPC 验证真实 Node 协议 3、富文本跨页、嵌入持有和重复安装；短容量通过 64 页、5,000 元素、1,024 富文本根和 8 MiB 边界。 [白板生产](./cross-runtime/whiteboard-production.json) · [白板清单](./cross-runtime/whiteboard-manifest.json)
- 正文写入事件按实际连接名称路由后，冷态建待办、活跃会话修改、幂等、旧修订拒绝以及旧或已删除索引文件的重建均通过真实 IPC。核对实际 FTS 命中、正文身份、契约、关系和计数。真实向量模型和语义召回由配置环境验收。 [任务与索引生产](./cross-runtime/index-task-production.json) · [任务与索引清单](./cross-runtime/index-task-manifest.json)

## 快速验证

同一桌面候选 `d5cdd5804bdad7dce1877f8653ab440469dcdef00794ea0bff16f06100503a88` 上，运行 12 组容量、单篇 1,000 次接纳和四点共 8 次硬杀，两项并行的时延仅作观测。长稳烟测覆盖真实断线、编辑、重连、切库和重开；正式采样在首样本后中断。 [快速容量](./quick/capacity.json) · [八次硬杀](./quick/recovery.json) · [长稳烟测](./quick/soak-smoke.json) · [中断记录](./quick/soak-interrupted.json) · [清单](./quick/manifest.json)
