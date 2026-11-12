package com.rolang.app.network

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class AccountSession(val userId: String, val displayName: String, val token: String, val expiresAt: String)

interface Sessions {
    fun read(): AccountSession?
    fun save(session: AccountSession)
    fun clear()
}

/** Only ciphertext is stored on disk; the encryption key stays in Android Keystore. */
class SessionStore(context: Context) : Sessions {
    private val preferences = context.getSharedPreferences("online_account", Context.MODE_PRIVATE)
    private val alias = "rolang_session_v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    override fun read(): AccountSession? {
        val encoded = preferences.getString("session", null) ?: return null
        return try {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            val json = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
            AccountSession(json.getString("userId"), json.getString("displayName"), json.getString("token"), json.getString("expiresAt"))
        } catch (_: Exception) { clear(); null }
    }
    override fun save(session: AccountSession) {
        val json = JSONObject().put("userId", session.userId).put("displayName", session.displayName)
            .put("token", session.token).put("expiresAt", session.expiresAt)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encoded = Base64.encodeToString(cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(preferences.edit().putString("session", encoded).commit()) { "Unable to persist account." }
    }
    override fun clear() { check(preferences.edit().remove("session").commit()) }
}
