# 资源上传插件

需要 SDK 0.12.0 和包含资源上传插件能力的 Tau 0.59.0 客户端。上传返回正文可直接引用的 HTTP(S) 地址；数据库和资源目录同步使用 SYNC.md 的另一套接口。

在 activate 中注册提供方：

```tsx
context.upload.register({
  id: context.pluginId,
  name: "我的资源存储",
  async upload(file, config) {
    // 用 context.fetch 请求服务商，认证与路径由本次 config 决定。
    // file.name 已唯一命名，file.mimeType 是 MIME，file.content 为 Uint8Array。
    return uploadToStorage(context.fetch, file, config);
  },
});
context.settings.register({
  id: "upload",
  title: "我的资源存储",
  target: "upload",
  component: UploadSettings,
});
```

UploadSettings 接收 PluginSettingsProps。读取 uploadConfig.value，在用户保存时调用 await uploadConfig.save(config)，宿主保存并选中该提供方；不要将同一份上传配置再存到 context.storage。配置是 JsonValue，读取时自行校验字段并给出错误提示。组件在资源存储设置页显示；插件详情页提供跳转入口。

每个插件只能注册一个上传提供方，id 必须等于 context.pluginId。宿主负责压缩、文件唯一命名、本地保存和跨窗口转发。插件只负责远端上传和返回资源地址，不读取用户文件路径，也不修改笔记内容。

请求通过 context.fetch 发送，失败抛出错误，不返回空地址或吞掉失败。停用插件会取消上下文请求并拒绝迟到结果。插件在渲染进程执行，不使用 Node 模块或额外后台入口。

返回地址必须长期可引用；不要返回短期签名 URL。桶或仓库的公开读取策略由用户配置，上传成功不等于匿名用户可以访问。不要自动修改用户桶权限。需要自定义公开域名时由插件设置提供，按对象路径返回完整 URL。

完成后验证：本地模式不调用插件、远端上传成功及失败、保存配置、停用、独立窗口上传、重启恢复。README.md 应说明如何配置公开访问和常见服务商错误。
