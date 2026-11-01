import Foundation
import Tauri
import UIKit
import UserNotifications
import WebKit

/// 一条已排期的系统提醒；key 形如 `todo:12:900000`，owner 形如 `todo:12`
struct ReminderEntry: Codable {
  let key: String
  let owner: String
  let kind: String
  let ownerId: Int64
  let title: String
  let body: String
  /// 不含倒计时的时间描述（「18:00 截止」），稍后提醒时用来重写正文
  let detail: String
  /// 通知按钮：complete =「完成 / 稍后」，ack =「知道了 / 稍后」，none = 无按钮
  let actions: String?
  let at: Int64

  var actionSet: String { actions ?? (kind == "todo" ? "complete" : "ack") }

  var json: [String: Any] {
    [
      "key": key, "owner": owner, "kind": kind, "ownerId": ownerId,
      "title": title, "body": body, "detail": detail, "actions": actionSet, "at": at,
    ]
  }

  static func from(_ value: Any?) -> ReminderEntry? {
    guard let value, JSONSerialization.isValidJSONObject(value),
      let data = try? JSONSerialization.data(withJSONObject: value)
    else { return nil }
    return try? JSONDecoder().decode(ReminderEntry.self, from: data)
  }
}

struct ScheduleArgs: Decodable {
  let items: [ReminderEntry]
  let owners: [String]
  let snoozeMinutes: Int?
}

struct SnoozeArgs: Decodable {
  let item: ReminderEntry
}

struct OwnerArgs: Decodable {
  let owner: String
}

struct BannerArgs: Decodable {
  let enabled: Bool
}

private let idPrefix = "tau.reminder."
private let actionsKey = "tau.local-notify.actions"
private let snoozeKey = "tau.local-notify.snooze-minutes"

/// 「稍后提醒」间隔（分钟），由前端随排期写入；通知按钮在 App 未运行时也要用到
private func snoozeMinutes() -> Int {
  let value = UserDefaults.standard.integer(forKey: snoozeKey)
  return value > 0 ? value : 10
}

/// 系统通知只认我们自己排的请求（identifier 前缀），不碰其他来源的通知。
/// 通知动作一律先入队再提醒前端来取：冷启动时前端尚未监听，直接派发会丢。
class LocalNotifyPlugin: Plugin, UNUserNotificationCenterDelegate {
  private let center = UNUserNotificationCenter.current()
  private var foregroundBanner = false

  override init() {
    super.init()
    // 插件在应用启动阶段注册：此时设代理才能收到冷启动时的通知点击
    center.delegate = self
    registerCategories()
  }

  /// 按钮标题含稍后间隔，间隔变化后重新登记
  private func registerCategories() {
    let snooze = UNNotificationAction(
      identifier: "snooze", title: "\(snoozeMinutes()) 分钟后", options: [])
    center.setNotificationCategories([
      UNNotificationCategory(
        identifier: "tau.complete",
        actions: [UNNotificationAction(identifier: "done", title: "完成", options: [.foreground]), snooze],
        intentIdentifiers: [], options: []),
      UNNotificationCategory(
        identifier: "tau.ack",
        actions: [UNNotificationAction(identifier: "ack", title: "知道了", options: []), snooze],
        intentIdentifiers: [], options: []),
    ])
  }

  // MARK: 动作队列

  private func queue(_ payload: [String: Any]) {
    var list = UserDefaults.standard.array(forKey: actionsKey) as? [[String: Any]] ?? []
    list.append(payload)
    UserDefaults.standard.set(list, forKey: actionsKey)
    DispatchQueue.main.async { self.trigger("action", data: [:]) }
  }

  @objc public func takeActions(_ invoke: Invoke) {
    let list = UserDefaults.standard.array(forKey: actionsKey) as? [[String: Any]] ?? []
    UserDefaults.standard.removeObject(forKey: actionsKey)
    invoke.resolve(["actions": list])
  }

