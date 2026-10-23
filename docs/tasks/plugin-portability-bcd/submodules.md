# 官方插件子模块接入

目标：官方插件与统一模板在当前项目 plugins/ 下维护，保留独立 Git 历史，主仓库固定可从远端取回的提交。

## 用户决定与实施

- 先提交外部插件仓库已有修改，再克隆为子模块；23 个插件和 1 个模板均已接入。原外部目录保留为已提交快照，后续只在 plugins/ 维护。
- 统一模板的唯一源码为 plugins/tau-plugin-template；SDK 打包、仓库外验证与文档链接已指向此处，原 scripts/plugins/template 的维护副本删除。
- 所有子仓库使用 codex/author-contract 工作分支。提交已推送并逐仓核对远端 SHA，没有创建发布标签。SSH 核对发生超时后采用 HTTPS；.gitmodules 不包含本机路径或凭据。
- 每仓保持独立依赖与锁文件，不进入主仓库的 pnpm workspace。全新临时 Git 仓库通过 git submodule update --init --recursive 从远端拉取 24 个精确提交。日常步骤见 [子模块维护](/plugins/README.md)。

## 固定提交

| 子仓库                    | 提交                                     |
| ------------------------- | ---------------------------------------- |
| tau-plugin-abc            | b3a5683d2e36fb3241f027a3137d1d9ea85b9bb7 |
| tau-plugin-bilibili       | 84b590253116faa6ad9c69edde7535aa5699ee49 |
| tau-plugin-custom-block   | 44d52c8debd8657fd738b0b4f3b42f2fa51409b5 |
| tau-plugin-github         | 6c862f18aa3ba1a4add602e2274ec78e7336b998 |
| tau-plugin-html           | ac9278d1fd4b984e7c18318c5728af5ea4d93fae |
| tau-plugin-image-gallery  | d6176cc82e0b907acafe9abad767d60c4aa42b97 |
| tau-plugin-images-openai  | fd110aee88c2a567171d389dc847d2d509350a72 |
| tau-plugin-oss            | 51276435f2e402a7cda95b0bd89067cd3eb48c8f |
| tau-plugin-publish-github | da18d24a21a1806c5a5deafd86aa261ef55c614e |
| tau-plugin-publish-s3     | 19dd40c5beb233a3386868edfbe6f41cc53bf4d2 |
| tau-plugin-questions      | 2acfd00091c133ca93faee9ea28c934a7a013570 |
| tau-plugin-s3             | 11d7ffdbe32ef68eb3f20fe8117cd2aaefd54ebe |
| tau-plugin-stickman       | dfad022b193aef4acf20f5ee98b1a9c775f442fc |
| tau-plugin-template       | 5534454b97d6d15d99ca8d59e5f6ec494ecfb28a |
| tau-plugin-tikz           | 0e503f8190a8698305993f0d4dbdca23faf14200 |
| tau-plugin-tts-minimax    | 33e07ee8db008c55669d6b809821c50c2f56e828 |
| tau-plugin-tts-qwen       | 086f27a7b082424923fb5c1955e1e4799c8fde27 |
| tau-plugin-typst          | f65a3fd6804b11f748b67e0fa5de9036c86fb19a |
| tau-plugin-upload-github  | 6bc25da36433c44c1fa8decaf13bbe293d15851f |
| tau-plugin-upload-oss     | 7a7bf92da5bf7c44d3c336d200ce82b895e6eba3 |
| tau-plugin-upload-s3      | 8aca1dd616599edc0623d158ec8319435106c6be |
| tau-plugin-webdav         | 66b73b6c1e26647e4f044bf5f6387a707200b260 |
| tau-plugin-weread         | e811ac9f8030fb6ab0e40a74a802df3570f66b2c |
| tau-plugin-youtube        | db2b618d05fb702bdea210d6d94649cee2daecf2 |

## 验证与发行边界

24 仓在仓库外安装、冻结安装与构建通过；22 仓定义的自动测试共 176 项通过，Typst 的 2 个网络用例默认跳过，两端原生 WebView 已实际完成其 Wasm 渲染。火柴人与模板没有独立测试脚本，模板另有仓库外作者契约专项验证。

SDK 0.37.0 已发布，24 仓均已使用正式 npm 包和原锁文件在仓库外冻结安装、构建并执行已有测试；具体发行摘要与 CI 证据见 [SDK 发行](sdk-037-release.md)。

原三个 CI 先因 SDK 未发布而下载 404，发布后重跑暴露旧版本发布龄例外。精确更新为已核验的 SDK 0.37.0 后，修正提交上的同一工作流全部通过：

- [自定义组件 CI](https://github.com/LastKnightCoder/tau-plugin-custom-block/actions/runs/39937062028)
- [火柴人 CI](https://github.com/LastKnightCoder/tau-plugin-stickman/actions/runs/39937068126)
- [微信读书 CI](https://github.com/LastKnightCoder/tau-plugin-weread/actions/runs/39937073926)

本轮仅发布 SDK；没有发布插件版本、APP 或部署中心/网页。子仓库提交均已推送，证据保存在 output/plugin-submodules、output/author-contract 与 output/sdk-037-release。

## 退出条件

子模块接入、正式 npm 验证与三个 CI 恢复已完成；父任务 D 继续保留。维护方法在 plugins/README.md，当前目录继续随父任务收尾，不因本步骤完成提前关闭设备验收。
