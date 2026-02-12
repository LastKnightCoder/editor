use tauri::AppHandle;

use crate::models::{ResourceSyncActionResponse, ResourceSyncProgress, ResourceSyncStatusFile};

use super::common::{
    empty_resource_progress, now_millis_u64, resource_response_err, resource_response_ok,
};
use super::context::build_resource_provider;
use super::resource_core::{
    refresh_resource_status, resource_runtime, run_resource_sync_job, set_resource_sync_running,
};

#[tauri::command]
pub async fn resource_sync_start(app: AppHandle) -> ResourceSyncActionResponse {
    let provider = match build_resource_provider(&app) {
        Ok(provider) => provider,
        Err(error) => return resource_response_err(error),
    };
    {
        let mut runtime = resource_runtime().lock().unwrap();
        if runtime.running {
            return resource_response_err(super::error::AppError::new(
                "RESOURCE_SYNC_ALREADY_RUNNING",
                "资源同步正在进行中",
            ));
        }
        runtime.running = true;
        runtime.cancel_requested = false;
        runtime.progress = empty_resource_progress();
        runtime.progress.status = "scanning".to_string();
        runtime.progress.start_time = Some(now_millis_u64());
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_resource_sync_job(app_handle, provider, false).await;
        if let Err(error) = result {
            let mut runtime = resource_runtime().lock().unwrap();
            runtime.progress.status = "error".to_string();
            runtime.progress.current_file = None;
            println!(
                "[resource-sync] start failed: {}:{}",
                error.code, error.message
            );
        }
        set_resource_sync_running(false);
    });
    resource_response_ok("资源同步已启动")
}

#[tauri::command]
pub async fn resource_sync_retry_failed(app: AppHandle) -> ResourceSyncActionResponse {
    let provider = match build_resource_provider(&app) {
        Ok(provider) => provider,
        Err(error) => return resource_response_err(error),
    };
    {
        let mut runtime = resource_runtime().lock().unwrap();
        if runtime.running {
            return resource_response_err(super::error::AppError::new(
                "RESOURCE_SYNC_ALREADY_RUNNING",
                "资源同步正在进行中",
            ));
        }
        runtime.running = true;
        runtime.cancel_requested = false;
        runtime.progress = empty_resource_progress();
        runtime.progress.status = "scanning".to_string();
        runtime.progress.start_time = Some(now_millis_u64());
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_resource_sync_job(app_handle, provider, true).await;
        if let Err(error) = result {
            let mut runtime = resource_runtime().lock().unwrap();
            runtime.progress.status = "error".to_string();
            runtime.progress.current_file = None;
            println!(
                "[resource-sync] retry failed start failed: {}:{}",
                error.code, error.message
            );
        }
        set_resource_sync_running(false);
    });
    resource_response_ok("失败文件重试已启动")
}

#[tauri::command]
pub async fn resource_sync_cancel() -> ResourceSyncActionResponse {
    let mut runtime = resource_runtime().lock().unwrap();
    if !runtime.running {
        return resource_response_ok("当前没有运行中的资源同步任务");
    }
    runtime.cancel_requested = true;
    resource_response_ok("已发送停止信号")
}

#[tauri::command]
pub async fn resource_sync_get_progress() -> ResourceSyncProgress {
    let runtime = resource_runtime().lock().unwrap();
    runtime.progress.clone()
}

#[tauri::command]
pub async fn resource_sync_get_status() -> Option<ResourceSyncStatusFile> {
    let runtime = resource_runtime().lock().unwrap();
    runtime.status_file.clone()
}

#[tauri::command]
pub async fn resource_sync_refresh(
    app: AppHandle,
) -> Result<Option<ResourceSyncStatusFile>, String> {
    let provider =
        build_resource_provider(&app).map_err(|e| format!("{}:{}", e.code, e.message))?;
    let status_file = refresh_resource_status(&app, &provider)
        .await
        .map_err(|e| format!("{}:{}", e.code, e.message))?;
    Ok(Some(status_file))
}