  // MARK: 代理

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    guard notification.request.identifier.hasPrefix(idPrefix),
      let entry = ReminderEntry.from(notification.request.content.userInfo["entry"])
    else {
      completionHandler([])
      return
    }
    // 前端开启应用内横幅时交给前端展示，避免与系统横幅重复
    if foregroundBanner {
      var data: JSObject = [:]
      for (key, value) in entry.json {
        if let value = value as? JSValue { data[key] = value }
      }
      trigger("delivered", data: data)
      completionHandler([])
      return
    }
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound])
    } else {
      completionHandler([.alert, .sound])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    defer { completionHandler() }
    let request = response.notification.request
    guard request.identifier.hasPrefix(idPrefix),
      let entry = ReminderEntry.from(request.content.userInfo["entry"])
    else { return }
    switch response.actionIdentifier {
    case UNNotificationDefaultActionIdentifier:
      queue(["action": "tap", "key": entry.key, "owner": entry.owner])
    case "done":
      queue(["action": "done", "key": entry.key, "owner": entry.owner])
    case "snooze":
      snooze(entry)
    default:
      break
    }
  }

  // MARK: 排期

  private func content(_ entry: ReminderEntry) -> UNMutableNotificationContent {
    let content = UNMutableNotificationContent()
    content.title = entry.title
    content.body = entry.body
    content.sound = .default
    switch entry.actionSet {
    case "complete": content.categoryIdentifier = "tau.complete"
    case "ack": content.categoryIdentifier = "tau.ack"
    default: break
    }
    content.threadIdentifier = entry.owner
    content.userInfo = ["entry": entry.json]
    if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
    return content
  }

  private func add(_ entry: ReminderEntry, trigger: UNNotificationTrigger) {
    center.add(
      UNNotificationRequest(identifier: idPrefix + entry.key, content: content(entry), trigger: trigger))
  }

  private func calendarTrigger(_ at: Int64) -> UNNotificationTrigger {
    let date = Date(timeIntervalSince1970: TimeInterval(at) / 1000)
    let components = Calendar.current.dateComponents(
      [.year, .month, .day, .hour, .minute, .second], from: date)
    return UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
  }

  private func snooze(_ entry: ReminderEntry) {
    let seconds = TimeInterval(snoozeMinutes() * 60)
    let next = ReminderEntry(
      key: entry.owner + ":snooze", owner: entry.owner, kind: entry.kind, ownerId: entry.ownerId,
      title: entry.title, body: entry.detail.isEmpty ? "稍后提醒" : "稍后提醒 · \(entry.detail)",
      detail: entry.detail, actions: entry.actionSet,
      at: Int64((Date().timeIntervalSince1970 + seconds) * 1000))
    add(next, trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false))
  }

  /// 整体替换排期；「稍后提醒」只在归属仍在 owners 里时保留（系统上限 64 条，前端已截断）
  @objc public func schedule(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ScheduleArgs.self)
    if let minutes = args.snoozeMinutes, minutes > 0, minutes != snoozeMinutes() {
      UserDefaults.standard.set(min(minutes, 120), forKey: snoozeKey)
      registerCategories()
    }
    let active = Set(args.owners)
    center.getPendingNotificationRequests { requests in
      var stale: [String] = []
      for request in requests where request.identifier.hasPrefix(idPrefix) {
        let isSnooze = request.identifier.hasSuffix(":snooze")
        let owner = ReminderEntry.from(request.content.userInfo["entry"])?.owner ?? ""
        if !(isSnooze && active.contains(owner)) { stale.append(request.identifier) }
      }
      self.center.removePendingNotificationRequests(withIdentifiers: stale)
      let now = Int64(Date().timeIntervalSince1970 * 1000)
      for entry in args.items where entry.at > now {
        self.add(entry, trigger: self.calendarTrigger(entry.at))
      }
      self.resolveState(invoke)
    }
  }

  @objc public func snooze(_ invoke: Invoke) throws {
    snooze(try invoke.parseArgs(SnoozeArgs.self).item)
    invoke.resolve()
  }

  /// 事项已完成：撤销它的待响提醒与已送达的通知
  @objc public func cancelOwner(_ invoke: Invoke) throws {
    let owner = try invoke.parseArgs(OwnerArgs.self).owner
    let matches: (UNNotificationRequest) -> Bool = {
      $0.identifier.hasPrefix(idPrefix) && ReminderEntry.from($0.content.userInfo["entry"])?.owner == owner
    }
    center.getPendingNotificationRequests { requests in
      self.center.removePendingNotificationRequests(
        withIdentifiers: requests.filter(matches).map(\.identifier))
      self.center.getDeliveredNotifications { delivered in
        self.center.removeDeliveredNotifications(
          withIdentifiers: delivered.map(\.request).filter(matches).map(\.identifier))
        invoke.resolve()
      }
    }
  }

  @objc public func setForegroundBanner(_ invoke: Invoke) throws {
    foregroundBanner = try invoke.parseArgs(BannerArgs.self).enabled
    invoke.resolve()
  }

  // MARK: 权限

  private func resolveState(_ invoke: Invoke) {
    center.getNotificationSettings { settings in
      self.center.getPendingNotificationRequests { requests in
        let state: String
        switch settings.authorizationStatus {
        case .notDetermined: state = "prompt"
        case .denied: state = "denied"
        default: state = "granted"
        }
        invoke.resolve([
          "notifications": state, "exactAlarm": "granted",
          "pending": requests.filter { $0.identifier.hasPrefix(idPrefix) }.count,
        ])
      }
    }
  }

  @objc public func permissionState(_ invoke: Invoke) {
    resolveState(invoke)
  }

  @objc public func requestPermission(_ invoke: Invoke) {
    center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
      self.resolveState(invoke)
    }
  }

  @objc public func openSettings(_ invoke: Invoke) {
    DispatchQueue.main.async {
      let target: String
      if #available(iOS 16.0, *) {
        target = UIApplication.openNotificationSettingsURLString
      } else {
        target = UIApplication.openSettingsURLString
      }
      guard let url = URL(string: target) else {
        invoke.reject("无法打开系统设置")
        return
      }
      UIApplication.shared.open(url)
      invoke.resolve()
    }
  }
}

@_cdecl("init_plugin_local_notify")
func initPlugin() -> Plugin {
  LocalNotifyPlugin()
}
