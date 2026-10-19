# SDK 与作者模板同步

## 任务列表

- COMPLETE：Investigate/Triage/Understand the problem。源码已移除 `ffmpeg.probe`；公开 SDK 为 0.22.0，本仓库模板锁定 0.18.0，GitHub 模板锁定 0.16.0。
- COMPLETE：更新 SDK 版本、作者模板与缺失文档，验证本地产物。SDK 0.23.0 保留 FFmpeg 转换与视频页面解析，移除本地媒体探测；补全能力索引、提供方配置、博客发布、独立站点数据接入和旧模板升级指引。
- COMPLETE：发布 npm SDK，同步 GitHub 模板并执行公开依赖干净构建。公开 npm 0.23.1 与模板 main 均已更新；从 GitHub 新克隆、使用全新 pnpm store 冻结安装和构建通过。

## 范围

核对 FFprobe 移除后的公开契约，发布新的 npm SDK，同步公开作者模板、锁文件与开发文档，并在独立目录验证安装和构建。不发布桌面客户端。

## 本地验证

- `pnpm --filter @tau/plugins check`、`test`、`build` 通过，28 个测试文件、107 项测试。
- `node scripts/plugins/package-sdk.mjs output/plugin-sdk-023` 通过，包中 14 份开发文档与模板维护源一致，公开 exports 指向实际产物，无 workspace/file/link 依赖。
- 仓库外 `/tmp/tau-sdk-author-023` 从本地 tgz 安装，计数器、作者契约和 PUBLISH/VIDEO/PUBLISH-DATA 文档示例一起通过 TypeScript 检查及 ZIP 构建。
- 已移除作者验证夹具中的旧 probe 调用；运行时测试检查服务对象没有 probe。未进行视觉验证或真实远端发布业务验收。

## npm 发布

- 2026-10-19 已发布 0.23.0 与文档修正版 0.23.1，模板最终锁定 0.23.1，UI 保持 0.1.1。
- 公开 registry 的 latest 已确认是 0.23.1；直接下载公开 tarball 与本地发布文件逐字节一致。
- 0.23.1 integrity：`sha512-njdvrmGB0/OIVUtMBcLnr/CR2VULwgBFBiVZrBsbp4oVpTTstXyxWP+YkKA4gT/nFSGYRquXQRZw1B9Y1Uw3YQ==`。
- npm CLI 和 pnpm 安装节点曾短暂返回旧 metadata，独立安装需等公开节点同步后才计为通过，不以本地 file 安装替代。

## 公开模板与最终验证

- 模板仓库：[tau-plugin-template](https://github.com/LastKnightCoder/tau-plugin-template)，main 提交 `acd48f71e1966c01de721f64d02835615333431c`，已推送。
- 补齐远端缺失的 IMAGES.md、VIDEO.md、PUBLISH.md、PUBLISH-DATA.md，并同步行内源码说明、能力索引、提供方配置及旧模板升级步骤。
- 本仓库模板与公开模板锁定相同的公开 SDK 0.23.1，锁文件摘要与 registry 一致，无本地 file/link/workspace 依赖。
- 从 GitHub 全新克隆至 `/tmp/tau-template-sdk0231-public-check`，使用全新 store `/tmp/tau-sdk0231-public-store`，公开 registry 下载 29 个包；`pnpm install --frozen-lockfile`、`pnpm build` 均通过，构建后 Git 工作区干净。
- 主仓库修改保留在本地，未推送应用分支；未覆盖同级 `tau-plugin-example` 中用户已有的入口修改。后续可由用户进行客户端功能和视觉验收。
