package com.rolang.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.Room
import com.rolang.app.data.*
import com.rolang.app.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.json.JSONObject

data class LearningState(
    val preferences: LearningPreferences = LearningPreferences(),
    val stories: List<Story> = emptyList(),
    val vocabulary: List<VocabularyEntity> = emptyList(),
    val readings: List<ReadingEntity> = emptyList(),
    val reviews: List<ReviewEntity> = emptyList(),
    val ready: Boolean = false,
    val error: String? = null,
) {
    val courseWords get() = vocabulary.filter {
        it.language == preferences.target.code && it.reference == preferences.native.code
    }
    val courseReadings get() = readings.filter { it.language == preferences.target.code }
    val courseReviews get() = reviews.filter {
        it.language == preferences.target.code && it.reference == preferences.native.code
    }
    fun due(now: Long) = courseWords.filter { !it.mastered && it.dueAt <= now }.sortedBy { it.dueAt }
}

data class Quiz(
    val word: VocabularyEntity,
    val choices: List<String>,
    val typed: Boolean,
    val response: String = "",
    val revealed: Boolean = false,
    val correct: Boolean = false,
)

class LearningViewModel(application: Application) : AndroidViewModel(application) {
    private val database = Room.databaseBuilder(application, LearningDatabase::class.java, "ro-lang.db").build()
    private val repository = LearningRepository(database)
    private val preferences = PreferencesRepository(application.learningPreferences)
    private val ready = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()
    private val _now = MutableStateFlow(System.currentTimeMillis())
    val now = _now.asStateFlow()
    private val _quiz = MutableStateFlow<Quiz?>(null)
    val quiz = _quiz.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()
    private var languageGeneration = 0
    private val content = combine(preferences.preferences,
        repository.dao.stories().map { rows -> withContext(Dispatchers.Default) { rows.map(Corpus::story) } },
        repository.dao.vocabulary(), repository.dao.readings(), repository.dao.reviews()) { prefs, stories, words, reading, reviews ->
        LearningState(prefs, stories, words, reading, reviews)
    }
    val state = combine(content, ready, error) { content, ready, error -> content.copy(ready = ready, error = error) }
        .catch { emit(LearningState(error = "Unable to load local learning data. Restart the app to retry.")) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, LearningState())

    init {
        viewModelScope.launch {
            try {
                repository.initialize(application)
                preferences.preferences.first()
                ready.value = true
            } catch (_: Exception) {
                error.value = "Unable to prepare the offline library. Restart the app to retry."
            }
        }
        viewModelScope.launch { while (isActive) { _now.value = System.currentTimeMillis(); delay(30_000) } }
    }
    fun clearMessage() { _message.value = null }
    private fun work(action: suspend () -> Unit) = viewModelScope.launch {
        try { action() } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { _message.value = "Couldn't save this change. Please try again." }
    }
    fun target(language: Language) {
        languageGeneration++
        _quiz.value = null
        work { preferences.target(language) }
    }
    fun native(language: Language) {
        languageGeneration++
        _quiz.value = null
        work { preferences.native(language) }
    }
    fun level(level: Level) { work { preferences.level(level) } }
    fun font(size: Float) { work { preferences.font(size) } }
    fun dark(value: Boolean) { work { preferences.dark(value) } }
    suspend fun lookup(story: Story, index: Int, word: String, prefs: LearningPreferences) =
        repository.lookup(story, index, word, prefs.target, prefs.native)
    fun save(story: Story, word: WordDetail, prefs: LearningPreferences) { work {
        val saved = repository.save(story, word, prefs.target, prefs.native, System.currentTimeMillis())
        _now.value = System.currentTimeMillis()
        _message.value = if (saved) "Saved to vocabulary · ready for review" else "Already saved from this story"
    } }
    fun mastery(word: VocabularyEntity) { work {
        repository.mastery(word.id, !word.mastered, System.currentTimeMillis())
        _now.value = System.currentTimeMillis()
    } }
    fun delete(word: VocabularyEntity) { work { repository.dao.deleteWord(word.id); _message.value = "Word removed" } }
    fun reading(story: Story, language: Language, index: Int, completed: Boolean) { work {
        repository.reading(story, language, index, completed)
        if (completed) _message.value = "Story completed · well done"
    } }
    fun startQuiz(typed: Boolean) {
        if (_busy.value) return
        val word = state.value.due(System.currentTimeMillis()).firstOrNull() ?: return
        val generation = languageGeneration
        _busy.value = true
        work {
            try {
                val distractors = repository.dao.lexemes(word.language).map { JSONObject(it.content) }
                    .filter { it.getString("pos") == word.partOfSpeech }
                    .map { it.getJSONObject("translations").getString(word.reference) }
                    .filter { !Words.matches(it, word.translation) }.distinct().shuffled().take(3)
                val prefs = state.value.preferences
                if (generation == languageGeneration && prefs.target.code == word.language && prefs.native.code == word.reference) {
                    _quiz.value = Quiz(word, (distractors + word.translation).shuffled(), typed)
                }
            } finally { _busy.value = false }
        }
    }
    fun answer(value: String) { _quiz.value = _quiz.value?.takeUnless { it.revealed }?.copy(response = value) ?: _quiz.value }
    fun reveal() {
        val quiz = _quiz.value ?: return
        if (!quiz.revealed && quiz.response.isNotBlank()) _quiz.value = quiz.copy(revealed = true,
            correct = Words.matches(quiz.response, quiz.word.translation))
    }
    fun rate(rating: Rating) {
        val question = _quiz.value ?: return
        if (!question.revealed || _busy.value) return
        _busy.value = true
        work {
            try {
                val saved = repository.review(question.word, rating, question.correct, System.currentTimeMillis())
                _quiz.value = null
                _now.value = System.currentTimeMillis()
                _message.value = if (saved) "Review saved" else "This word is no longer due for review"
            } finally { _busy.value = false }
        }
    }
    fun exitQuiz() { if (!_busy.value) _quiz.value = null }
    override fun onCleared() { database.close(); super.onCleared() }
}
