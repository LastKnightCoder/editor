# 图片生成与编辑提供方

需要 SDK 0.18.0 和支持图片插件接口的客户端。通过 `context.images.register({ id: context.pluginId, name, create })` 注册，每个插件一个提供方，可由用户配置多个账号实例。

`create(config, modelId)` 同步创建任务实例，不发网络请求。配置结构由插件解释和校验，不读取宿主 store，也不将账号凭据放进插件共享 storage。实例至少实现一个方法：

- `generate({ prompt, options? }, signal)`：文本生成图片。
- `edit({ prompt, options?, images }, signal)`：基于一张或多张参考图编辑。

输入图片为 `{ name, mimeType, content: Uint8Array }`。输出为相同结构的数组，可附加 `revisedPrompt`。宿主支持 PNG/JPEG/WebP，单次最多 16 张、输入和输出总大小分别不超过 128 MiB。提供方返回临时 URL 时自行下载为字节，下载时不要将 API 凭据自动传给其他域名。

`options` 包含 `size/quality/outputFormat/background/count`，仅在显式传入时映射到服务商请求。无法等价支持的参数应报告错误，不忽略、不隐式多次调用凑数量。协议、鉴权、超时、重试和轮询由插件负责；网络使用 `context.fetch` 并传入方法的 signal，轮询等待也响应取消。宿主负责文件解析、最终资源上传和正文插入。

配置视图通过 `context.settings.register({ id, title, target: "images", component })` 注册。组件接收 `PluginSettingsProps.imageConfig`：`instanceId`、`value`、`modelId`、`save(value, modelId)`。字段、布局、验证和错误提示由插件决定；保存失败保留草稿，成功后才提示已保存。模型标识也由插件表单填写。不要把正在编辑的账号误当成全局当前账号。

生成和编辑仍使用用户选择的同一个当前账号；不支持的方法不显示对应入口。停用、重载、切库或调用窗口退出会关闭任务，后续上传和保存不得接收迟到结果。取消不保证撤销远端已发生的任务或费用。图片插件不自动安装、启用或切换资源存储。
