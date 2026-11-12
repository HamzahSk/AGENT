package com.rolang.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.rolang.app.domain.Language
import com.rolang.app.domain.Level
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

val Context.learningPreferences by preferencesDataStore(name = "learning_preferences")
data class LearningPreferences(
    val target: Language = Language.ENGLISH,
    val native: Language = Language.INDONESIAN,
    val level: Level = Level.BEGINNER,
    val fontSize: Float = 20f,
    val dark: Boolean = false,
)

class PreferencesRepository(private val store: DataStore<Preferences>) {
    private val target = stringPreferencesKey("target")
    private val native = stringPreferencesKey("native")
    private val level = stringPreferencesKey("level")
    private val font = floatPreferencesKey("font")
    private val dark = booleanPreferencesKey("dark")
    val preferences = store.data.catch { if (it is IOException) emit(emptyPreferences()) else throw it }.map {
        LearningPreferences(Language.from(it[target] ?: "en"), Language.from(it[native] ?: "id"),
            Level.entries.firstOrNull { value -> value.name == it[level] } ?: Level.BEGINNER,
            (it[font] ?: 20f).coerceIn(16f, 28f), it[dark] ?: false)
    }
    suspend fun languages(targetLanguage: Language, nativeLanguage: Language) = store.edit {
        it[target] = targetLanguage.code; it[native] = nativeLanguage.code
    }
    suspend fun target(value: Language) = store.edit { it[target] = value.code }
    suspend fun native(value: Language) = store.edit { it[native] = value.code }
    suspend fun level(value: Level) = store.edit { it[level] = value.name }
    suspend fun font(value: Float) = store.edit { it[font] = value.coerceIn(16f, 28f) }
    suspend fun dark(value: Boolean) = store.edit { it[dark] = value }
}
