package com.rolang.app

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rolang.app.data.*
import com.rolang.app.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import java.io.File

/** Runs on both a device and Robolectric with the same repository assertions. */
@RunWith(AndroidJUnit4::class)
class OfflineLearningTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private lateinit var database: LearningDatabase
    private lateinit var repository: LearningRepository
    private val dbName = "offline-test.db"

    @Before fun setup() {
        context.deleteDatabase(dbName)
        reopen()
    }
    private fun reopen() {
        database = Room.databaseBuilder(context, LearningDatabase::class.java, dbName).build()
        repository = LearningRepository(database)
    }
    @After fun close() { database.close(); context.deleteDatabase(dbName) }

    @Test fun corpusCoversEveryWordAtEveryLevelAndLanguage() = runBlocking {
        repository.initialize(context)
        repository.initialize(context)
        val stories = repository.dao.stories().first().map(Corpus::story)
        assertEquals(9, stories.size)
        stories.groupBy { it.family }.values.forEach { assertEquals(Level.entries.toSet(), it.map { s -> s.level }.toSet()) }
        for (story in stories) for (target in Language.entries) for (native in Language.entries) {
            for (index in story.sentences.indices) for (token in Words.tokens(story.sentence(index, target))) {
                val detail = repository.lookup(story, index, token.text, target, native)
                assertTrue(detail.translation.isNotBlank())
                assertTrue(detail.meaning.isNotBlank())
                assertTrue(detail.explanation.isNotBlank())
                assertEquals(story.sentence(index, native), detail.exampleTranslation)
            }
        }
    }

    @Test fun vocabularyReadingAndReviewSurviveReopeningAndCannotBeDoubleSubmitted() = runBlocking {
        repository.initialize(context)
        val story = Corpus.story(repository.dao.stories().first().first())
        val target = Language.ENGLISH
        val native = Language.INDONESIAN
        val token = Words.tokens(story.sentence(0, target)).first().text
        val detail = repository.lookup(story, 0, token, target, native)
        val now = System.currentTimeMillis()
        assertTrue(repository.save(story, detail, target, native, now))
        assertFalse(repository.save(story, detail, target, native, now))
        val tagalogDetail = repository.lookup(story, 0, token, target, Language.TAGALOG)
        assertTrue(repository.save(story, tagalogDetail, target, Language.TAGALOG, now))
        repository.reading(story, target, 2, true)
        repository.reading(story, target, 1, false)
        val original = repository.dao.vocabulary().first().first { it.reference == native.code }
        assertTrue(repository.review(original, Rating.GOOD, true, now + 1))
        assertFalse(repository.review(original, Rating.EASY, true, now + 2))
        database.close()
        reopen()
        val saved = repository.dao.vocabularyById(original.id)!!
        assertEquals(1, saved.repetitions)
        assertEquals(now + 1 + SpacedRepetition.DAY, saved.dueAt)
        assertEquals(detail.example, saved.example)
        assertEquals(1, repository.dao.reviews().first().size)
        assertEquals(2, repository.dao.vocabulary().first().size)
        assertTrue(repository.dao.readings().first().single().completed)
        assertEquals(1, repository.dao.readings().first().single().sentence)
        repository.mastery(saved.id, true, now + 3)
        assertFalse(repository.review(repository.dao.vocabularyById(saved.id)!!, Rating.GOOD, true, now + 4))
        repository.mastery(saved.id, false, now + 5)
        val relearn = repository.dao.vocabularyById(saved.id)!!
        assertTrue(repository.review(relearn, Rating.EASY, false, now + 6))
        assertEquals(0, repository.dao.vocabularyById(saved.id)!!.repetitions)
        assertEquals(now + 6 + 600_000, repository.dao.vocabularyById(saved.id)!!.dueAt)
        assertEquals("AGAIN", repository.dao.reviews().first().first().rating)
    }

    @Test fun preferenceChoicesPersistIndependently() = runBlocking {
        val file = File(context.cacheDir, "preferences-test.preferences_pb")
        file.delete()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = scope) { file }
        val preferences = PreferencesRepository(store)
        preferences.target(Language.TAGALOG)
        preferences.native(Language.ENGLISH)
        preferences.level(Level.ADVANCED)
        preferences.font(26f)
        preferences.dark(true)
        scope.coroutineContext.job.cancelAndJoin()
        val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val restored = PreferencesRepository(PreferenceDataStoreFactory.create(scope = secondScope) { file }).preferences.first()
            assertEquals(Language.TAGALOG, restored.target)
            assertEquals(Language.ENGLISH, restored.native)
            assertEquals(Level.ADVANCED, restored.level)
            assertEquals(26f, restored.fontSize)
            assertTrue(restored.dark)
        } finally { secondScope.coroutineContext.job.cancelAndJoin(); file.delete() }
    }

    @Test fun fourStatusesPersistProgressAndRejectReviewsAfterManualEdits() = runBlocking {
        repository.initialize(context)
        val story = Corpus.story(repository.dao.stories().first().first())
        val detail = repository.lookup(story, 0, Words.tokens(story.sentence(0, Language.ENGLISH)).first().text,
            Language.ENGLISH, Language.INDONESIAN)
        repository.status(story, detail, Language.ENGLISH, Language.INDONESIAN, VocabularyStatus.NEW, 1000)
        var word = repository.dao.allVocabulary().single()
        assertEquals(VocabularyStatus.NEW, word.learningStatus())
        val expected = listOf(VocabularyStatus.LEARNING, VocabularyStatus.LEARNING,
            VocabularyStatus.ALMOST_MASTERED, VocabularyStatus.ALMOST_MASTERED, VocabularyStatus.KNOWN)
        for (status in expected) {
            assertTrue(repository.review(word, Rating.GOOD, true, word.dueAt))
            word = repository.dao.vocabularyById(word.id)!!
            assertEquals(status, word.learningStatus())
        }
        assertTrue(word.mastered)
        assertFalse(repository.review(word, Rating.GOOD, true, word.dueAt))
        repository.status(word.id, VocabularyStatus.ALMOST_MASTERED, word.dueAt)
        val beforeManualEdit = repository.dao.vocabularyById(word.id)!!
        repository.status(word.id, VocabularyStatus.LEARNING, word.dueAt)
        assertFalse(repository.review(beforeManualEdit, Rating.GOOD, true, word.dueAt))
        word = repository.dao.vocabularyById(word.id)!!
        repository.status(word.id, VocabularyStatus.ALMOST_MASTERED, word.dueAt)
        word = repository.dao.vocabularyById(word.id)!!
        assertTrue(repository.review(word, Rating.GOOD, true, word.dueAt))
        word = repository.dao.vocabularyById(word.id)!!
        assertEquals(VocabularyStatus.ALMOST_MASTERED, word.learningStatus())
        val failedAt = word.dueAt
        assertTrue(repository.review(word, Rating.EASY, false, failedAt))
        word = repository.dao.vocabularyById(word.id)!!
        assertEquals(VocabularyStatus.LEARNING, word.learningStatus())
        assertEquals(failedAt + 600_000, word.dueAt)
        assertEquals(1, word.lapses)
        assertEquals(7, repository.dao.allReviews().size)
        val pending = repository.dao.pendingFor("vocabulary", SyncCodec.key(word))!!
        assertEquals(word.status, org.json.JSONObject(pending.data!!).getString("status"))
        database.close()
        reopen()
        assertEquals(word, repository.dao.vocabularyById(word.id))
        assertEquals(pending, repository.dao.pendingFor("vocabulary", SyncCodec.key(word)))
    }
}
