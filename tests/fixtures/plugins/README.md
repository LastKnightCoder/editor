# 插件集成测试包

此目录只存放集成测试使用的固定发布产物，不是产品分发清单，任何客户端构建和生产启动均不得读取这里。

catalog.json记录源码仓库、源码提交、版本、原ZIP摘要及每个文件的摘要；包内子目录（如skills/<id>/SKILL.md）的文件以/分隔的相对路径记录。releases保留已验证包的原始字节，禁止格式化main.js/CSS/manifest或直接修改包内容。需要更新测试版本时从独立作者仓库/Release取得ZIP，执行：

```sh
node scripts/plugins/pin-test-fixture.mjs /path/to/plugin.zip <完整源码提交SHA> https://github.com/LastKnightCoder/<仓库>
```

校验和读取使用scripts/plugins/test-support/package-fixtures.ts；桌面测试由src/test-fixtures/plugin-packages.ts消费。正式插件通过插件中心审核、下载与安装，生产读取用户安装目录。博客发布也只收集用户当前已安装的插件，不读取测试包。

验证尚未提交的插件改动时，在插件仓库执行 `git diff --binary HEAD > /tmp/plugin-source.patch`，构建 ZIP 后将补丁作为固定脚本的第四个参数。`sourceRevision` 填基准 HEAD，`sourcePatch` 记录补丁路径与 SHA-256；`sources/` 保存补丁，`releases/` 仍保留 ZIP 原始字节。复现时检出基准提交再 `git apply` 对应补丁。此类产物是本地验证构建，不代表已发布；正式发布后以真实发布提交和 ZIP 更新夹具。

本地源码补丁构建使用当前工作区 SDK：先运行 `node scripts/plugins/package-sdk.mjs /tmp/tau-fixture-sdk`，在插件的隔离副本里将 `@tau/plugins`、`@tau/ui` 指向生成的 tarball，再安装、测试和构建；不修改作者仓库的正式依赖与锁文件。当前 HTML 行内字段依赖宿主的 `inputRef`，已发布 SDK 0.44.0 尚不包含它，不能将该验证构建视为公开 SDK 的独立发行验收。读取器同时校验旧桌面包与格式 3 包，桌面集成测试通过正式宿主入口检查平台及客户端版本。

白板验收显式传入ZIP，不再有--bundled方式：

```sh
node apps/desktop/scripts/verify-whiteboard-plugin.mjs /path/to/taunote.stickman-0.1.1.zip taunote.stickman
node apps/desktop/scripts/sync-storage/run-client.mjs /path/to/tau.sync-github-0.1.0.zip
```

这些脚本在隔离目录模拟中心安装事务，不访问真实用户目录。真实门户下载与审核由独立测试/人工验收覆盖，不能将隔离事务测试表述为生产中心联调。
