package app.tauri.local_notify

import org.json.JSONObject

data class ReminderUi(
  val locale: String,
  val snoozeMinutes: Int,
  val kindLabel: String,
  val completeLabel: String,
  val ackLabel: String,
  val snoozeLabel: String,
  val snoozedBody: String
) {
  fun toJson(): JSONObject = JSONObject()
    .put("locale", locale).put("snoozeMinutes", snoozeMinutes).put("kindLabel", kindLabel)
    .put("completeLabel", completeLabel).put("ackLabel", ackLabel).put("snoozeLabel", snoozeLabel)
    .put("snoozedBody", snoozedBody)

  companion object {
    fun fromJson(json: JSONObject?): ReminderUi? {
      if (json == null) return null
      val locale = json.opt("locale") as? String ?: return null
      val minutes = json.opt("snoozeMinutes") as? Number ?: return null
      if (locale !in setOf("zh-CN", "zh-TW", "en-US") ||
        minutes.toDouble() != minutes.toInt().toDouble() || minutes.toInt() !in 1..120) return null
      val labels = listOf("kindLabel", "completeLabel", "ackLabel", "snoozeLabel", "snoozedBody")
        .map { json.opt(it) as? String ?: return null }
      if (labels.any { it.isBlank() }) return null
      return ReminderUi(locale, minutes.toInt(), labels[0], labels[1], labels[2], labels[3], labels[4])
    }
  }
}

/** 可选显示快照无效时仍保留原提醒的身份、时间与动作。 */
data class ReminderEntry(
  val key: String,
  val owner: String,
  val kind: String,
  val ownerId: Long,
  val title: String,
  val body: String,
  val detail: String,
  val actions: String,
  val at: Long,
  val ui: ReminderUi? = null
) {
  fun toJson(): JSONObject = JSONObject()
    .put("key", key).put("owner", owner).put("kind", kind).put("ownerId", ownerId)
    .put("title", title).put("body", body).put("detail", detail).put("actions", actions)
    .put("at", at).apply { if (ui != null) put("ui", ui.toJson()) }

  companion object {
    fun fromJson(json: JSONObject) = ReminderEntry(
      json.getString("key"), json.getString("owner"), json.getString("kind"),
      json.getLong("ownerId"), json.getString("title"), json.getString("body"),
      json.optString("detail", ""),
      json.optString("actions", if (json.getString("kind") == "todo") "complete" else "ack"),
      json.getLong("at"), ReminderUi.fromJson(json.optJSONObject("ui"))
    )
  }
}

data class ReminderChannel(val name: String, val description: String) {
  fun toJson(): JSONObject = JSONObject().put("name", name).put("description", description)

  companion object {
    fun fromJson(json: JSONObject?): ReminderChannel? {
      val name = json?.opt("name") as? String ?: return null
      val description = json.opt("description") as? String ?: return null
      if (name.isBlank() || description.isBlank()) return null
      return ReminderChannel(name, description)
    }
  }
}

data class ReminderChannels(
  val todo: ReminderChannel,
  val event: ReminderChannel,
  val pomodoro: ReminderChannel
) {
  fun toJson(): JSONObject = JSONObject().put("todo", todo.toJson())
    .put("event", event.toJson()).put("pomodoro", pomodoro.toJson())

  companion object {
    fun fromJson(json: JSONObject?): ReminderChannels? {
      if (json == null) return null
      return ReminderChannels(
        ReminderChannel.fromJson(json.optJSONObject("todo")) ?: return null,
        ReminderChannel.fromJson(json.optJSONObject("event")) ?: return null,
        ReminderChannel.fromJson(json.optJSONObject("pomodoro")) ?: return null
      )
    }
  }
}
