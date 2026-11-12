package com.rolang.app.data

import org.json.JSONObject

/** Stable natural keys let another device assign its own Room row IDs. */
object SyncCodec {
    fun key(word: VocabularyEntity) = "${word.language}:${word.reference}:${word.storyId}:${word.word}"
    fun progress(reading: ReadingEntity) = PendingChange("progress", "${reading.storyId}:${reading.language}",
        data = JSONObject().put("storyId", reading.storyId).put("language", reading.language)
            .put("sentence", reading.sentence).put("completed", reading.completed).toString())
    fun vocabulary(word: VocabularyEntity) = PendingChange("vocabulary", key(word), data = JSONObject()
        .put("language", word.language).put("reference", word.reference).put("word", word.word)
        .put("translation", word.translation).put("meaning", word.meaning).put("partOfSpeech", word.partOfSpeech)
        .put("explanation", word.explanation).put("example", word.example).put("exampleTranslation", word.exampleTranslation)
        .put("storyId", word.storyId).put("storyTitle", word.storyTitle).put("category", word.category)
        .put("createdAt", word.createdAt).put("dueAt", word.dueAt).put("repetitions", word.repetitions)
        .put("intervalDays", word.intervalDays).put("ease", word.ease).put("lapses", word.lapses)
        .put("mastered", word.mastered).put("lastReviewedAt", word.lastReviewedAt).toString())
    fun review(review: ReviewEntity, vocabularyKey: String) = PendingChange("review", review.syncKey, data = JSONObject()
        .put("vocabularyKey", vocabularyKey).put("language", review.language).put("reference", review.reference)
        .put("reviewedAt", review.reviewedAt).put("correct", review.correct).put("rating", review.rating).toString())
    fun preferences(p: LearningPreferences) = PendingChange("profile", "preferences", data = JSONObject()
        .put("target", p.target.code).put("native", p.native.code).put("level", p.level.name)
        .put("fontSize", p.fontSize.toDouble()).put("dark", p.dark).toString())
    fun word(json: JSONObject, id: Long = 0) = VocabularyEntity(id = id,
        language = json.getString("language"), reference = json.getString("reference"), word = json.getString("word"),
        translation = json.getString("translation"), meaning = json.getString("meaning"), partOfSpeech = json.getString("partOfSpeech"),
        explanation = json.getString("explanation"), example = json.getString("example"), exampleTranslation = json.getString("exampleTranslation"),
        storyId = json.getString("storyId"), storyTitle = json.getString("storyTitle"), category = json.getString("category"),
        createdAt = json.getLong("createdAt"), dueAt = json.getLong("dueAt"), repetitions = json.getInt("repetitions"),
        intervalDays = json.getInt("intervalDays"), ease = json.getDouble("ease"), lapses = json.getInt("lapses"),
        mastered = json.getBoolean("mastered"), lastReviewedAt = json.getLong("lastReviewedAt"))
}
