# 独立站点的数据接入

普通 Tau 插件仍然使用 SDK 类型开发，构建时将宿主注入模块设为 external。SDK 根入口和 UI 包不携带编辑器、组件或页面的运行实现。

独立站点可使用 `@tau/plugins/publish-data` 的纯数据类型，以及 `@tau/plugins/publish-client` 的可执行辅助客户端。后者只有数据读取、摘要校验、取消和搜索，不包含 React、渲染器、路由或预览界面。

```ts
import { createClient } from "@tau/plugins/publish-client";

const client = createClient({ manifestUrl: "https://example.com/data/site.<摘要>.json" });
const manifest = await client.readManifest();
const result = await client.readData({ key: manifest.items[0].key });
```

模板也可以自行读取协议 JSON。模板自行携带渲染实现并消费 C23 插件产物；宿主不为站点提供 UI 模块。资源以清单或所属数据文件的 URL 为上下文解析，公开路由由模板决定。
