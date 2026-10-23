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
| tau-plugin-abc            | 40891d7e628940381498b9aa6d44efc8867187cc |
| tau-plugin-bilibili       | a0e2801f7a0daf83f2cd6361e0cd59d4cdd44189 |
| tau-plugin-custom-block   | 5593e894e2f4ddebfbd2704e38726b0cd7429b15 |
| tau-plugin-github         | a01f2c09421c6ad45b39f34fde45f940eb37a935 |
| tau-plugin-html           | 454a1292b02c05fd2a680685c487983581db5e80 |
| tau-plugin-image-gallery  | dc6671122540d794feff4127acf91c944a62130a |
| tau-plugin-images-openai  | a490116258e9fbd56be2aa9bc80bbc7f76a60b4a |
| tau-plugin-oss            | e869a8ceab586d8ca9ab955faa483c20c4355dd7 |
| tau-plugin-publish-github | e4f0c902f98d35dc9175a9e5e6c68dcdab6e3da1 |
| tau-plugin-publish-s3     | cb11988e7156d6a3e04726d9c4ebdd7f8582d29a |
| tau-plugin-questions      | 2b9ed654b0443ccb859710e5e1df4b3a2025b87e |
| tau-plugin-s3             | fd0ad08e6286cbc362e47374511797c44d2d4027 |
| tau-plugin-stickman       | 846c78e0dcb664f427ca21dab89eb5ada2ee086a |
| tau-plugin-template       | 4390489d5bf99433b6587c35cdb4415565312fcf |
| tau-plugin-tikz           | 59f2bdcc50f5fb14e93ccf89ddf7c43d93763abb |
| tau-plugin-tts-minimax    | def7e1c056425e4d05b162d0f90f2cb10d27f2a5 |
| tau-plugin-tts-qwen       | d529d43f87d94a9d98412f29b705c44538249cb4 |
| tau-plugin-typst          | 371a0b2e4ad642105d2e475f926ef9b4d72f94cd |
| tau-plugin-upload-github  | fd9f30141602bd2cf9af4b5513734cd36d588cb7 |
| tau-plugin-upload-oss     | 40d596bdafe0a7ea052e883c304be32e3b93e0ee |
| tau-plugin-upload-s3      | 0e20cf9c6ce7e9348edb8801bc3aba266673245e |
| tau-plugin-webdav         | d9bf13cd230a30e2c4f5cdf9564ff78808d3ce49 |
| tau-plugin-weread         | 84f9e71074175cd65136d3020124a88933616ecf |
| tau-plugin-youtube        | f6955330d6415a653725751b11cff81856e2e37e |

## 验证与发行边界

24 仓在仓库外安装、冻结安装与构建通过；22 仓定义的自动测试共 176 项通过，Typst 的 2 个网络用例默认跳过，两端原生 WebView 已实际完成其 Wasm 渲染。火柴人与模板没有独立测试脚本，模板另有仓库外作者契约专项验证。

SDK 0.37.0 未发布，验证副本使用本地 tarball。源码保留 npm 依赖声明，锁文件按最终 SDK 包的完整性摘要更新；已核对 SDK 的依赖与 peer 依赖图未变。这不是对 npm 冻结安装成功的宣称。

推送后三个已有分支 CI 在下载未发布 SDK 时收到 ERR_PNPM_FETCH_404，未修改工作流绕过检查；发布 SDK 后应重跑：

- [自定义组件 CI](https://github.com/LastKnightCoder/tau-plugin-custom-block/actions/runs/39932449582)
- [火柴人 CI](https://github.com/LastKnightCoder/tau-plugin-stickman/actions/runs/39932524003)
- [微信读书 CI](https://github.com/LastKnightCoder/tau-plugin-weread/actions/runs/39932607111)

本轮不发布 npm、不上传新插件版本、不部署中心或网页。证据保存在 output/plugin-submodules 与 output/author-contract；源码与提交本身可从远端子模块获取。

## 退出条件

子模块接入与本地验证已完成；发行前 CI 复验和父任务 D 分别保留。维护方法在 plugins/README.md，当前目录继续随父任务收尾，不因本步骤完成提前关闭设备验收。
