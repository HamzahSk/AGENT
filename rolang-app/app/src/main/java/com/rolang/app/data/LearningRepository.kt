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
        val lexeme = checkNotNull(dao.lexeme(target.code, Words.key(word))) { "Bundled translation missing" }
        return Corpus.detail(lexeme, word, native, story.sentence(sentence, target), story.sentence(sentence, native))
    }
    suspend fun save(story: Story, detail: WordDetail, target: Language, native: Language, now: Long): Boolean =
        dao.saveWord(VocabularyEntity(language = target.code, reference = native.code,
            word = Words.key(detail.word), translation = detail.translation, meaning = detail.meaning,
            partOfSpeech = detail.partOfSpeech, explanation = detail.explanation, example = detail.example,
            exampleTranslation = detail.exampleTranslation, storyId = story.id, storyTitle = story.title(target),
            category = story.category, createdAt = now, dueAt = now)) != -1L

    /** Check the snapshot inside the transaction so a repeated submission cannot advance the schedule twice. */
    suspend fun review(snapshot: VocabularyEntity, rating: Rating, correct: Boolean, now: Long): Boolean =
        database.withTransaction {
            val current = dao.vocabularyById(snapshot.id) ?: return@withTransaction false
            if (current.lastReviewedAt != snapshot.lastReviewedAt || current.dueAt != snapshot.dueAt ||
                current.mastered || current.dueAt > now) return@withTransaction false
            val effective = if (correct) rating else Rating.AGAIN
            dao.updateWord(current.scheduled(SpacedRepetition.next(current.schedule(), effective, now), now))
            dao.logReview(ReviewEntity(vocabularyId = current.id, language = current.language,
                reference = current.reference, reviewedAt = now, correct = correct, rating = effective.name))
            true
        }
    suspend fun mastery(id: Long, mastered: Boolean, now: Long) = database.withTransaction {
        val current = dao.vocabularyById(id) ?: return@withTransaction
        dao.updateWord(current.copy(mastered = mastered, dueAt = now,
            repetitions = if (mastered) current.repetitions else 0,
            intervalDays = if (mastered) current.intervalDays else 0))
    }
    suspend fun reading(story: Story, language: Language, sentence: Int, completed: Boolean) = database.withTransaction {
        val previous = dao.reading(story.id, language.code)
        dao.saveReading(ReadingEntity(story.id, language.code, sentence.coerceIn(story.sentences.indices),
            completed || previous?.completed == true))
    }
}
