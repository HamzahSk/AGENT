package com.rolang.app.network

import android.content.Context
import androidx.room.withTransaction
import com.rolang.app.data.*
import com.rolang.app.domain.Language
import com.rolang.app.domain.Level
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

class AccountMismatch : IOException("This local library belongs to another account.")

class SyncEngine(
    private val context: Context, private val database: LearningDatabase,
    private val preferences: PreferencesRepository, private val sessions: Sessions,
    private val configuration: () -> ServerConfig = { ServerConfig.load(context) },
) {
    private val mutex = Mutex()
    private val dao = database.dao()
    suspend fun signIn(email: String, password: String, name: String? = null): AccountSession = mutex.withLock {
        withContext(Dispatchers.IO) {
            val config = configuration()
            check(config.onlineEnabled) { "Online features are disabled." }
            val body = JSONObject().put("email", email.trim()).put("password", password)
            if (name != null) body.put("displayName", name.trim())
            val response = ApiClient(config).request(if (name == null) "auth/login" else "auth/register", "POST", body)
            val user = response.getJSONObject("user")
            val session = AccountSession(user.getString("id"), user.getString("displayName"),
                response.getString("token"), response.getString("expiresAt"))
            val state = dao.syncState() ?: SyncState()
            if (state.owner != null && state.owner != session.userId) {
                runCatching { ApiClient(config).request("auth/logout", "POST", token = session.token) }
                throw AccountMismatch()
            }
            dao.saveSyncState(state.copy(owner = session.userId))
            sessions.save(session)
            session
        }
    }
    suspend fun signOut() = mutex.withLock {
        val previous = sessions.read()
        withContext(Dispatchers.IO) { sessions.clear() }
        if (previous != null) runCatching {
            ApiClient(configuration()).request("auth/logout", "POST", token = previous.token)
        }
    }

    suspend fun synchronize(includeLearning: Boolean = true): Boolean = mutex.withLock {
        withContext(Dispatchers.IO) {
            val config = configuration()
            if (!config.onlineEnabled) return@withContext true
            val api = ApiClient(config)
            // Public stories are available without registration.
            refreshStories(api, config)
            if (!includeLearning) return@withContext true
            val session = sessions.read() ?: return@withContext true
            val state = dao.syncState() ?: SyncState()
            if (state.owner != session.userId) throw AccountMismatch()
            bootstrap(state)
            try {
                // Bound each worker run; durable queue/cursor continue on retry.
                repeat(20) {
                    val current = checkNotNull(dao.syncState())
                    val batch = dao.pending()
                    val operations = JSONArray()
                    batch.forEach { change -> operations.put(JSONObject().put("id", change.operationId)
                        .put("kind", change.kind).put("key", change.key).put("deleted", change.deleted)
                        .put("data", change.data?.let(::JSONObject) ?: JSONObject.NULL)) }
                    val response = api.request("me/sync", "POST", JSONObject().put("cursor", current.cursor)
                        .put("operations", operations), session.token)
                    applyResponse(response, batch)
                    if (!response.getBoolean("hasMore") && dao.pending().isEmpty()) return@withContext true
                }
                false
            } catch (error: ApiException) {
                if (error.status == 401) sessions.clear()
                if (error.code == "CURSOR_INVALID") dao.saveSyncState(checkNotNull(dao.syncState()).copy(cursor = 0))
                throw error
            }
        }
    }

    private suspend fun bootstrap(state: SyncState) {
        if (state.bootstrapped) return
        val prefs = preferences.preferences.first()
        database.withTransaction {
            suspend fun queue(change: PendingChange) {
                if (dao.pendingFor(change.kind, change.key) == null) dao.enqueue(change)
            }
            val words = dao.allVocabulary()
            words.forEach { queue(SyncCodec.vocabulary(it)) }
            dao.allReadings().forEach { queue(SyncCodec.progress(it)) }
            dao.allReviews().forEach { review ->
                val word = words.firstOrNull { it.id == review.vocabularyId }
                // Removed words retain their review statistics even on a second device.
                queue(SyncCodec.review(review, review.vocabularyKey.ifEmpty { word?.let(SyncCodec::key) ?: "removed:${review.syncKey}" }))
            }
            // A fresh install should download server preferences before uploading
            // defaults. Explicit local edits already have a queued profile record.
            if (prefs != LearningPreferences()) queue(SyncCodec.preferences(prefs))
            dao.saveSyncState(state.copy(bootstrapped = true))
        }
    }

    internal suspend fun applyResponse(response: JSONObject, batch: List<PendingChange>) {
        val acknowledged = response.getJSONArray("acknowledged")
        val allowed = batch.map { it.operationId }.toSet()
        val records = response.getJSONArray("records")
        database.withTransaction {
            for (index in 0 until acknowledged.length()) {
                val id = acknowledged.getString(index)
                require(id in allowed)
                // If the user edited this record while uploading, its newer ID
                // remains queued and its local data wins until it is uploaded.
                dao.acknowledge(id)
            }
            val sorted = (0 until records.length()).map(records::getJSONObject)
                .sortedBy { if (it.getString("kind") == "vocabulary") 0 else 1 }
            for (record in sorted) {
                val kind = record.getString("kind")
                val key = record.getString("key")
                if (dao.pendingFor(kind, key) != null) continue
                val deleted = record.getBoolean("deleted")
                val data = if (deleted) null else record.getJSONObject("data")
                when (kind) {
                    "vocabulary" -> {
                        val parts = key.split(':', limit = 4)
                        require(parts.size == 4)
                        val old = dao.vocabularyByKey(parts[0], parts[1], parts[2], parts[3])
                        if (deleted) { if (old != null) dao.deleteWord(old.id) }
                        else {
                            val word = SyncCodec.word(checkNotNull(data), old?.id ?: 0)
                            require(SyncCodec.key(word) == key)
                            val localId = if (old == null) dao.saveWord(word) else { dao.updateWord(word); old.id }
                            dao.linkReviews(key, localId)
                        }
                    }
                    "progress" -> {
                        val parts = key.split(':')
                        require(parts.size == 2)
                        if (deleted) dao.deleteReading(parts[0], parts[1])
                        else {
                            val json = checkNotNull(data)
                            require("${json.getString("storyId")}:${json.getString("language")}" == key)
                            val old = dao.reading(parts[0], parts[1])
                            dao.saveReading(ReadingEntity(parts[0], parts[1], json.getInt("sentence"),
                                json.getBoolean("completed") || old?.completed == true))
                        }
                    }
                    "review" -> {
                        UUID.fromString(key)
                        if (deleted) dao.deleteReview(key) else {
                            val json = checkNotNull(data)
                            val parts = json.getString("vocabularyKey").split(':', limit = 4)
                            val word = if (parts.size == 4) dao.vocabularyByKey(parts[0], parts[1], parts[2], parts[3]) else null
                            val old = dao.reviewByKey(key)
                            dao.importReview(ReviewEntity(id = old?.id ?: 0, vocabularyId = word?.id ?: old?.vocabularyId ?: 0,
                                language = json.getString("language"), reference = json.getString("reference"),
                                reviewedAt = json.getLong("reviewedAt"), correct = json.getBoolean("correct"),
                                rating = json.getString("rating"), syncKey = key, vocabularyKey = json.getString("vocabularyKey")))
                        }
                    }
                    "profile" -> if (!deleted) {
                        val json = checkNotNull(data)
                        preferences.restore(LearningPreferences(Language.from(json.getString("target")),
                            Language.from(json.getString("native")), Level.valueOf(json.getString("level")),
                            json.getDouble("fontSize").toFloat(), json.getBoolean("dark")))
                    }
                    else -> throw IOException("Unsupported learning record.")
                }
            }
            val state = checkNotNull(dao.syncState())
            val cursor = response.getLong("cursor")
            require(cursor >= state.cursor)
            dao.saveSyncState(state.copy(cursor = cursor))
        }
    }

    private suspend fun refreshStories(api: ApiClient, config: ServerConfig) {
        val existing = dao.allStories().associateBy { it.id }
        val visible = mutableSetOf<String>()
        var after: String? = null
        do {
            val query = mutableMapOf("limit" to config.storyPageSize.toString())
            after?.let { query["after"] = it }
            val response = api.request("stories", query = query)
            val items = response.getJSONArray("stories")
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val id = item.getString("id")
                require(id.matches(Regex("[a-zA-Z0-9_-]{1,80}")))
                val old = existing[id]
                val unchanged = old != null && JSONObject(old.content).optString("updatedAt") == item.getString("updatedAt")
                if (!unchanged) {
                    val detail = api.request("stories/$id")
                    val root = JSONObject().put("stories", JSONArray().put(detail)).put("lexicon", detail.getJSONArray("vocabulary"))
                    // Reject incomplete remote content before it can affect the offline reader.
                    val (stories, words) = Corpus.parse(root)
                    database.withTransaction {
                        dao.cacheStoryLexicon(words.map { StoryLexemeEntity(id, it.language, it.word, it.content) })
                        dao.seedStories(stories.map { it.copy(remote = old?.remote ?: true) })
                    }
                } else if (!old!!.available) dao.seedStories(listOf(old.copy(available = true)))
                visible.add(id)
            }
            val next = if (response.isNull("next")) null else response.getString("next")
            require(next == null || after == null || next > after!!)
            after = next
        } while (after != null)
        // Only hide removed remote stories after a complete successful catalog
        // fetch. Offline failures retain every previously cached story and word.
        database.withTransaction {
            dao.seedStories(dao.allStories().filter { it.remote && it.id !in visible }.map { it.copy(available = false) })
        }
    }
}
