package app.tauri.plugin_secrets

import android.app.Activity
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileNotFoundException
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@TauriPlugin
class PluginSecretsPlugin(private val activity: Activity) : Plugin(activity) {
  private fun digest(value: String) = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

  @Command
  @Synchronized
  fun access(invoke: Invoke) {
    try {
      val args = invoke.getArgs()
      val owner = digest(args.getString("namespace"))
      val directory = File(activity.noBackupFilesDir, "plugin-secrets/$owner")
      val alias = "tau.plugin-secrets.$owner"
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val operation = args.getString("operation")
      val result = JSObject()
      if (operation == "clear") {
        check(directory.deleteRecursively() || !directory.exists()) { "清除凭据失败" }
        if (store.containsAlias(alias)) store.deleteEntry(alias)
      } else {
        val key = args.getString("key")
        val file = AtomicFile(File(directory, digest(key)))
        when (operation) {
          "get" -> {
            val encrypted = try {
              file.readFully()
            } catch (missing: FileNotFoundException) {
              if (file.baseFile.exists()) throw missing
              invoke.resolve(result)
              return
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, store.getKey(alias, null),
              GCMParameterSpec(128, encrypted.copyOfRange(0, 12)))
            cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
            result.put("value", String(cipher.doFinal(encrypted, 12, encrypted.size - 12), Charsets.UTF_8))
          }
          "set" -> {
            val value = args.getString("value")
            val secret = store.getKey(alias, null) as? SecretKey ?: KeyGenerator
              .getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
                init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                  .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                  .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
              }.generateKey()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secret)
            cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
            val encrypted = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            check(directory.isDirectory || directory.mkdirs()) { "创建凭据目录失败" }
            val stream = file.startWrite()
            try {
              stream.write(encrypted)
              file.finishWrite(stream)
            } catch (error: Exception) {
              file.failWrite(stream)
              throw error
            }
          }
          "delete" -> {
            file.delete()
            check(!file.baseFile.exists()) { "删除凭据失败" }
          }
          else -> error("无效的凭据操作")
        }
      }
      invoke.resolve(result)
    } catch (error: Exception) {
      invoke.reject(error.javaClass.simpleName)
    }
  }
}
