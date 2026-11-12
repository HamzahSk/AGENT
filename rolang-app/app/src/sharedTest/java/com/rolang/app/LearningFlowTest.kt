package com.rolang.app

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Exercises navigation, actual word links, saving, translation, and quiz grading. */
@RunWith(AndroidJUnit4::class)
class LearningFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun readSaveAndReviewAWordThroughTheInterface() {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("Explore stories").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Stories", useUnmergedTree = true).performClick()
        scrollClick("stories-list", "The morning market")
        val text = compose.onNodeWithText("Maya walks to the market in the morning.")
        val layouts = mutableListOf<TextLayoutResult>()
        text.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        text.performTouchInput { click(layouts.single().getBoundingBox(1).center) }
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("word-details").fetchSemanticsNodes().isNotEmpty() }
        scrollClick("word-details", "Save word")
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Saved to vocabulary").fetchSemanticsNodes().isNotEmpty() }
        scrollClick("word-details", "Almost Mastered")
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Learning status: Almost Mastered").fetchSemanticsNodes().isNotEmpty() }
        scrollClick("word-details", "Known")
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Learning status: Known").fetchSemanticsNodes().isNotEmpty() }
        scrollClick("word-details", "Learning")
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Learning status: Learning").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("word-details").performScrollToIndex(0)
        compose.onNodeWithContentDescription("Close word details").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("word-details").fetchSemanticsNodes().isEmpty() }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithText("Next passage").assertDoesNotExist()
        scrollClick("reader-content", "Translate story")
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithText("Hide translation").assertExists()
        compose.onNodeWithText("Maya berjalan ke pasar pada pagi hari.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("reader-content").performScrollToNode(hasTestTag("story-paragraph-2"))
        compose.onNodeWithTag("story-paragraph-2").assertIsDisplayed()
        scrollClick("reader-content", "Finish story")
        compose.onNodeWithText("Vocabulary", useUnmergedTree = true).performClick()
        compose.onNodeWithTag("vocabulary-list").performScrollToNode(hasText("maya"))
        compose.onNodeWithText("maya").assertIsDisplayed()
        compose.onNodeWithText("Review", useUnmergedTree = true).performClick()
        scrollClick("review-content", "Practice next word")
        compose.onNodeWithTag("review-content").performScrollToIndex(0)
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("quiz-question").fetchSemanticsNodes().isNotEmpty() }
        scrollClick("review-content", "Maya")
        scrollClick("review-content", "Check answer")
        compose.onNodeWithText("You remembered it").performScrollTo().assertIsDisplayed()
        scrollClick("review-content", "Good · 1d")
        compose.onNodeWithTag("review-content").performScrollToIndex(0)
        compose.waitUntil(10_000) { compose.onAllNodesWithText("You're all caught up").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Profile", useUnmergedTree = true).performClick()
        compose.onNodeWithTag("profile-content").performScrollToNode(hasText("Stories completed: 1 · Reviews recorded: 1"))
        compose.onNodeWithText("Stories completed: 1 · Reviews recorded: 1").assertIsDisplayed()
    }
    private fun scrollClick(container: String, text: String) {
        compose.onNodeWithTag(container).performScrollToNode(hasText(text))
        // Exercise accessibility clicks after scrolling; word links above use real touch input.
        compose.onNode(hasText(text) and hasAnyAncestor(hasTestTag(container)))
            .performSemanticsAction(SemanticsActions.OnClick) { it() }
    }
}
