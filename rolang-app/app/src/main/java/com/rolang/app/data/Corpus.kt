package com.rolang.app.data

import android.content.Context
import com.rolang.app.domain.Language
import com.rolang.app.domain.Level
import com.rolang.app.domain.Words
import org.json.JSONObject

data class Story(
    val id: String, val family: String, val category: String, val level: Level,
    val titles: Map<String, String>, val summaries: Map<String, String>,
    val sentences: List<Map<String, String>>,
) {
    fun title(language: Language) = titles.getValue(language.code)
    fun summary(language: Language) = summaries.getValue(language.code)
    fun sentence(index: Int, language: Language) = sentences[index].getValue(language.code)
}

data class WordDetail(
    val word: String, val translation: String, val meaning: String, val partOfSpeech: String,
    val explanation: String, val example: String, val exampleTranslation: String,
)

object Corpus {
    private fun translations(obj: JSONObject) = Language.entries.associate { it.code to obj.getString(it.code) }
    fun story(entity: StoryEntity): Story {
        val json = JSONObject(entity.content)
        val sentences = json.getJSONArray("sentences")
        return Story(entity.id, entity.family, entity.category, Level.valueOf(entity.level),
            translations(json.getJSONObject("title")), translations(json.getJSONObject("summary")),
            (0 until sentences.length()).map { translations(sentences.getJSONObject(it)) })
    }

    fun load(context: Context): Pair<List<StoryEntity>, List<LexemeEntity>> {
        val root = JSONObject(context.assets.open("corpus.json").bufferedReader().use { it.readText() })
        return parse(root)
    }

    fun parse(root: JSONObject): Pair<List<StoryEntity>, List<LexemeEntity>> {
        val stories = root.getJSONArray("stories")
        val lexicon = root.getJSONArray("lexicon")
        val storyRows = (0 until stories.length()).map { index ->
            val story = stories.getJSONObject(index)
            require(story.getString("id").matches(Regex("[a-zA-Z0-9_-]{1,80}")))
            require(story.getString("family").matches(Regex("[a-zA-Z0-9_-]{1,80}")))
            require(story.getString("category").isNotBlank())
            StoryEntity(story.getString("id"), story.getString("family"), story.getString("category"),
                story.getString("level"), story.toString())
        }
        val wordRows = (0 until lexicon.length()).map { index ->
            val word = lexicon.getJSONObject(index)
            Language.entries.forEach { language ->
                listOf("translations", "meanings", "notes").forEach { field ->
                    require(word.getJSONObject(field).getString(language.code).isNotBlank())
                }
            }
            require(word.getString("pos").isNotBlank())
            LexemeEntity(word.getString("language"), Words.key(word.getString("word")), word.toString())
        }
        val keys = wordRows.map { "${it.language}:${it.word}" }.toSet()
        require(wordRows.size == keys.size) { "Duplicate dictionary entry" }
        storyRows.forEach { row ->
            val story = story(row)
            require(story.sentences.isNotEmpty() && story.sentences.size <= 300)
            Language.entries.forEach { language ->
                require(story.title(language).isNotBlank() && story.summary(language).isNotBlank())
                story.sentences.forEach { sentence ->
                    require(sentence.getValue(language.code).isNotBlank())
                    Words.tokens(sentence.getValue(language.code)).forEach { token ->
                        require("${language.code}:${Words.key(token.text)}" in keys) {
                            "Missing ${language.code} translation for ${token.text} in ${row.id}"
                        }
                    }
                }
            }
        }
        return storyRows to wordRows
    }

    fun detail(lexeme: LexemeEntity, word: String, native: Language, example: String, translated: String): WordDetail {
        val json = JSONObject(lexeme.content)
        return WordDetail(word, json.getJSONObject("translations").getString(native.code),
            json.getJSONObject("meanings").getString(native.code), json.getString("pos"),
            json.getJSONObject("notes").getString(native.code), example, translated)
    }
}
