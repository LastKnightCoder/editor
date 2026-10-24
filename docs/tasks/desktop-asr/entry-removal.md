# 语音输入入口撤回

目标：只保留宿主 ASR、WebSocket 与 AI 整理能力，移除此前自行确定位置的功能入口，等待用户决定落点。

## 当前裁决

- 用户明确要求撤回所有新增入口：桌面聊天／搜索麦克风，桌面语音输入设置与 AI 整理配置行，移动搜索麦克风和语音输入设置页，以及插件详情的配置跳转。
- 已发布 SDK、Seed 插件及其契约不撤回；保留 ASR 注册、原生助手、Whisper、传输、采集／取消、模型整理与配置数据。
- UI 位置未确认前，不重新加入按钮、设置标签、路由、导航或默认挂载。ASR 配置表单可注册，宿主暂不显示，open 明确报入口不可用。
- 删除失去消费者的入口组件和界面测试；移动识别编排从 React Provider 抽为服务工厂，避免删除入口时连底层能力一起移除。

## 工作清单

- [x] Investigate/Triage/Understand the problem：清点麦克风、设置、路由、壳层挂载及插件跳转消费者。
- [x] 移除所有界面接线并删除仅用于入口的组件。
- [x] 验证注册能力、类型、构建与文档，并记录整库检查的已有阻断。

## 保留边界

`desktopSpeechInput`、`createMobileSpeechInputService`、`prepareSpeechRefinement` 与公共 @tau/asr 继续作为可调用服务；它们不由壳层启动录音或整理。speechInput 与 llmUsageSettings.speechInputRefinement 数据结构保留，既有配置不删除；大模型功能分配只统计仍显示的项目。既有视频转录与 TTS 界面不属于本次撤回范围。

已发布插件包不可覆盖，当前宿主位置尚未确定。客户端正式发行前需要按最终入口更新使用说明；本次不重发 SDK 或插件。

## 验证

- 入口消费者复查：桌面／移动源码及 shared 包内均无 SpeechInputButton、SpeechInputProvider、speechInputSettings、openSpeechInputSettings 或旧共享 UI 导出引用。
- 桌面相关回归 39 项、移动插件回归 24 项、公共 ASR 与整理行为 22 项通过；覆盖 ASR 仍可注册，但设置 open 不跳转、历史通用设置路由不渲染 ASR 表单。
- 移动类型检查通过；移动与桌面 Vite 构建（含主进程、preload）通过。桌面全量类型检查仍有两处并行白板实现错误：module-config.ts 的 whiteboard-documents init 返回 void，sessions.ts 的 stateHash 未使用；本次入口相关代码无类型错误，未改动这些白板实现。
- 文档检查通过，0 警告，diff 空白检查通过；未执行视觉验收。

## 下一步

等待用户确定入口位置后再设计和接入界面；在此之前只维护能力层。本次没有重发或撤销已发布的 SDK／Seed 插件。
