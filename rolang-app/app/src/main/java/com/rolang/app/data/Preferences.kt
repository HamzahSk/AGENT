package com.rolang.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.withTransaction
import com.rolang.app.domain.Language
import com.rolang.app.domain.Level
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import java.io.IOException

val Context.learningPreferences by preferencesDataStore(name = "learning_preferences")
data class LearningPreferences(
    val target: Language = Language.ENGLISH,
    val native: Language = Language.INDONESIAN,
    val level: Level = Level.BEGINNER,
    val fontSize: Float = 20f,
    val dark: Boolean = false,
)

class PreferencesRepository(private val store: DataStore<Preferences>, private val database: LearningDatabase? = null) {
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
    private suspend fun change(update: (MutablePreferences) -> Unit) {
        if (database == null) store.edit { update(it) }
        else database.withTransaction {
            // Use the same lock order as incoming profile sync. A user edit
            // cannot be overwritten before its pending operation is visible.
            store.edit { update(it) }
            database.dao().enqueue(SyncCodec.preferences(preferences.first()))
        }
    }
    suspend fun languages(targetLanguage: Language, nativeLanguage: Language) = change {
        it[target] = targetLanguage.code; it[native] = nativeLanguage.code
    }
    suspend fun target(value: Language) = change { it[target] = value.code }
    suspend fun native(value: Language) = change { it[native] = value.code }
    suspend fun level(value: Level) = change { it[level] = value.name }
    suspend fun font(value: Float) = change { it[font] = value.coerceIn(16f, 28f) }
    suspend fun dark(value: Boolean) = change { it[dark] = value }
    suspend fun restore(value: LearningPreferences) = store.edit {
        it[target] = value.target.code; it[native] = value.native.code; it[level] = value.level.name
        it[font] = value.fontSize; it[dark] = value.dark
    }
}
