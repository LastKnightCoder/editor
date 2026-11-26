# @tau/i18n

本地词典声明与运行时。应用和插件分别提供词典，共享语言匹配、插值、复数、消息引用与 React 绑定。根入口不依赖 React 或应用设置。

词典按语言放在 `locales/`：

```text
locales/zh-CN.json
locales/zh-TW.json
locales/en-US.json
```

`locales/zh-CN.json`：

```json
{ "greeting": "欢迎，{{name}}" }
```

`locales/zh-TW.json`：

```json
{ "greeting": "歡迎，{{name}}" }
```

`locales/en-US.json`：

```json
{ "greeting": "Welcome, {{name}}" }
```

```tsx
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
import { defineI18n, createLocaleStore, createI18nRuntime } from "@tau/i18n";
import { I18nRuntimeProvider, useI18n } from "@tau/i18n/react";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const localeSource = createLocaleStore("zh-CN");
const runtime = createI18nRuntime({ localeSource });

function Greeting() {
  const { t } = useI18n(messages);
  return <p>{t("greeting", { name: "Tau" })}</p>;
}

export function Example() {
  return (
    <I18nRuntimeProvider runtime={runtime}>
      <Greeting />
    </I18nRuntimeProvider>
  );
}
```

- `localeSource` 是实际语言的快照与订阅，不包含 `system`。应用负责将用户偏好和系统语言解析为实际语言。
- `defineI18n` 校验并冻结资源；资源是语言到独立 JSON 词典的映射，文件内使用扁平字符串 key。key 中的点是普通字符。
- `useI18nRuntime()` 返回所在 Provider 的运行时或 undefined，供公共组件适配层选择独立使用时的默认值。
- `useI18n(messages)` 跟随所在 Provider；宿主公共组件可传第二个参数指定自己的运行时，避免嵌套插件覆盖宿主语言。
- `runtime.get(messages).t(key, values)` 用于非 React 逻辑，每次调用读取当前语言。参数仅允许字符串、有限数字与布尔值；文案按文本渲染，不作为 HTML 使用。
- `messages.ref(key, values)` 返回可序列化引用；`runtime.get(messages).resolve(reference)` 在展示时解析。声明所有者决定使用哪份词典，引用不携带词典或全局命名空间。
- 英文数量形式使用 `item_one` / `item_other`，调用时传 `{ count }`。缺词回退到配置的默认语言。
- 每份词典独立匹配语言变体，中文匹配保留文字体系。未知 key 和无默认词典属于配置错误。
- TypeScript 导入 JSON 时启用 `resolveJsonModule`；构建器把词典随应用或插件代码打包，不在运行时读取文件路径。
- 词典随代码打包，不使用在线翻译或远程词典加载。运行时使用弱引用缓存词典，`dispose()` 使既有翻译器失效。

应用与插件装配关系见 [国际化架构](/docs/architecture/i18n.md)。
