//! 系统录音：iOS `AVAudioRecorder`、Android `MediaRecorder`。
//!
//! 录音中写 ADTS AAC（逐帧自描述，进程被杀也能读出已录部分），停止时原生侧无损重封装为 m4a。
//! 只提供 Rust 接口，不注册 WebView 命令；文件路径由宿主决定。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.native_record";
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_record);

#[cfg(not(mobile))]
const UNSUPPORTED: &str = "录音仅支持 iOS 和 Android";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartReply {
    /// 剩余可用空间（字节）；原生侧取不到时为 None
    pub free_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishReply {
    pub duration_ms: u64,
    pub size_bytes: u64,
}

pub struct NativeRecord<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    #[cfg(not(mobile))]
    _runtime: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> NativeRecord<R> {
    #[cfg(mobile)]
    async fn call<T: serde::de::DeserializeOwned>(
        &self,
        command: &str,
        payload: Value,
    ) -> Result<T, String> {
        self.handle
            .run_mobile_plugin_async(command, payload)
            .await
            .map_err(|error| error.to_string())
    }

    #[cfg(not(mobile))]
    async fn call<T: serde::de::DeserializeOwned>(
        &self,
        _command: &str,
        _payload: Value,
    ) -> Result<T, String> {
        Err(UNSUPPORTED.into())
    }

    /// 开始录到 `path`（.aac，ADTS）。事件：`level`、`paused`、`resumed`、`error`
    pub async fn start(
        &self,
        id: &str,
        path: &str,
        notification_title: &str,
        on_event: Channel<Value>,
    ) -> Result<StartReply, String> {
        self.call(
            "start",
            json!({ "id": id, "path": path, "title": notification_title, "onEvent": on_event }),
        )
        .await
    }

    pub async fn pause(&self, id: &str) -> Result<(), String> {
        self.call::<Value>("pause", json!({ "id": id }))
            .await
            .map(|_| ())
    }

    pub async fn resume(&self, id: &str) -> Result<(), String> {
        self.call::<Value>("resume", json!({ "id": id }))
            .await
            .map(|_| ())
    }

    /// 停止当前录音并把 ADTS 重封装到 `output`（.m4a）
    pub async fn stop(&self, id: &str, output: &str) -> Result<FinishReply, String> {
        self.call("stop", json!({ "id": id, "output": output }))
            .await
    }

    /// 放弃当前录音；文件由宿主删除
    pub async fn cancel(&self, id: &str) -> Result<(), String> {
        self.call::<Value>("cancel", json!({ "id": id }))
            .await
            .map(|_| ())
    }

    /// 打开本应用的系统设置页（麦克风权限被拒后引导用户去开）
    pub async fn open_settings(&self) -> Result<(), String> {
        self.call::<Value>("openSettings", json!({}))
            .await
            .map(|_| ())
    }

    /// 进程被杀后遗留的 ADTS 文件重封装为 m4a，不涉及录音会话
    pub async fn finalize(&self, input: &str, output: &str) -> Result<FinishReply, String> {
        self.call("finalize", json!({ "input": input, "output": output }))
            .await
    }
}

pub trait NativeRecordExt<R: Runtime> {
    fn native_record(&self) -> &NativeRecord<R>;
}

impl<R: Runtime> NativeRecordExt<R> for AppHandle<R> {
    fn native_record(&self) -> &NativeRecord<R> {
        self.state::<NativeRecord<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("native-record")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "NativeRecordPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = _api.register_ios_plugin(init_plugin_native_record)?;
            #[cfg(mobile)]
            app.manage(NativeRecord { handle });
            #[cfg(not(mobile))]
            app.manage(NativeRecord::<R> {
                _runtime: std::marker::PhantomData,
            });
            Ok(())
        })
        .build()
}
