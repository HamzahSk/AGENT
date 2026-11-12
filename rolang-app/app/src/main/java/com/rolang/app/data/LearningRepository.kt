package com.rolang.app.data

import android.content.Context
import androidx.room.withTransaction
import com.rolang.app.domain.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LearningRepository(private val database: LearningDatabase) {
    val dao = database.dao()
    suspend fun initialize(context: Context) = withContext(Dispatchers.IO) {
        database.withTransaction {
            if (dao.storyCount() == 0) {
                val (stories, words) = Corpus.load(context)
                dao.seedLexicon(words)
                dao.seedStories(stories)
            }
        }
    }
    suspend fun lookup(story: Story, sentence: Int, word: String, target: Language, native: Language): WordDetail {
        val cached = dao.storyLexeme(story.id, target.code, Words.key(word))
        val lexeme = cached?.let { LexemeEntity(it.language, it.word, it.content) }
            ?: checkNotNull(dao.lexeme(target.code, Words.key(word))) { "Translation missing from local cache" }
        return Corpus.detail(lexeme, word, native, story.sentence(sentence, target), story.sentence(sentence, native))
    }
    suspend fun save(story: Story, detail: WordDetail, target: Language, native: Language, now: Long): Boolean =
        database.withTransaction {
            val word = VocabularyEntity(language = target.code, reference = native.code,
                word = Words.key(detail.word), translation = detail.translation, meaning = detail.meaning,
                partOfSpeech = detail.partOfSpeech, explanation = detail.explanation, example = detail.example,
                exampleTranslation = detail.exampleTranslation, storyId = story.id, storyTitle = story.title(target),
                category = story.category, createdAt = now, dueAt = now)
            val saved = dao.saveWord(word) != -1L
            if (saved) dao.enqueue(SyncCodec.vocabulary(word))
            saved
        }

    /** Check the snapshot inside the transaction so a repeated submission cannot advance the schedule twice. */
    suspend fun review(snapshot: VocabularyEntity, rating: Rating, correct: Boolean, now: Long): Boolean =
        database.withTransaction {
            val current = dao.vocabularyById(snapshot.id) ?: return@withTransaction false
            if (current != snapshot ||
                current.mastered || current.dueAt > now) return@withTransaction false
            val effective = if (correct) rating else Rating.AGAIN
            val next = SpacedRepetition.next(current.schedule(), effective, now)
            val updated = current.scheduled(next, now).copy(
                status = SpacedRepetition.statusAfterReview(current.learningStatus(), next, effective).name,
                statusChangedAt = maxOf(now, current.statusChangedAt + 1))
            dao.updateWord(updated)
            dao.enqueue(SyncCodec.vocabulary(updated))
            val review = ReviewEntity(vocabularyId = current.id, language = current.language,
                reference = current.reference, reviewedAt = now, correct = correct, rating = effective.name,
                vocabularyKey = SyncCodec.key(current))
            dao.logReview(review)
            dao.enqueue(SyncCodec.review(review, SyncCodec.key(current)))
            true
        }
    suspend fun status(id: Long, status: VocabularyStatus, now: Long) = database.withTransaction {
        val current = dao.vocabularyById(id) ?: return@withTransaction
        val reset = status == VocabularyStatus.NEW || status == VocabularyStatus.LEARNING
        val updated = current.copy(status = status.name, mastered = status == VocabularyStatus.KNOWN, dueAt = now,
            repetitions = if (reset) 0 else current.repetitions,
            intervalDays = if (reset) 0 else current.intervalDays,
            statusChangedAt = maxOf(now, current.statusChangedAt + 1))
        dao.updateWord(updated)
        dao.enqueue(SyncCodec.vocabulary(updated))
    }
    suspend fun mastery(id: Long, mastered: Boolean, now: Long) =
        status(id, if (mastered) VocabularyStatus.KNOWN else VocabularyStatus.LEARNING, now)
    suspend fun status(story: Story, detail: WordDetail, target: Language, native: Language,
                       status: VocabularyStatus, now: Long) = database.withTransaction {
        save(story, detail, target, native, now)
        val current = checkNotNull(dao.vocabularyByKey(target.code, native.code, story.id, Words.key(detail.word)))
        status(current.id, status, now)
    }
    suspend fun delete(id: Long) = database.withTransaction {
        val current = dao.vocabularyById(id) ?: return@withTransaction
        dao.deleteWord(id)
        dao.enqueue(PendingChange("vocabulary", SyncCodec.key(current), deleted = true))
    }
    suspend fun reading(story: Story, language: Language, sentence: Int, completed: Boolean) = database.withTransaction {
        val previous = dao.reading(story.id, language.code)
        val reading = ReadingEntity(story.id, language.code, sentence.coerceIn(story.sentences.indices),
            completed || previous?.completed == true)
        dao.saveReading(reading)
        dao.enqueue(SyncCodec.progress(reading))
    }
}
