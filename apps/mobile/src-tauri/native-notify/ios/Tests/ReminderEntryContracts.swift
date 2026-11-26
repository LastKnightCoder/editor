import Foundation

private struct ContractFailure: Error { let message: String }
private func require(_ value: @autoclosure () -> Bool, _ message: String) throws {
  if !value() { throw ContractFailure(message: message) }
}
private func decode(_ value: [String: Any]) throws -> ReminderEntry {
  guard let entry = ReminderEntry.from(value) else {
    throw ContractFailure(message: "Entry discarded")
  }
  return entry
}

@main
struct ReminderEntryContracts {
  static func main() throws {
    let business: [String: Any] = [
      "key": "todo:42:900000", "owner": "todo:42", "kind": "todo", "ownerId": 42,
      "title": "User title stays unchanged", "body": "Original notification body",
      "detail": "Original due-time detail", "actions": "complete", "at": 1_800_000_123_456,
    ]
    let old = try decode(business)
    let oldRoundTrip = try JSONDecoder().decode(ReminderEntry.self, from: JSONEncoder().encode(old))
    try require(
      NSDictionary(dictionary: oldRoundTrip.json).isEqual(to: business),
      "Old business payload changed")
    try require(
      old.ui == nil && old.categoryIdentifier == "tau.complete", "Legacy category changed")

    var event = business
    event["key"] = "event:42:900000"
    event["owner"] = "event:42"
    event["kind"] = "event"
    event["actions"] = "ack"
    let oldEvent = try decode(event)
    try require(oldEvent.categoryIdentifier == "tau.ack", "Legacy event category changed")
    var implicitActions = business
    implicitActions.removeValue(forKey: "actions")
    let implicit = try decode(implicitActions)
    try require(implicit.actionSet == old.actionSet, "Legacy implicit todo actions changed")

    let ui: [String: Any] = [
      "locale": "en-US", "snoozeMinutes": 10, "kindLabel": "kind snapshot",
      "completeLabel": "complete snapshot", "ackLabel": "ack snapshot",
      "snoozeLabel": "snooze snapshot", "snoozedBody": "snoozed snapshot with original detail",
    ]
    var payload = business
    payload["ui"] = ui
    let entry = try decode(payload)
    let roundTrip = try JSONDecoder().decode(ReminderEntry.self, from: JSONEncoder().encode(entry))
    try require(
      NSDictionary(dictionary: roundTrip.json).isEqual(to: payload),
      "New UI snapshot failed round-trip")
    var invalid: [Any] = [NSNull(), "invalid snapshot", ["locale": "en-US"]]
    for (field, value) in [
      ("locale", "unsupported" as Any), ("snoozeMinutes", 0 as Any),
      ("snoozeMinutes", 2.5 as Any), ("completeLabel", 27 as Any), ("ackLabel", "" as Any),
    ] {
      var bad = ui
      bad[field] = value
      invalid.append(bad)
    }
    for malformed in invalid {
      var damaged = business
      damaged["ui"] = malformed
      let kept = try decode(damaged)
      try require(kept.ui == nil, "Malformed UI snapshot accepted")
      try require(
        NSDictionary(dictionary: kept.json).isEqual(to: business),
        "Malformed UI discarded business reminder")
    }

    guard let first = entry.ui?.category else { throw ContractFailure(message: "Snapshot missing") }
    try require(
      first.identifier(for: "complete") == roundTrip.ui?.category.identifier(for: "complete"),
      "Category identity is not stable")
    try require(
      first.identifier(for: "complete") != first.identifier(for: "ack"),
      "Action categories collided")
    try require(first.identifier(for: "none") == nil, "No-action entry acquired actions")
    var changedUi = ui
    changedUi["completeLabel"] = "new wording snapshot"
    var changedPayload = business
    changedPayload["ui"] = changedUi
    let wording = try decode(changedPayload)
    changedUi["locale"] = "zh-TW"
    changedPayload["ui"] = changedUi
    let language = try decode(changedPayload)
    changedUi["snoozeMinutes"] = 30
    changedPayload["ui"] = changedUi
    let interval = try decode(changedPayload)
    let snapshots = ReminderCategorySnapshot.merging(
      [first], entries: [entry, wording, language, interval])
    let ids = snapshots.compactMap { $0.identifier(for: "complete") }
    try require(
      Set(ids).count == 4, "Language, interval or revised labels replaced an old category")
    let persisted = try JSONDecoder().decode(
      [ReminderCategorySnapshot].self, from: JSONEncoder().encode(snapshots))
    try require(
      ReminderCategorySnapshot.merging(persisted, entries: [entry]) == snapshots,
      "Historical category union changed after restart")

    var anotherTask = payload
    anotherTask["key"] = "todo:99:900000"
    anotherTask["owner"] = "todo:99"
    anotherTask["ownerId"] = 99
    anotherTask["title"] = "Another user title"
    anotherTask["body"] = "Another user body"
    anotherTask["at"] = 1_900_000_000_000
    let other = try decode(anotherTask)
    try require(
      other.categoryIdentifier == entry.categoryIdentifier,
      "Business content leaked into category identity")
    if CommandLine.arguments.count > 1 {
      let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
      guard let wire = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let items = wire["items"] as? [[String: Any]], !items.isEmpty
      else { throw ContractFailure(message: "Missing genuine schedule payload") }
      for item in items {
        let native = try decode(item)
        try require(native.ui != nil, "Bridge UI snapshot was lost")
        try require(
          NSDictionary(dictionary: native.json).isEqual(to: item),
          "Bridge business/UI payload changed")
        guard let bridge = JSTypes.coerceDictionaryToJSObject(native.json as NSDictionary),
          let bridgeUi = bridge["ui"] as? JSObject
        else { throw ContractFailure(message: "Delivered event dropped nested UI snapshot") }
        let bridged = try JSONSerialization.jsonObject(
          with: JSONSerialization.data(withJSONObject: bridge))
        guard let bridgedObject = bridged as? [String: Any] else {
          throw ContractFailure(message: "Delivered bridge is not an object")
        }
        try require(
          NSDictionary(dictionary: bridgedObject).isEqual(to: item),
          "Delivered bridge business/UI payload changed")
        try require(
          bridgeUi["locale"] as? String == native.ui?.locale, "Delivered UI locale changed")
        try require(
          bridgeUi["snoozedBody"] as? String == native.ui?.snoozedBody,
          "Delivered snooze snapshot changed")
      }
      print("Genuine frontend schedule payload decoded and round-tripped: \(items.count) items")
    }
    print(
      "ReminderEntry old/new round-trip, optional UI recovery and immutable category identity contracts passed"
    )
  }
}
