# 资源上传

资源上传提供方让用户把编辑器里的图片、附件上传到你接入的存储（图床、对象存储、Git 仓库等），正文中直接引用返回的地址。

先读[服务提供方](README.md)了解共同的写法。资源上传与[同步存储](sync.md)是两套独立的接口。

## 注册

```ts
context.upload.register({
  id: context.pluginId,
  name: "我的图床",
  async upload(file, config, signal) {
    const settings = parseConfig(config);
    const response = await context.fetch(`${settings.endpoint}/${encodeURIComponent(file.name)}`, {
      method: "PUT",
      headers: { "Content-Type": file.mimeType, Authorization: `Bearer ${settings.token}` },
      body: file.content,
      signal,
    });
    if (!response.ok) throw new Error(`上传失败：${response.status}`);
    return `${settings.publicBaseUrl}/${encodeURIComponent(file.name)}`;
  },
});
```

`upload(file, config, signal)`：

| 参数     | 说明                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| `file`   | `{ name, mimeType, content }`。`name` 已由 Tau 唯一命名，`content` 是 `Uint8Array` |
| `config` | 用户保存的配置                                                                     |
| `signal` | 取消信号，传给 `context.fetch`                                                     |

返回资源的 HTTP(S) 地址。

## 返回的地址

- 地址会写进正文，必须**长期有效**。不要返回有过期时间的签名地址。
- 上传成功不等于任何人都能访问：存储桶或仓库的公开读取需要用户自己设置。不要自动修改用户的存储权限，在 README 里说明怎么配置。
- 需要自定义公开域名时，在配置表单中让用户填写，按对象路径拼出完整地址。

## 配置表单

```ts
context.settings.register({
  id: "upload",
  title: "我的图床",
  target: "upload",
  component: UploadSettings,
});
```

组件从 `uploadConfig.value` 读取配置，用户保存时调用 `await uploadConfig.save(config)`。保存后，Tau 会把你的插件选为当前的上传目标。

## 职责划分

Tau 负责图片压缩、文件命名、本地保存和多窗口之间的转发；插件只负责把文件传到远端并返回地址。插件拿不到用户的文件路径，也不修改笔记内容。

## 在其他功能中使用上传

插件自己需要上传文件时（例如上传参考音频），调用 `context.upload.uploadRemote`，它使用用户当前选择的远端上传配置：

```ts
const url = await context.upload.uploadRemote(
  { name: "sample.mp3", mimeType: "audio/mpeg", content: bytes },
  { signal }
);
```

用户选择的是本地存储时，`uploadRemote` 会明确报错，不会自动换成其他存储。取消只是停止等待，不会撤回已经上传的文件。

## 测试清单

- 用户选择本地存储时，插件不会被调用。
- 上传成功、失败（认证错误、网络错误）都有正确的结果和提示。
- 保存配置、停用插件、在独立窗口中上传、重启后再上传。
