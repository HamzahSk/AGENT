package com.rolang.app.network

import android.content.Context
import android.annotation.SuppressLint
import androidx.room.Room
import com.rolang.app.data.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

data class OnlineState(val enabled: Boolean = false, val signedIn: Boolean = false,
    val displayName: String = "", val busy: Boolean = false, val message: String = "Online features are disabled.")

class AppServices private constructor(private val context: Context) {
    val database = Room.databaseBuilder(context, LearningDatabase::class.java, "ro-lang.db")
        .addMigrations(LearningDatabase.MIGRATION_1_2).build()
    val repository = LearningRepository(database)
    val preferences = PreferencesRepository(context.learningPreferences, database)
    private val sessions = SessionStore(context)
    private val engine = SyncEngine(context, database, preferences, sessions)
    private val status = MutableStateFlow(OnlineState())
    val online = status.asStateFlow()

    suspend fun configure() = withContext(Dispatchers.IO) {
        try {
            val config = ServerConfig.load(context)
            val account = sessions.read()
            status.value = OnlineState(config.onlineEnabled, account != null, account?.displayName.orEmpty(),
                message = if (!config.onlineEnabled) "Online features are disabled."
                    else if (account == null) "Sign in to synchronize your learning data." else "Your local changes are saved and ready to sync.")
            SyncScheduler.configure(context, config)
            if (config.onlineEnabled) SyncScheduler.enqueue(context)
        } catch (_: Exception) {
            status.value = OnlineState(message = "Online configuration is unavailable. Your offline library is ready.")
        }
    }
    fun schedulePending() {
        val config = runCatching { ServerConfig.load(context) }.getOrNull() ?: return
        if (config.onlineEnabled && config.automaticSyncEnabled) SyncScheduler.enqueue(context)
    }
    suspend fun authenticate(email: String, password: String, name: String?) {
        status.update { it.copy(busy = true) }
        try {
            val account = engine.signIn(email, password, name)
            status.update { it.copy(signedIn = true, displayName = account.displayName, message = "Signed in. Synchronizing your library…") }
            synchronize()
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { failure(error) }
        finally { status.update { it.copy(busy = false) } }
    }
    suspend fun logout() {
        status.update { it.copy(busy = true) }
        try { engine.signOut() }
        catch (cancelled: CancellationException) { throw cancelled }
        finally { status.update { it.copy(signedIn = false, displayName = "", busy = false,
            message = "Signed out. Learning data remains on this device.") } }
    }
    suspend fun synchronize(includeLearning: Boolean = true): Boolean {
        status.update { it.copy(busy = true) }
        try {
            repository.initialize(context)
            val complete = engine.synchronize(includeLearning)
            status.update { it.copy(message = if (complete) "Library is up to date." else "More changes are waiting to sync.") }
            return complete
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { failure(error); throw error }
        finally { status.update { it.copy(busy = false) } }
    }
    private fun failure(error: Exception) {
        val message = when {
            error is AccountMismatch -> "This library belongs to another account. Sign in with the original account."
            error is ApiException && error.status == 401 -> "Sign in again to synchronize. Your learning data is saved locally."
            error is ApiException && error.status == 429 -> "Too many sign-in attempts. Try again later."
            error is ApiException && error.status == 400 -> "Check your account details. Use a valid email and a password of 12–128 characters."
            error is ApiException && error.code == "ALREADY_EXISTS" -> "That account already exists. Sign in to continue."
            else -> "Server unavailable. Your local library and pending changes are saved."
        }
        status.update { it.copy(signedIn = sessions.read() != null, message = message) }
    }
    companion object {
        // The instance only stores applicationContext and shares Room with workers.
        @SuppressLint("StaticFieldLeak")
        @Volatile private var instance: AppServices? = null
        fun get(context: Context): AppServices = instance ?: synchronized(this) {
            instance ?: AppServices(context.applicationContext).also { instance = it }
        }
    }
}
