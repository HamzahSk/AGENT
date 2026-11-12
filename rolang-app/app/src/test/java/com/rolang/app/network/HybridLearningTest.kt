package com.rolang.app.network

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rolang.app.data.*
import com.rolang.app.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File
import java.io.IOException
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class HybridLearningTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var database: LearningDatabase
    private lateinit var repository: LearningRepository
    private lateinit var server: MockWebServer
    private lateinit var engine: SyncEngine
    private lateinit var preferences: PreferencesRepository
    private lateinit var scope: CoroutineScope
    private val account = AccountSession(UUID.randomUUID().toString(), "Test learner", "fixture-token", "2099-01-01T00:00:00Z")
    private val sessions = object : Sessions {
        var value: AccountSession? = null
        override fun read() = value
        override fun save(session: AccountSession) { value = session }
        override fun clear() { value = null }
    }
    private lateinit var preferenceFile: File
    private val databaseName = "hybrid-test.db"
    @Before fun setup() = runBlocking {
        context.deleteDatabase(databaseName)
        database = Room.databaseBuilder(context, LearningDatabase::class.java, databaseName).build()
        repository = LearningRepository(database)
        repository.initialize(context)
        server = MockWebServer().apply { start() }
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        preferenceFile = File(context.cacheDir, "hybrid-${UUID.randomUUID()}.preferences_pb")
        preferences = PreferencesRepository(PreferenceDataStoreFactory.create(scope = scope) { preferenceFile }, database)
        engine = SyncEngine(context, database, preferences, sessions) {
            ServerConfig(serverBaseUrl = server.url("/").toString(), onlineEnabled = true)
        }
        sessions.value = null
    }
    @After fun close() = runBlocking {
        server.shutdown(); database.close(); context.deleteDatabase(databaseName)
        scope.coroutineContext.job.cancelAndJoin(); preferenceFile.delete()
        Unit
    }
    private fun json(value: JSONObject) = MockResponse().setHeader("Content-Type", "application/json").setBody(value.toString())
    private fun emptyCatalog() { server.enqueue(json(JSONObject().put("stories", JSONArray()).put("next", JSONObject.NULL))) }
    private suspend fun bind() {
        sessions.value = account
        database.dao().saveSyncState(SyncState(owner = account.userId, bootstrapped = true))
    }
    private fun syncResponse(records: JSONArray = JSONArray(), cursor: Long = 1, acknowledged: List<String> = emptyList()) =
        JSONObject().put("records", records).put("cursor", cursor).put("hasMore", false).put("acknowledged", JSONArray(acknowledged))
    private fun record(change: PendingChange, revision: Long = 1) = JSONObject().put("kind", change.kind).put("key", change.key)
        .put("deleted", change.deleted).put("data", change.data?.let(::JSONObject) ?: JSONObject.NULL).put("revision", revision)

    @Test fun configurationLoadsPackagedSettingsAndRuntimeOverrideAndValidatesOrigins() {
        assertFalse(ServerConfig.load(context).onlineEnabled)
        val file = File(context.filesDir, "config.json")
        try {
            val json = JSONObject(context.assets.open("config.json").bufferedReader().use { it.readText() })
                .put("serverBaseUrl", "https://example.test").put("onlineEnabled", true)
            file.writeText(json.toString())
            assertEquals("https://example.test/api/v1/", ServerConfig.load(context).apiUrl().toString())
            assertThrows(IllegalArgumentException::class.java) { ServerConfig.parse(json.put("serverBaseUrl", "http://example.test").toString()) }
            assertThrows(IllegalArgumentException::class.java) { ServerConfig.parse(json.put("serverBaseUrl", "https://example.test/api/v1").toString()) }
        } finally { file.delete() }
    }

    @Test fun publishedStoryAndDictionaryRemainReadableAfterDatabaseReopenAndConnectionFailure() = runBlocking {
        val corpus = JSONObject(context.assets.open("corpus.json").bufferedReader().use { it.readText() })
        val detail = corpus.getJSONArray("stories").getJSONObject(0).put("id", "remote_story")
            .put("status", "published").put("difficulty", "A1").put("updatedAt", "2026-01-01T00:00:00Z")
            .put("vocabulary", corpus.getJSONArray("lexicon"))
        server.enqueue(json(JSONObject().put("stories", JSONArray().put(detail)).put("next", JSONObject.NULL)))
        server.enqueue(json(detail))
        assertTrue(engine.synchronize())
        assertEquals("/api/v1/stories?limit=30", server.takeRequest().path)
        assertEquals("/api/v1/stories/remote_story", server.takeRequest().path)
        database.close()
        database = Room.databaseBuilder(context, LearningDatabase::class.java, databaseName).build()
        repository = LearningRepository(database)
        val story = Corpus.story(database.dao().stories().first().first { it.id == "remote_story" })
        val token = Words.tokens(story.sentence(0, Language.ENGLISH)).first().text
        assertTrue(repository.lookup(story, 0, token, Language.ENGLISH, Language.TAGALOG).translation.isNotBlank())
        // An unavailable server must not alter the cached catalog or dictionary.
        server.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
        val reopenedEngine = SyncEngine(context, database, preferences, sessions) { ServerConfig(serverBaseUrl = server.url("/").toString(), onlineEnabled = true) }
        try { reopenedEngine.synchronize(); fail("Expected a server error") } catch (_: ApiException) { }
        assertTrue(database.dao().stories().first().any { it.id == "remote_story" })
        assertTrue(repository.lookup(story, 0, token, Language.ENGLISH, Language.INDONESIAN).translation.isNotBlank())
    }

    @Test fun incompleteRemoteContentCannotReplaceTheOfflineCorpus() = runBlocking {
        val corpus = JSONObject(context.assets.open("corpus.json").bufferedReader().use { it.readText() })
        val detail = corpus.getJSONArray("stories").getJSONObject(0).put("updatedAt", "2026-01-01T00:00:00Z").put("vocabulary", JSONArray())
        server.enqueue(json(JSONObject().put("stories", JSONArray().put(detail)).put("next", JSONObject.NULL)))
        server.enqueue(json(detail))
        try { engine.synchronize(); fail("Expected incomplete dictionary rejection") } catch (_: IllegalArgumentException) { }
        assertEquals(9, database.dao().storyCount())
        val story = Corpus.story(database.dao().stories().first().first())
        assertTrue(repository.lookup(story, 0, Words.tokens(story.sentence(0, Language.ENGLISH)).first().text,
            Language.ENGLISH, Language.INDONESIAN).translation.isNotBlank())
    }

    @Test fun pendingEditsAndDeletesPersistAndFailedUploadsDoNotClearTheQueue() = runBlocking {
        bind()
        val story = Corpus.story(database.dao().stories().first().first())
        val token = Words.tokens(story.sentence(0, Language.ENGLISH)).first().text
        repository.save(story, repository.lookup(story, 0, token, Language.ENGLISH, Language.INDONESIAN),
            Language.ENGLISH, Language.INDONESIAN, 1000)
        val word = database.dao().allVocabulary().single()
        repository.review(word, Rating.GOOD, true, 1001)
        repository.reading(story, Language.ENGLISH, 1, true)
        repository.delete(word.id)
        assertEquals(setOf("vocabulary", "review", "progress"), database.dao().pending().map { it.kind }.toSet())
        assertTrue(database.dao().pending().first { it.kind == "vocabulary" }.deleted)
        val ids = database.dao().pending().map { it.operationId }
        emptyCatalog()
        server.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
        try { engine.synchronize(); fail("Expected unavailable server") } catch (_: ApiException) { }
        assertEquals(ids, database.dao().pending().map { it.operationId })
        database.close()
        database = Room.databaseBuilder(context, LearningDatabase::class.java, databaseName).build()
        assertEquals(ids, database.dao().pending().map { it.operationId })
        assertTrue(database.dao().allReadings().single().completed)
        assertEquals(1, database.dao().allReviews().size)
    }

    @Test fun acknowledgedSnapshotCannotDiscardAnEditMadeDuringUploadAndRemoteTombstonesAreApplied() = runBlocking {
        bind()
        val dao = database.dao()
        val original = SyncCodec.progress(ReadingEntity("market_beginner", "en", 0))
        val newer = SyncCodec.progress(ReadingEntity("market_beginner", "en", 2, true))
        dao.saveReading(ReadingEntity("market_beginner", "en", 2, true))
        dao.enqueue(newer)
        engine.applyResponse(syncResponse(JSONArray().put(record(original)), acknowledged = listOf(original.operationId)), listOf(original))
        assertEquals(newer.operationId, dao.pendingFor("progress", newer.key)!!.operationId)
        assertEquals(2, dao.reading("market_beginner", "en")!!.sentence)
        val deleted = PendingChange("progress", newer.key, deleted = true)
        engine.applyResponse(syncResponse(JSONArray().put(record(deleted, 2)), 2, listOf(newer.operationId)), listOf(newer))
        assertNull(dao.pendingFor("progress", newer.key))
        assertNull(dao.reading("market_beginner", "en"))
        assertEquals(2L, dao.syncState()!!.cursor)
    }

    @Test fun downloadsKeepReviewKeysStableAndMapVocabularyToDeviceLocalIds() = runBlocking {
        bind()
        val story = Corpus.story(database.dao().stories().first().first())
        val detail = repository.lookup(story, 0, Words.tokens(story.sentence(0, Language.ENGLISH)).first().text, Language.ENGLISH, Language.INDONESIAN)
        val word = VocabularyEntity(language = "en", reference = "id", word = Words.key(detail.word), translation = detail.translation,
            meaning = detail.meaning, partOfSpeech = detail.partOfSpeech, explanation = detail.explanation, example = detail.example,
            exampleTranslation = detail.exampleTranslation, storyId = story.id, storyTitle = story.title(Language.ENGLISH), category = story.category,
            createdAt = 1000, dueAt = 2000)
        val review = ReviewEntity(vocabularyId = 9999, language = "en", reference = "id", reviewedAt = 1001, correct = true, rating = "GOOD")
        val records = JSONArray().put(record(SyncCodec.review(review, SyncCodec.key(word)), 2)).put(record(SyncCodec.vocabulary(word)))
        engine.applyResponse(syncResponse(JSONArray().put(record(SyncCodec.review(review, SyncCodec.key(word)))), 1), emptyList())
        assertEquals(0L, database.dao().allReviews().single().vocabularyId)
        engine.applyResponse(syncResponse(JSONArray().put(record(SyncCodec.vocabulary(word), 2)), 2), emptyList())
        engine.applyResponse(syncResponse(records, 2), emptyList())
        val saved = database.dao().allVocabulary().single()
        val savedReview = database.dao().allReviews().single()
        assertEquals(saved.id, savedReview.vocabularyId)
        assertEquals(review.syncKey, savedReview.syncKey)
        assertTrue(database.dao().pending().isEmpty())
    }

    @Test fun restoredPreferencesAndAuthenticationExpiryKeepLocalLearningData() = runBlocking {
        bind()
        val change = SyncCodec.preferences(LearningPreferences(Language.TAGALOG, Language.ENGLISH, Level.ADVANCED, 26f, true))
        engine.applyResponse(syncResponse(JSONArray().put(record(change))), emptyList())
        assertEquals(Language.TAGALOG, preferences.preferences.first().target)
        val pending = SyncCodec.progress(ReadingEntity("market_beginner", "en", 1))
        database.dao().enqueue(pending)
        emptyCatalog()
        server.enqueue(json(JSONObject().put("error", JSONObject().put("code", "UNAUTHENTICATED"))).setResponseCode(401))
        try { engine.synchronize(); fail("Expected expired authentication") } catch (_: ApiException) { }
        assertNull(sessions.read())
        assertEquals(pending.operationId, database.dao().pending().single().operationId)
        assertEquals(9, database.dao().storyCount())
    }

    @Test fun switchingAccountCannotUploadThePreviousAccountsLibrary() = runBlocking {
        bind()
        val different = UUID.randomUUID().toString()
        server.enqueue(json(JSONObject().put("token", "other-fixture-token").put("expiresAt", "2099-01-01T00:00:00Z")
            .put("user", JSONObject().put("id", different).put("displayName", "Other learner"))))
        server.enqueue(MockResponse().setResponseCode(204))
        try { engine.signIn("other@example.test", "test-fixture-password"); fail("Expected account ownership guard") }
        catch (_: AccountMismatch) { }
        assertEquals(account.userId, database.dao().syncState()!!.owner)
        assertEquals(account.userId, sessions.read()!!.userId)
    }

    @Test fun localPreferenceEditsRemainQueuedWhenServerPreferencesArrive() = runBlocking {
        bind()
        preferences.target(Language.TAGALOG)
        val pending = database.dao().pendingFor("profile", "preferences")!!
        val remote = SyncCodec.preferences(LearningPreferences(Language.ENGLISH, Language.INDONESIAN))
        engine.applyResponse(syncResponse(JSONArray().put(record(remote))), emptyList())
        assertEquals(Language.TAGALOG, preferences.preferences.first().target)
        assertEquals(pending.operationId, database.dao().pendingFor("profile", "preferences")!!.operationId)
    }
}
