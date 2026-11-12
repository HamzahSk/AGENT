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
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

/** Optional full Android client -> actual Node API -> PostgreSQL contract check. */
@RunWith(AndroidJUnit4::class)
class LiveServerTest {
    @Test fun twoDevicesExchangeVocabularyReadingReviewsAndDeletionsThroughTheActualBackend() = runBlocking {
        val origin = System.getProperty("rolang.integration.url")
        assumeTrue("Supply -ProlangIntegrationUrl for the dedicated local test server", origin != null)
        val context = ApplicationProvider.getApplicationContext<Context>()
        val config = ServerConfig(serverBaseUrl = origin!!, onlineEnabled = true)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val databases = (1..2).map { Room.inMemoryDatabaseBuilder(context, LearningDatabase::class.java).build() }
        val files = (1..2).map { File(context.cacheDir, "live-${UUID.randomUUID()}.preferences_pb") }
        fun sessions() = object : Sessions {
            var value: AccountSession? = null
            override fun read() = value
            override fun save(session: AccountSession) { value = session }
            override fun clear() { value = null }
        }
        val engines = databases.mapIndexed { i, db -> SyncEngine(context, db,
            PreferencesRepository(PreferenceDataStoreFactory.create(scope = scope) { files[i] }), sessions()) { config } }
        try {
            databases.forEach { LearningRepository(it).initialize(context) }
            val email = "android.${UUID.randomUUID()}@example.test"
            engines[0].signIn(email, "test-fixture-password", "Android contract test")
            engines[1].signIn(email, "test-fixture-password")
            val repository = LearningRepository(databases[0])
            val story = Corpus.story(repository.dao.stories().first().first())
            val token = Words.tokens(story.sentence(0, Language.ENGLISH)).first().text
            repository.save(story, repository.lookup(story, 0, token, Language.ENGLISH, Language.TAGALOG),
                Language.ENGLISH, Language.TAGALOG, System.currentTimeMillis())
            val word = repository.dao.allVocabulary().single()
            repository.reading(story, Language.ENGLISH, 1, true)
            assertTrue(repository.review(word, Rating.GOOD, true, System.currentTimeMillis() + 1))
            assertTrue(engines[0].synchronize())
            assertTrue(engines[1].synchronize())
            val secondWord = databases[1].dao().allVocabulary().single()
            assertEquals(word.word, secondWord.word)
            assertEquals(1, secondWord.repetitions)
            assertTrue(databases[1].dao().allReadings().single().completed)
            assertEquals(1, databases[1].dao().allReviews().size)
            assertTrue(databases[0].dao().pending().isEmpty())
            repository.delete(word.id)
            engines[0].synchronize(); engines[1].synchronize()
            assertTrue(databases[1].dao().allVocabulary().isEmpty())
            assertEquals(1, databases[1].dao().allReviews().size)
            engines.forEach { it.signOut() }
        } finally {
            databases.forEach { it.close() }
            scope.coroutineContext.job.cancelAndJoin()
            files.forEach { it.delete() }
        }
    }
}
