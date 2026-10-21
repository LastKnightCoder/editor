# 同步存储

同步存储提供方让用户把笔记库同步到你接入的存储服务（对象存储、网盘等）。你只需要实现"读写远端文件"的几个基本操作；同步什么、怎么命名、版本与冲突、断点恢复都由 Tau 负责。

先读[服务提供方](README.md)了解共同的写法。

## 注册

```ts
import type { SyncProvider } from "@tau/plugins/sync";

context.sync.register({
  id: context.pluginId,
  name: "我的存储",
  create: config => createStorage(context, parseConfig(config)),
});

function createStorage(context: PluginContext, config: MyConfig): SyncProvider {
  return {
    async uploadFile(name, bytes) {
      /* ... */ return true;
    },
    async downloadFile(name) {
      /* ... */ return new Uint8Array();
    },
    async fileExists(name) {
      /* ... */ return false;
    },
    async listFiles(prefix) {
      /* ... */ return [];
    },
    async createFileIfAbsent(name, bytes) {
      /* ... */ return true;
    },
  };
}
```

类型 `SyncProvider`、`SyncProviderDefinition`、`RemoteFileInfo` 从 `@tau/plugins/sync` 导入。

## 需要实现的方法

| 方法                              | 返回                        | 说明                                                         |
| --------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `uploadFile(name, bytes)`         | `Promise<boolean>`          | 上传对象，已存在时覆盖                                       |
| `downloadFile(name)`              | `Promise<Uint8Array>`       | 下载对象                                                     |
| `fileExists(name)`                | `Promise<boolean>`          | 对象是否存在                                                 |
| `listFiles(prefix?)`              | `Promise<RemoteFileInfo[]>` | 列出前缀下的全部对象，**分页由你在内部处理完**，返回完整列表 |
| `createFileIfAbsent(name, bytes)` | `Promise<boolean>`          | 只在对象不存在时创建，已存在时返回 `false`                   |

`RemoteFileInfo` 包含 `name`、`path`（相对路径）、`size`，以及可选的 `lastModified`、`hash`。

### createFileIfAbsent 必须是原子的

Tau 用它来保证多台设备同时同步时不会互相覆盖。它必须使用存储服务本身的条件写入能力（如 S3 的 `If-None-Match: *`），**不能用"先查是否存在、再上传"来模拟**，那样在并发时会出错。

请求失败、无法确定结果时直接抛出错误，Tau 会按自己的规则核实。

## 配置表单

```ts
context.settings.register({
  id: "sync",
  title: "我的存储",
  target: "sync",
  component: SyncSettings,
});
```

组件从 `syncConfig.value` 读取配置，用 `await syncConfig.save(config)` 保存。字段和校验由你决定。

- 每次同步任务开始时，Tau 用当时的配置调用 `create`，任务过程中配置不变。
- 关闭设置页不影响进行中的同步。
- 同步进行中，插件不能被停用或卸载。
- 停用插件后，配置会保留。
