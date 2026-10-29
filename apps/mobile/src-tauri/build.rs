fn main() {
    // cargo test 的产物不带清单时，Windows 会把 comctl32 解析到 5.82 旧版，
    // tao 静态导入的 TaskDialogIndirect（仅 v6 提供）导致测试进程以 0xC0000139 启动失败；
    // 为测试目标嵌入 v6 依赖声明，应用产物的清单仍由 tauri-build 负责
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' \
             name='Microsoft.Windows.Common-Controls' version='6.0.0.0' \
             processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }
    tauri_build::build()
}
