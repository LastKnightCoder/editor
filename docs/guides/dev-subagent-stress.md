# 子 Agent 压测

## 执行

在仓库根目录运行。测试使用本机临时目录、pi 模型替身和 127.0.0.1 临时 HTTP 网关，不读取用户模型凭据，不向真实服务商发送负载。

快速运行故障和宿主测试：

```powershell
$env:TAU_SUBAGENT_STRESS = $null
pnpm --filter desktop exec vitest run src-electron/main/modules/__tests__/pi-subagents-stress.test.ts src-electron/main/modules/__tests__/pi-subagents-network.test.ts src-electron/main/modules/__tests__/pi-subagent-host.test.ts --maxWorkers 1 --no-file-parallelism
```

运行批量与固定种子压力：

```powershell
$env:TAU_SUBAGENT_STRESS = '1'
pnpm --filter desktop exec vitest run src-electron/main/modules/__tests__/pi-subagents-stress.test.ts --maxWorkers 1 --no-file-parallelism
$env:TAU_SUBAGENT_STRESS = $null
```

修改宿主准入、权限或持久化时，追加对应现有测试：

```powershell
pnpm --filter desktop exec vitest run src-electron/main/modules/__tests__/pi-host-concurrency.test.ts src-electron/main/modules/__tests__/pi-session-resume.test.ts src-electron/main/modules/__tests__/pi-session-lifecycle.test.ts src-electron/main/modules/__tests__/pi-tool-permissions.test.ts src-electron/main/modules/__tests__/pi-user-questions.test.ts src-electron/main/modules/__tests__/pi-subagents.test.ts --maxWorkers 1 --no-file-parallelism
pnpm check
```

## 判据

- 同一子会话始终串行；实际并发不超过注入的并发值；每次执行最多启动一次。
- 相同请求身份只接受相同载荷；超时仅退出该等待者；多个等待者不互相释放占位。
- 取消和停止后的迟到结果不能覆盖终态或启动旧队列；写盘失败也要停止本机运行。
- ask-question 与审批只产生用户交互快照；bypass 不自动回答；迟到回答与审批不复活任务。
- 等待审批期间停用的工具不得执行；工具桥继承失败后无半成品宿主。
- 单个父会话不能长期占用所有调度机会；队首保存失败不堵塞后续任务。
- 网络错误上报真实消息；失败时只有一次模型请求，父明确继续后才产生第二次请求，并包含原上下文。
- 结果不重复投递；旧分支、停止代次和其他窗口不能取得或唤醒不属于自己的任务。
- 文件保存失败不发布内存候选；恢复历史不重放结果未知的工具。

## 读取指标

- `SUBAGENT_STRESS`：各并发档的任务量、并发峰值、提交与总耗时、事件循环延迟、状态数量、编排文件大小和堆变化。
- `SUBAGENT_HISTORY_STRESS`：单父会话长输入与历史增长的耗时及延迟。
- `SUBAGENT_RACE_STRESS`：固定随机种子、操作数、提交数、实际启动数与并发峰值。
- `SUBAGENT_NETWORK`：本地故障类型、显式继续后的累计请求数与实际错误。

耗时不包含真实模型生成速度；堆变化会受 GC 影响，负值不作为泄漏或无泄漏结论。性能比较使用同一机器、相同参数，避免同时运行构建或其他压测。功能断言通过后，仍单独记录主线程延迟与完整快照大小，不以用例通过代替性能判断。

修改后按范围执行生产构建、架构检查与文档检查。视觉验收由用户完成。
