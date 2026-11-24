# 模型出站验证

## 契约回归

在仓库根运行公共 AI 包、相关桌面运行时与移动服务测试：

```sh
pnpm --filter @tau/ai test
pnpm --filter @tau/ai check
pnpm --filter @tau/ai check:browser
pnpm --filter desktop exec vitest run src-electron/main/modules/__tests__/pi-ai-single-shot.test.ts src-electron/main/modules/__tests__/pi-ai-runtime-core.test.ts src-electron/main/modules/__tests__/pi-session-host-core.test.ts src-electron/main/modules/__tests__/pi-subagents-network.test.ts src-electron/main/modules/__tests__/model-usage-store.test.ts src-electron/main/modules/__tests__/model-usage-segments.test.ts src/services/__tests__/piLLM.test.ts
pnpm --filter mobile exec vitest run src/services/ai/__tests__ src/services/ai/native.test.ts
```

判据：任务路由在工具循环与重试中保持稳定，不同任务隔离；显式参数与自定义请求头保留；取消和流内错误不能返回成功；旧用量事件升级与分段往返保留数据。架构守护扫描必须非空，业务模块不得直接引用协议 API。

## 本地并发

```sh
TAU_AI_REQUEST_STRESS=1 TAU_AI_REQUEST_ROUNDS=300 pnpm --filter desktop exec vitest run --config vitest.eval.config.ts src-electron/eval/model-request.eval.test.ts -t 本地三协议
```

本地 HTTP 服务按三协议返回分片 SSE，不访问真实模型。每协议执行指定轮数的桌面单发与原生托管传输，并执行主对话工具循环；单发最大并发 12、主对话最大并发 3。轮数取 1–1000，默认 60。报告在 `output/ai-model-request/local-pressure.json`，记录任务、出站请求、工具执行、审计数量与耗时；耗时仅供当前机器参考，不作为单测阈值。

## 真实模型

```sh
TAU_AI_REQUEST_LIVE=1 pnpm --filter desktop exec vitest run --config vitest.eval.config.ts src-electron/eval/model-request.eval.test.ts -t 本机配置模型
TAU_AI_REQUEST_CONCURRENT=1 pnpm --filter desktop exec vitest run --config vitest.eval.config.ts src-electron/eval/model-request.eval.test.ts -t 已配置功能模型
TAU_AI_REQUEST_ANTHROPIC=1 pnpm --filter desktop exec vitest run --config vitest.eval.config.ts src-electron/eval/model-request.eval.test.ts -t 配置端点
```

真实验证需要使用者授权。配置缺省从本机 `~/.editor/setting.json` 只读读取，可用 `KL_SETTING` 指定文件；已退役账号通过 `TAU_AI_SKIP_PROVIDERS` 按展示名排除，多个名字用逗号分隔。跨出口验证每个有效服务商的首个模型，分别经过桌面单发、原生凭据注入的等价 fetch 和主对话工具循环；原生等价传输不等同于手机设备实测。

功能并发验证标题、记忆、内容元数据、补全、语音整理和闪卡六项实际分配，每项两次，共 12 个任务，最大并发 2，逐条审计。Anthropic 验证使用已配置的该协议端点与密钥，仅在验证进程中构建自定义 provider，避免目录选择的原生协议替代被测协议。

只发送合成输入，不读取用户正文、不修改设置、不向真实资料库写入。工具仅执行两个合成数字相加。会话和认证辅助文件隔离在临时目录并在收尾删除；报告只包含服务商／模型名、结果和耗时，不记录凭据与提示词。有效账号失败时保留错误并定位，不通过跳过或删除断言换绿。
