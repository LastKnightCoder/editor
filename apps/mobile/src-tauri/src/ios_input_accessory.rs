//! 隐藏 WKWebView 聚焦可编辑区域时系统自带的表单辅助栏（上一个/下一个/完成），
//! 让编辑工具栏直接贴住键盘。
//!
//! WKWebView 没有公开开关，做法是把内部 WKContentView 类的 `inputAccessoryView` 替换为返回 nil。
//! 必须替换原类的方法：若改为派生子类并切换实例 isa，WKWebView 的键盘避让会把布局视口
//! 缩小并整页上滚。

use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{msg_send, sel};

type AccessoryViewFn = unsafe extern "C-unwind" fn(&AnyObject, Sel) -> *mut AnyObject;

unsafe extern "C-unwind" fn no_input_accessory_view(
    _this: &AnyObject,
    _cmd: Sel,
) -> *mut AnyObject {
    std::ptr::null_mut()
}

/// `wk_webview` 为 tauri `PlatformWebview::inner()` 返回的 WKWebView 指针，须在主线程调用。
pub fn hide(wk_webview: *mut std::ffi::c_void) {
    let Some(webview) = (unsafe { (wk_webview as *mut AnyObject).as_ref() }) else {
        return;
    };
    unsafe {
        let scroll_view: &AnyObject = msg_send![webview, scrollView];
        let subviews: &AnyObject = msg_send![scroll_view, subviews];
        let count: usize = msg_send![subviews, count];
        for index in 0..count {
            let subview: &AnyObject = msg_send![subviews, objectAtIndex: index];
            let class: &AnyClass = subview.class();
            if !class.name().to_bytes().starts_with(b"WKContent") {
                continue;
            }
            let replacement: Imp = std::mem::transmute(no_input_accessory_view as AccessoryViewFn);
            objc2::ffi::class_replaceMethod(
                class as *const AnyClass as *mut AnyClass,
                sel!(inputAccessoryView),
                replacement,
                c"@@:".as_ptr(),
            );
        }
    }
}
