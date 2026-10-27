# 插件集成测试包

此目录只存放集成测试使用的固定发布产物，不是产品分发清单，任何客户端构建和生产启动均不得读取这里。

catalog.json记录源码仓库、源码提交、版本、原ZIP摘要及每个文件的摘要；包内子目录（如skills/<id>/SKILL.md）的文件以/分隔的相对路径记录。releases保留已验证包的原始字节，禁止格式化main.js/CSS/manifest或直接修改包内容。需要更新测试版本时从独立作者仓库/Release取得ZIP，执行：

```sh
node scripts/plugins/pin-test-fixture.mjs /path/to/plugin.zip <完整源码提交SHA> https://github.com/LastKnightCoder/<仓库>
```

校验和读取使用scripts/plugins/test-support/package-fixtures.ts；桌面测试由src/test-fixtures/plugin-packages.ts消费。正式插件通过插件中心审核、下载与安装，生产读取用户安装目录。博客发布也只收集用户当前已安装的插件，不读取测试包。

验证尚未提交的插件改动时，在插件仓库执行 `git diff --binary HEAD > /tmp/plugin-source.patch`，构建 ZIP 后将补丁作为固定脚本的第四个参数。`sourceRevision` 填基准 HEAD，`sourcePatch` 记录补丁路径与 SHA-256；`sources/` 保存补丁，`releases/` 仍保留 ZIP 原始字节。复现时检出基准提交再 `git apply` 对应补丁。此类产物是本地验证构建，不代表已发布；正式发布后以真实发布提交和 ZIP 更新夹具。

本地源码补丁构建使用当前工作区 SDK：先运行 `node scripts/plugins/package-sdk.mjs /tmp/tau-fixture-sdk`，在插件的隔离副本里将 `@tau/plugins`、`@tau/ui` 指向生成的 tarball，再安装、测试和构建；不修改作者仓库的正式依赖与锁文件。本地源码补丁构建只用于验证当前契约，不代表公开 SDK 的独立发行验收。目录只登记格式 3 的当前包，桌面集成测试通过正式宿主入口检查平台及客户端版本。更新目录后删除无引用的旧版本目录，消费者按 catalog.json 的插件身份读取，不硬编码版本路径或改写包格式。

白板验收显式传入ZIP，不再有--bundled方式：

```sh
node apps/desktop/scripts/verify-whiteboard-plugin.mjs /path/to/taunote.stickman-0.1.11.zip taunote.stickman
node apps/desktop/scripts/sync-storage/run-client.mjs /path/to/tau.sync-github-0.3.3.zip
```

这些脚本在隔离目录模拟中心安装事务，不访问真实用户目录。真实门户下载与审核由独立测试/人工验收覆盖，不能将隔离事务测试表述为生产中心联调。

本轮替换的 11 个夹具来自作者子模块的干净提交，使用其已有锁文件依赖和构建脚本生成，未发布到中心或 npm。catalog.json 的 sourceRevision 与 archiveSha256 分别记录实际源码提交和本次构建 ZIP 摘要；保留的 HTML 与自定义块验证包继续使用其已记录的来源与补丁。
