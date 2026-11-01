//! 本地提醒通知：命令由 Tauri 直接转发到原生插件（Android `LocalNotifyPlugin` / iOS
//! `LocalNotifyPlugin`），Rust 侧只负责注册；桌面构建不注册原生实现，命令返回未找到。
use tauri::{plugin::TauriPlugin, Runtime};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.local_notify";
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_local_notify);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("local-notify")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin(PLUGIN_IDENTIFIER, "LocalNotifyPlugin")?;
            #[cfg(target_os = "ios")]
            _api.register_ios_plugin(init_plugin_local_notify)?;
            Ok(())
        })
        .build()
}
