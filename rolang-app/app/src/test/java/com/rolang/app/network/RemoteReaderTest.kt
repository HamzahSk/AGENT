package com.rolang.app.network

import android.app.Application
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.rolang.app.LearningState
import com.rolang.app.LearningViewModel
import com.rolang.app.data.*
import com.rolang.app.ui.ReaderScreen
import com.rolang.app.ui.RoLangTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

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
        compose.onNodeWithText("Passage ${initial.sentences.size} of ${initial.sentences.size}").assertExists()
        compose.runOnIdle { story = initial.copy(sentences = initial.sentences.take(1)) }
        compose.onNodeWithText("Passage 1 of 1").assertExists()
        compose.onNodeWithText(initial.sentences.first().getValue("en")).assertExists()
    }
}
