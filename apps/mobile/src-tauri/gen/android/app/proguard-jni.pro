# Rust 经 JNI 按名字调用的 MainActivity 方法：Kotlin 侧没有调用方，release 的 R8 会把它们当作无用代码删掉，
# 启动时 Rust 找不到方法即抛 NoSuchMethodError 闪退。新增 JNI 入口必须同步登记。
-keepclassmembers class com.txiong.tau_mobile.MainActivity {
  public java.lang.String takeIncomingFile();
  public int installAppUpdate(java.lang.String);
}
