package com.rolang.app.network

import android.app.Application
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rolang.app.LearningState
import com.rolang.app.LearningViewModel
import com.rolang.app.data.*
import com.rolang.app.domain.Language
import com.rolang.app.ui.ReaderScreen
import com.rolang.app.ui.RoLangTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import kotlinx.coroutines.runBlocking

@RunWith(AndroidJUnit4::class)
class RemoteReaderTest {
    @get:Rule val compose = createComposeRule()

    @Test fun staleSyncedPositionAndShortenedRemoteStoryRemainReadable() {
        val application = ApplicationProvider.getApplicationContext<Application>()
        val initial = Corpus.story(Corpus.load(application).first.first())
        var story by mutableStateOf(initial)
        val viewModel = LearningViewModel(application)
        val state = LearningState(readings = listOf(ReadingEntity(initial.id, "en", 299)), ready = true)
        compose.setContent { RoLangTheme(false) { ReaderScreen(story, state, viewModel) {} } }
        compose.onNodeWithText("Paragraph ${initial.sentences.size} of ${initial.sentences.size}").assertExists()
        compose.runOnIdle { story = initial.copy(sentences = initial.sentences.take(1)) }
        compose.onNodeWithText("Paragraph 1 of 1").assertExists()
        compose.onNodeWithText(initial.sentences.first().getValue("en")).assertExists()
    }

    @Test fun changingReferenceLanguageKeepsEveryWordLinkInteractive() {
        val application = ApplicationProvider.getApplicationContext<Application>()
        runBlocking { AppServices.get(application).repository.initialize(application) }
        val story = Corpus.story(Corpus.load(application).first.first())
        val viewModel = LearningViewModel(application)
        var state by mutableStateOf(LearningState(ready = true))
        compose.setContent { RoLangTheme(false) { ReaderScreen(story, state, viewModel) {} } }
        fun tapFirstWord() {
            val layouts = mutableListOf<TextLayoutResult>()
            compose.onNodeWithTag("story-paragraph-0").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            compose.onNodeWithTag("story-paragraph-0").performTouchInput { click(layouts.single().getBoundingBox(1).center) }
            compose.waitUntil(10_000) { compose.onAllNodesWithTag("word-details").fetchSemanticsNodes().isNotEmpty() }
        }
        tapFirstWord()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("English → Indonesian", substring = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Close word details").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("word-details").fetchSemanticsNodes().isEmpty() }
        compose.runOnIdle { state = state.copy(preferences = state.preferences.copy(native = Language.TAGALOG)) }
        tapFirstWord()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("English → Filipino (Tagalog)", substring = true).fetchSemanticsNodes().isNotEmpty() }
    }
}
