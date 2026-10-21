# SDK 0.31.0 发布记录

日期：2026-10-21。

## 范围

站点设置重排与模板声明站点字段（D-179）的对外发布：`@xiongtao.xt/tau-plugins@0.31.0`、`@xiongtao.xt/tau-blog@0.4.0`，GitHub / S3 发布插件 0.1.3，官方博客模板 1.3.0，模板起步仓库示例。UI 包维持 0.2.0，客户端维持 0.59.0；插件作者模板 `tau-plugin-template` 仍固定 0.29.0，本次变更只涉及博客模板，未同步。

## 变更

- 模板 manifest 新增 `template.siteFields`（text/textarea/url/select/switch），宿主校验后在「站点设置 · 博客模板」按声明渲染；发布数据新增 `site.fields`，移除 `site.description` 与首页 `hero`。
- 发布插件表单改为宿主行式布局并自动保存，去掉「保存发布配置」。

## 验证与回执

- editor：`9ed7a6cde`、`c8051776d`、`18df0b096` 已推送 master。SDK 34 个文件 175 项测试、桌面类型检查与发布相关测试通过；两个包 `npm publish --dry-run` 通过，实际发布由用户完成 npm 两步验证。
- npm 回读：tau-plugins 0.31.0 `sha512-YrB4JiIE/bmpi9F6VXF66sQgLOt8XbyFN776keD/gXTdwRK9Fh8DX4/iTteSRGzk4Kj9LbXd1I8lQxpeMPyceQ==`；tau-blog 0.4.0 `sha512-k8xyC2GdtiU0WJ/AI8qwyVymBtsu1QSa9URfzWDp+z1osqaAGi3/Mx7L/N47vazzRFDvCXUqKJcJz+Z2nXAyNw==`，均与本地归档一致。
- 官方模板先用本地 0.4.0 归档验证类型检查与 40 项测试，公开后更新锁文件；`b197f7a` / `v1.3.0` CI 全部通过，插件中心 approved（自动批准）。
- GitHub 发布插件 `7e8152b` / `v0.1.3`、S3 发布插件 `d7bb568` / `v0.1.3`：CI 通过并发布 Release，插件中心 approved（自动批准）。
- 起步仓库 `23364df` 推送 main：template.json 可声明 `siteFields`，构建产物经新 SDK 校验通过。

本次未发布桌面安装包，视觉验收由用户完成。
