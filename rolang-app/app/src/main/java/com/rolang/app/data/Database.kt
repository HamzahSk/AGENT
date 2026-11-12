package com.rolang.app.data

import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.rolang.app.domain.Schedule
import kotlinx.coroutines.flow.Flow
import java.util.UUID

@Entity(tableName = "stories")
data class StoryEntity(
    @PrimaryKey val id: String,
    val family: String,
    val category: String,
    val level: String,
    val content: String,
    @ColumnInfo(defaultValue = "0") val remote: Boolean = false,
    @ColumnInfo(defaultValue = "1") val available: Boolean = true,
)

@Entity(tableName = "lexicon", primaryKeys = ["language", "word"])
data class LexemeEntity(val language: String, val word: String, val content: String)

@Entity(tableName = "story_lexicon", primaryKeys = ["storyId", "language", "word"])
data class StoryLexemeEntity(val storyId: String, val language: String, val word: String, val content: String)

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

@Entity(tableName = "reviews", indices = [Index(value = ["syncKey"], unique = true)])
data class ReviewEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val vocabularyId: Long,
    val language: String,
    val reference: String,
    val reviewedAt: Long,
    val correct: Boolean,
    val rating: String,
    @ColumnInfo(defaultValue = "''") val syncKey: String = UUID.randomUUID().toString(),
    @ColumnInfo(defaultValue = "''") val vocabularyKey: String = "",
)

@Entity(tableName = "pending_changes", primaryKeys = ["kind", "key"])
data class PendingChange(val kind: String, val key: String, val operationId: String = UUID.randomUUID().toString(),
    val data: String? = null, val deleted: Boolean = false)

@Entity(tableName = "sync_state")
data class SyncState(@PrimaryKey val id: Int = 1, val owner: String? = null,
    val cursor: Long = 0, val bootstrapped: Boolean = false)

@Dao
interface LearningDao {
    @Query("SELECT * FROM stories WHERE available = 1 ORDER BY family, level")
    fun stories(): Flow<List<StoryEntity>>
    @Query("SELECT * FROM stories")
    suspend fun allStories(): List<StoryEntity>
    @Query("SELECT COUNT(*) FROM stories")
    suspend fun storyCount(): Int
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun seedStories(stories: List<StoryEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun seedLexicon(words: List<LexemeEntity>)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun cacheStoryLexicon(words: List<StoryLexemeEntity>)
    @Query("SELECT * FROM story_lexicon WHERE storyId=:storyId AND language=:language AND word=:word")
    suspend fun storyLexeme(storyId: String, language: String, word: String): StoryLexemeEntity?
    @Query("SELECT * FROM lexicon WHERE language = :language AND word = :word")
    suspend fun lexeme(language: String, word: String): LexemeEntity?
    @Query("SELECT * FROM lexicon WHERE language = :language")
    suspend fun lexemes(language: String): List<LexemeEntity>
    @Query("SELECT * FROM vocabulary ORDER BY createdAt DESC")
    fun vocabulary(): Flow<List<VocabularyEntity>>
    @Query("SELECT * FROM vocabulary WHERE id = :id")
    suspend fun vocabularyById(id: Long): VocabularyEntity?
    @Query("SELECT * FROM vocabulary WHERE language=:language AND reference=:reference AND storyId=:storyId AND word=:word")
    suspend fun vocabularyByKey(language: String, reference: String, storyId: String, word: String): VocabularyEntity?
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun saveWord(word: VocabularyEntity): Long
    @Update
    suspend fun updateWord(word: VocabularyEntity)
    @Query("DELETE FROM vocabulary WHERE id = :id")
    suspend fun deleteWord(id: Long)
    @Query("SELECT * FROM vocabulary")
    suspend fun allVocabulary(): List<VocabularyEntity>
    @Query("SELECT * FROM reading")
    fun readings(): Flow<List<ReadingEntity>>
    @Query("SELECT * FROM reading WHERE storyId = :storyId AND language = :language")
    suspend fun reading(storyId: String, language: String): ReadingEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveReading(reading: ReadingEntity)
    @Query("SELECT * FROM reading")
    suspend fun allReadings(): List<ReadingEntity>
    @Query("DELETE FROM reading WHERE storyId=:storyId AND language=:language")
    suspend fun deleteReading(storyId: String, language: String)
    @Query("SELECT * FROM reviews ORDER BY reviewedAt DESC")
    fun reviews(): Flow<List<ReviewEntity>>
    @Insert
    suspend fun logReview(review: ReviewEntity)
    @Query("SELECT * FROM reviews")
    suspend fun allReviews(): List<ReviewEntity>
    @Query("SELECT * FROM reviews WHERE syncKey=:key")
    suspend fun reviewByKey(key: String): ReviewEntity?
    @Query("UPDATE reviews SET vocabularyId=:id WHERE vocabularyKey=:key")
    suspend fun linkReviews(key: String, id: Long)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun importReview(review: ReviewEntity)
    @Query("DELETE FROM reviews WHERE syncKey=:key")
    suspend fun deleteReview(key: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(change: PendingChange)
    @Query("SELECT * FROM pending_changes ORDER BY kind, `key` LIMIT :limit")
    suspend fun pending(limit: Int = 100): List<PendingChange>
    @Query("SELECT * FROM pending_changes WHERE kind=:kind AND `key`=:key")
    suspend fun pendingFor(kind: String, key: String): PendingChange?
    @Query("DELETE FROM pending_changes WHERE operationId=:operationId")
    suspend fun acknowledge(operationId: String)
    @Query("SELECT * FROM sync_state WHERE id=1")
    suspend fun syncState(): SyncState?
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSyncState(state: SyncState)
}

@Database(entities = [StoryEntity::class, LexemeEntity::class, StoryLexemeEntity::class, VocabularyEntity::class,
    ReadingEntity::class, ReviewEntity::class, PendingChange::class, SyncState::class], version = 2, exportSchema = true)
abstract class LearningDatabase : RoomDatabase() {
    abstract fun dao(): LearningDao
    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE stories ADD COLUMN remote INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE stories ADD COLUMN available INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE reviews ADD COLUMN syncKey TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE reviews ADD COLUMN vocabularyKey TEXT NOT NULL DEFAULT ''")
                db.query("SELECT id FROM reviews").use { cursor ->
                    while (cursor.moveToNext()) db.execSQL("UPDATE reviews SET syncKey=? WHERE id=?",
                        arrayOf(UUID.randomUUID().toString(), cursor.getLong(0)))
                }
                db.execSQL("UPDATE reviews SET vocabularyKey=COALESCE((SELECT language || ':' || reference || ':' || storyId || ':' || word FROM vocabulary WHERE vocabulary.id=reviews.vocabularyId), 'removed:' || syncKey)")
                db.execSQL("CREATE UNIQUE INDEX index_reviews_syncKey ON reviews(syncKey)")
                db.execSQL("CREATE TABLE pending_changes (kind TEXT NOT NULL, `key` TEXT NOT NULL, operationId TEXT NOT NULL, data TEXT, deleted INTEGER NOT NULL, PRIMARY KEY(kind, `key`))")
                db.execSQL("CREATE TABLE story_lexicon (storyId TEXT NOT NULL, language TEXT NOT NULL, word TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(storyId, language, word))")
                db.execSQL("CREATE TABLE sync_state (id INTEGER NOT NULL, owner TEXT, cursor INTEGER NOT NULL, bootstrapped INTEGER NOT NULL, PRIMARY KEY(id))")
            }
        }
    }
}
