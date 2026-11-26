import CryptoKit
import Foundation

struct ReminderUi: Codable {
  let locale: String
  let snoozeMinutes: Int
  let kindLabel: String
  let completeLabel: String
  let ackLabel: String
  let snoozeLabel: String
  let snoozedBody: String

  enum CodingKeys: String, CodingKey {
    case locale, snoozeMinutes, kindLabel, completeLabel, ackLabel, snoozeLabel, snoozedBody
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    locale = try values.decode(String.self, forKey: .locale)
    snoozeMinutes = try values.decode(Int.self, forKey: .snoozeMinutes)
    kindLabel = try values.decode(String.self, forKey: .kindLabel)
    completeLabel = try values.decode(String.self, forKey: .completeLabel)
    ackLabel = try values.decode(String.self, forKey: .ackLabel)
    snoozeLabel = try values.decode(String.self, forKey: .snoozeLabel)
    snoozedBody = try values.decode(String.self, forKey: .snoozedBody)
    guard ["zh-CN", "zh-TW", "en-US"].contains(locale), (1...120).contains(snoozeMinutes),
      [kindLabel, completeLabel, ackLabel, snoozeLabel, snoozedBody].allSatisfy({
        !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      })
    else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: decoder.codingPath, debugDescription: "Invalid reminder display snapshot")
      )
    }
  }

  var category: ReminderCategorySnapshot {
    ReminderCategorySnapshot(
      locale: locale, snoozeMinutes: snoozeMinutes,
      completeLabel: completeLabel, ackLabel: ackLabel, snoozeLabel: snoozeLabel)
  }

  var json: [String: Any] {
    [
      "locale": locale, "snoozeMinutes": snoozeMinutes, "kindLabel": kindLabel,
      "completeLabel": completeLabel, "ackLabel": ackLabel, "snoozeLabel": snoozeLabel,
      "snoozedBody": snoozedBody,
    ]
  }
}

struct ReminderCategorySnapshot: Codable, Hashable {
  let locale: String
  let snoozeMinutes: Int
  let completeLabel: String
  let ackLabel: String
  let snoozeLabel: String

  func identifier(for actionSet: String) -> String? {
    guard actionSet == "complete" || actionSet == "ack",
      let data = try? JSONEncoder().encode([
        actionSet, locale, String(snoozeMinutes), completeLabel, ackLabel, snoozeLabel,
      ])
    else { return nil }
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    return "tau.\(actionSet).\(locale).\(snoozeMinutes).\(digest)"
  }

  static func merging(_ existing: [Self], entries: [ReminderEntry]) -> [Self] {
    var seen = Set<Self>()
    return (existing + entries.compactMap { $0.ui?.category }).filter { seen.insert($0).inserted }
  }
}

/// 显示快照无效时只忽略 ui，旧提醒的业务载荷仍须可读。
struct ReminderEntry: Codable {
  let key: String
  let owner: String
  let kind: String
  let ownerId: Int64
  let title: String
  let body: String
  let detail: String
  let actions: String?
  let at: Int64
  let ui: ReminderUi?

  enum CodingKeys: String, CodingKey {
    case key, owner, kind, ownerId, title, body, detail, actions, at, ui
  }

  init(
    key: String, owner: String, kind: String, ownerId: Int64, title: String, body: String,
    detail: String, actions: String?, at: Int64, ui: ReminderUi? = nil
  ) {
    self.key = key
    self.owner = owner
    self.kind = kind
    self.ownerId = ownerId
    self.title = title
    self.body = body
    self.detail = detail
    self.actions = actions
    self.at = at
    self.ui = ui
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    key = try values.decode(String.self, forKey: .key)
    owner = try values.decode(String.self, forKey: .owner)
    kind = try values.decode(String.self, forKey: .kind)
    ownerId = try values.decode(Int64.self, forKey: .ownerId)
    title = try values.decode(String.self, forKey: .title)
    body = try values.decode(String.self, forKey: .body)
    detail = try values.decode(String.self, forKey: .detail)
    actions = try values.decodeIfPresent(String.self, forKey: .actions)
    at = try values.decode(Int64.self, forKey: .at)
    ui = try? values.decode(ReminderUi.self, forKey: .ui)
  }

  var actionSet: String { actions ?? (kind == "todo" ? "complete" : "ack") }

  var categoryIdentifier: String {
    guard actionSet == "complete" || actionSet == "ack" else { return "" }
    return ui?.category.identifier(for: actionSet) ?? "tau.\(actionSet)"
  }

  var json: [String: Any] {
    var value: [String: Any] = [
      "key": key, "owner": owner, "kind": kind, "ownerId": ownerId,
      "title": title, "body": body, "detail": detail, "actions": actionSet, "at": at,
    ]
    if let ui { value["ui"] = ui.json }
    return value
  }

  static func from(_ value: Any?) -> ReminderEntry? {
    guard let value, JSONSerialization.isValidJSONObject(value),
      let data = try? JSONSerialization.data(withJSONObject: value)
    else { return nil }
    return try? JSONDecoder().decode(Self.self, from: data)
  }
}
