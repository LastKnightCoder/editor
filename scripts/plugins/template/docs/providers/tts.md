# 语音合成

语音提供方让用户用你接入的服务朗读文字、生成播客，以及复刻音色。

先读[服务提供方](README.md)了解共同的写法。

## 注册

```ts
context.tts.register({
  id: context.pluginId,
  name: "我的语音服务",
  create: (config, modelId) => createVoiceService(context, parseConfig(config), modelId),
});
```

`create(config, modelId)` 用用户的一个账号配置和所选模型创建实例，不发起网络请求。

**用户可以为同一个插件添加多个账号**，每个账号是一份独立的配置。所以不要把"当前的 API Key"存在模块级变量里，一切都从 `create` 收到的 `config` 读取。

## 实例

| 成员                                                | 说明                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `getVoices(signal)`                                 | 返回音色列表：`{ id, name, type, description? }`，`type` 为 `system`（预置）、`cloned`（复刻）或 `custom` |
| `synthesize({ text, voiceId, options }, signal)`    | 合成语音，返回 `{ audio: Uint8Array, mime }`。`options` 包含可选的 `speed`、`volume`、`pitch`             |
| `cloneVoice({ file, requestedId?, name? }, signal)` | 可选。用一个参考音频文件复刻音色，返回新建的音色                                                          |
| `textInstructions`                                  | 可选。当前模型支持的文本标记规则（如停顿、语气标签），Tau 生成播客脚本时会参考                            |

- 网络请求使用 `context.fetch`，并传入方法收到的 `signal`。
- `cloneVoice` 的 `file` 是 `{ name, mimeType, content }`，每次一个文件。返回实际创建的音色，不要返回上传文件的 ID。

## 配置表单

```ts
context.settings.register({
  id: "tts",
  title: "我的语音服务",
  target: "tts",
  component: TTSSettings,
});
```

组件收到 `ttsConfig`：

| 字段                  | 说明                                   |
| --------------------- | -------------------------------------- |
| `instanceId`          | 正在编辑的账号 ID                      |
| `value`               | 这个账号的配置                         |
| `models`              | 这个账号的模型列表，`{ id, label? }[]` |
| `save(value, models)` | 保存这个账号的配置和模型列表           |

- 表单只编辑当前这一个账号，不要影响同插件的其他账号，也不要把它设为默认。
- 模型列表由你的表单提供，可以允许用户填写自定义模型。

## 上传参考音频

服务需要参考音频的公开地址时，用 `context.upload.uploadRemote(file, { signal })` 上传，它使用用户选择的上传配置，见[资源上传](upload.md#在其他功能中使用上传)。不要自己选择用户的上传插件或读取上传凭据。服务商自带文件上传接口的，直接用服务商的接口即可。

## 职责划分

音频的播放、拼接和保存由 Tau 负责，插件只负责调用服务商接口，不直接写笔记或文件。
