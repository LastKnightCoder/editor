# 插件集成测试包

此目录只存放集成测试使用的固定发布产物，不是产品分发清单，任何客户端构建和生产启动均不得读取这里。

catalog.json记录源码仓库、源码提交、版本、原ZIP摘要及每个文件的摘要；包内子目录（如skills/<id>/SKILL.md）的文件以/分隔的相对路径记录。releases保留已验证包的原始字节，禁止格式化main.js/CSS/manifest或直接修改包内容。需要更新测试版本时从独立作者仓库/Release取得ZIP，执行：

```sh
node scripts/plugins/pin-test-fixture.mjs /path/to/plugin.zip <完整源码提交SHA> https://github.com/LastKnightCoder/<仓库>
```

校验和读取使用scripts/plugins/test-support/package-fixtures.ts；桌面测试由src/test-fixtures/plugin-packages.ts消费。正式插件通过插件中心审核、下载与安装，生产读取用户安装目录。博客发布也只收集用户当前已安装的插件，不读取测试包。

白板验收显式传入ZIP，不再有--bundled方式：

```sh
node apps/desktop/scripts/verify-whiteboard-plugin.mjs /path/to/taunote.stickman-0.1.1.zip taunote.stickman
node apps/desktop/scripts/sync-storage/run-client.mjs /path/to/tau.sync-github-0.1.0.zip
```

这些脚本在隔离目录模拟中心安装事务，不访问真实用户目录。真实门户下载与审核由独立测试/人工验收覆盖，不能将隔离事务测试表述为生产中心联调。
