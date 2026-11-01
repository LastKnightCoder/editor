const COMMANDS: &[&str] = &[
    "permission_state",
    "request_permission",
    "open_settings",
    "schedule",
    "snooze",
    "cancel_owner",
    "take_actions",
    "set_foreground_banner",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("../../native-notify/android")
        .ios_path("../../native-notify/ios")
        .build();
}
