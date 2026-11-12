package com.rolang.app.data

import androidx.room.*
import com.rolang.app.domain.Schedule
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "stories")
data class StoryEntity(
    @PrimaryKey val id: String,
    val family: String,
    val category: String,
    val level: String,
    val content: String,
)

@Entity(tableName = "lexicon", primaryKeys = ["language", "word"])
data class LexemeEntity(val language: String, val word: String, val content: String)

@Entity(tableName = "vocabulary", indices = [Index(value = ["language", "reference", "word", "storyId"], unique = true)])
data class VocabularyEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val language: String,
    val reference: String,
    val word: String,
    val translation: String,
    val meaning: String,
    val partOfSpeech: String,
    val explanation: String,
    val example: String,
    val exampleTranslation: String,
    val storyId: String,
    val storyTitle: String,
    val category: String,
    val createdAt: Long,
    val dueAt: Long,
    val repetitions: Int = 0,
    val intervalDays: Int = 0,
    val ease: Double = 2.5,
    val lapses: Int = 0,
    val mastered: Boolean = false,
    val lastReviewedAt: Long = 0,
) {
    fun schedule() = Schedule(repetitions, intervalDays, ease, dueAt, lapses, mastered)
    fun scheduled(schedule: Schedule, now: Long) = copy(
        dueAt = schedule.dueAt, repetitions = schedule.repetitions, intervalDays = schedule.intervalDays,
        ease = schedule.ease, lapses = schedule.lapses, mastered = schedule.mastered, lastReviewedAt = now,
    )
}

@Entity(tableName = "reading", primaryKeys = ["storyId", "language"])
data class ReadingEntity(val storyId: String, val language: String, val sentence: Int = 0, val completed: Boolean = false)

@Entity(tableName = "reviews")
data class ReviewEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val vocabularyId: Long,
    val language: String,
    val reference: String,
    val reviewedAt: Long,
    val correct: Boolean,
    val rating: String,
)

@Dao
interface LearningDao {
    @Query("SELECT * FROM stories ORDER BY family, level")
    fun stories(): Flow<List<StoryEntity>>
    @Query("SELECT COUNT(*) FROM stories")
    suspend fun storyCount(): Int
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun seedStories(stories: List<StoryEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun seedLexicon(words: List<LexemeEntity>)
    @Query("SELECT * FROM lexicon WHERE language = :language AND word = :word")
    suspend fun lexeme(language: String, word: String): LexemeEntity?
    @Query("SELECT * FROM lexicon WHERE language = :language")
    suspend fun lexemes(language: String): List<LexemeEntity>
    @Query("SELECT * FROM vocabulary ORDER BY createdAt DESC")
    fun vocabulary(): Flow<List<VocabularyEntity>>
    @Query("SELECT * FROM vocabulary WHERE id = :id")
    suspend fun vocabularyById(id: Long): VocabularyEntity?
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun saveWord(word: VocabularyEntity): Long
    @Update
    suspend fun updateWord(word: VocabularyEntity)
    @Query("DELETE FROM vocabulary WHERE id = :id")
    suspend fun deleteWord(id: Long)
    @Query("SELECT * FROM reading")
    fun readings(): Flow<List<ReadingEntity>>
    @Query("SELECT * FROM reading WHERE storyId = :storyId AND language = :language")
    suspend fun reading(storyId: String, language: String): ReadingEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveReading(reading: ReadingEntity)
    @Query("SELECT * FROM reviews ORDER BY reviewedAt DESC")
    fun reviews(): Flow<List<ReviewEntity>>
    @Insert
    suspend fun logReview(review: ReviewEntity)
}

@Database(entities = [StoryEntity::class, LexemeEntity::class, VocabularyEntity::class,
    ReadingEntity::class, ReviewEntity::class], version = 1, exportSchema = true)
abstract class LearningDatabase : RoomDatabase() {
    abstract fun dao(): LearningDao
}
