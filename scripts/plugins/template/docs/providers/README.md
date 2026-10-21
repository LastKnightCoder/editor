# 服务提供方

Tau 的一些功能允许用户选择背后的服务：同步到哪个存储、图片上传到哪个图床、用哪家的语音合成等等。插件可以注册为这些功能的**提供方**，把一个新的服务接入进来。

| 提供方                 | 接入后用户可以                           | 配置界面出现在               |
| ---------------------- | ---------------------------------------- | ---------------------------- |
| [同步存储](sync.md)    | 把笔记库同步到你接入的存储服务           | 设置 · 同步                  |
| [资源上传](upload.md)  | 把编辑器里的图片、附件上传到你接入的存储 | 设置 · 资源存储              |
| [语音合成](tts.md)     | 用你接入的服务朗读、生成播客、复刻音色   | 设置 · 语音                  |
| [图片生成](images.md)  | 用你接入的模型生成和编辑图片             | 设置 · 图片生成              |
| [视频来源](video.md)   | 从你接入的视频网站或服务添加视频         | 设置 · 账号与连接 · 在线视频 |
| [博客发布](publish.md) | 把博客发布到你接入的目标                 | 发布 · 站点设置 · 发布目标   |

## 共同的模式

所有提供方都遵循同一套写法，理解了一个，其他的就很容易上手。

### 1. 注册提供方

在 `activate` 中注册，`id` 固定为 `context.pluginId`。每个插件只能注册一个同类提供方。

```ts
context.upload.register({
  id: context.pluginId,
  name: "我的图床",
  async upload(file, config, signal) {
    // ...
  },
});
```

多数提供方用 `create(config)` 根据用户配置创建实例：

```ts
context.sync.register({
  id: context.pluginId,
  name: "我的存储",
  create: config => createStorage(context, parseConfig(config)),
});
```

`create` 是同步的，只根据配置创建对象，**不发起网络请求**。真正的连接在实例的方法被调用时才发生。Tau 在每次任务开始时调用 `create`，同一次任务中配置保持不变。

### 2. 注册配置表单

用户需要填写账号、地址等配置。用 `context.settings.register` 注册一个带 `target` 的设置区域，它会出现在对应功能的设置里，而不是插件详情页：

```tsx
import type { PluginSettingsProps } from "@tau/plugins";

function UploadSettings({ uploadConfig }: PluginSettingsProps) {
  if (!uploadConfig) return null;
  const initial = parseConfig(uploadConfig.value);
  // 表单...
  async function save(next: MyConfig) {
    await uploadConfig.save(next);
  }
}

context.settings.register({
  id: "upload",
  title: "我的图床",
  target: "upload",
  component: UploadSettings,
});
```

| `target`  | 组件收到的配置属性 | 保存方法               |
| --------- | ------------------ | ---------------------- |
| `sync`    | `syncConfig`       | `save(value)`          |
| `upload`  | `uploadConfig`     | `save(value)`          |
| `tts`     | `ttsConfig`        | `save(value, models)`  |
| `images`  | `imageConfig`      | `save(value, modelId)` |
| `video`   | `videoConfig`      | `save(value)`          |
| `publish` | `publishConfig`    | `save(value)`          |

- 配置属性是可选的，使用前先检查是否存在。
- `value` 是之前保存的 JSON 值，用户还没保存过时可能为空。读取后自己校验结构，缺失的字段用默认值。
- `save` 失败时保留用户的输入并显示错误；成功后再提示已保存。
- 配置由 Tau 保存，**不要再存一份到 `context.storage`**：`storage` 会随笔记库同步，不适合放凭据。
- `create(config)` 收到的就是这里保存的值。

注册后，插件详情页会提供跳转到这个配置表单的入口，`register` 返回的句柄的 `open()` 也会跳转过去。

### 3. 网络请求与取消

- 请求统一用 [`context.fetch`](../storage-and-network.md#网络请求)。
- 提供方的方法会收到 `signal`，把它传给 `context.fetch`。重试前的等待、轮询也要响应取消。
- 自己设置超时时，用 `AbortSignal.any([signal, AbortSignal.timeout(ms)])` 组合，不要丢掉 Tau 传入的 `signal`。
- 取消后不要把 `AbortError` 当成可重试的错误。

### 4. 错误处理

- 失败时抛出带可读信息的错误，不要吞掉异常后返回"成功"或空结果，否则 Tau 会误以为操作完成了。
- 错误信息里不要包含 Token、密码等凭据。
- 插件停用时，进行中的请求会被取消，迟到的结果会被丢弃。

### 5. 运行环境

提供方运行在浏览器环境中，可以使用浏览器兼容的 npm 包，但不能使用 Node.js 模块（`fs`、`http`、`Buffer` 等）。很多服务商的 SDK 允许替换 HTTP 实现，把它接到 `context.fetch` 上即可。

### 6. 在 manifest 中选择分类

在 `categories` 中写上对应的分类（`sync`、`upload`、`voice`、`ai`、`video`、`blog-publish`），用户在插件中心按分类筛选时就能找到你的插件。分类只影响展示，注册提供方的是代码。

### 7. 写好 README

提供方插件通常需要用户在服务商那里做一些准备，比如创建存储桶、开放公开读取、生成 Token。把这些步骤和常见错误写进插件的 `README.md`。
