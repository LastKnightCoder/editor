// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-local-notify",
  platforms: [.iOS(.v13)],
  products: [.library(name: "tauri-plugin-local-notify", type: .static, targets: ["tauri-plugin-local-notify"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-local-notify", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
