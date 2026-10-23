## 开发文档

- [客户端构建与安装（Android / iOS）](/docs/guides/ops-client-build-install.md)
- [iOS 正式签名与打包](/docs/guides/ops-ios-signing.md)
- [SnapSheet 组件使用说明](./docs/SnapSheet组件使用说明.md)
- [ActionSheet 组件使用说明](./docs/ActionSheet组件使用说明.md)
- [移动端页面栈与返回策略](/docs/architecture/mobile.md)
- [Android 光标修复与补丁维护指南](./docs/slate-react-Android光标修复与补丁维护指南.md)

## Android 签名检查

依赖安装不配置签名。打 Android 包前恢复仓库外的已有密钥与凭据，运行 `pnpm --filter mobile prepare:android:signing`；缺失或密码错误会停止，不生成替代密钥。具体配置与换机恢复见上面的客户端构建与安装手册。

修改签名脚本后运行 `pnpm --filter mobile test:android:signing`。测试需要 JDK keytool，使用临时目录和一次性密钥，不接触正式签名资料。
