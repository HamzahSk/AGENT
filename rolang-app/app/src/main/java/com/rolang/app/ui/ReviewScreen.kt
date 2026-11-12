package com.rolang.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rolang.app.LearningState
import com.rolang.app.Quiz
import com.rolang.app.domain.*

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ReviewScreen(state: LearningState, now: Long, quiz: Quiz?, busy: Boolean, start: (Boolean) -> Unit,
                 answer: (String) -> Unit, reveal: () -> Unit, rate: (Rating) -> Unit, exit: () -> Unit,
                 stories: () -> Unit) {
    var typed by rememberSaveable { mutableStateOf(false) }
    val due = state.due(now)
    BackHandler(quiz != null) { exit() }
    LazyColumn(modifier = Modifier.testTag("review-content"), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item { SectionTitle("Make the words stick", "A little practice, remembered for longer.") }
        if (quiz == null) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("${due.size}", "Due now", Modifier.weight(1f))
                    StatTile("${state.courseWords.count { it.mastered }}", "Mastered", Modifier.weight(1f))
                }
            }
            if (due.isEmpty()) item {
                val next = state.courseWords.filter { !it.mastered }.minByOrNull { it.dueAt }
                InfoCard(if (state.courseWords.isEmpty()) "Save your first word" else "You're all caught up",
                    if (state.courseWords.isEmpty()) "Your saved words become questions here. Start by reading a story."
                    else if (next != null) "Next review: ${dueDate(next.dueAt)}. Read a new story while these words settle in."
                    else "All your collected words are mastered. Keep exploring to grow your collection.", "Explore stories", stories)
            } else {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Choose your practice", style = MaterialTheme.typography.titleMedium)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(!typed, { typed = false }, label = { Text("Multiple choice") })
                            FilterChip(typed, { typed = true }, label = { Text("Written recall") })
                        }
                        Button(onClick = { start(typed) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Practice next word") }
                    }
                }
            }
            item { InfoCard("A rhythm that adapts to you", "Saved words are due immediately. Correct answers move words through Learning and Almost Mastered toward Known. With Good, reviews return after 1 day, then 6 days, then longer intervals. A missed word returns to Learning in 10 minutes. Known words pause reviews until you return them to learning.") }
        } else {
            item {
                Card(modifier = Modifier.testTag("quiz-question"), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("TRANSLATE INTO ${Language.from(quiz.word.reference).label.uppercase()}", style = MaterialTheme.typography.labelLarge)
                        Text(quiz.word.word, style = MaterialTheme.typography.headlineLarge)
                        VocabularyStatusLabel(quiz.word.learningStatus())
                        Text("${quiz.word.partOfSpeech} · ${quiz.word.storyTitle}")
                    }
                }
            }
            if (!quiz.revealed) {
                if (quiz.typed) item {
                    OutlinedTextField(quiz.response, answer, Modifier.fillMaxWidth(), label = { Text("Your translation") }, singleLine = true)
                } else quiz.choices.forEach { option -> item(key = option) {
                    FilterChip(quiz.response == option, { answer(option) }, label = { Text(option, Modifier.padding(8.dp)) }, modifier = Modifier.fillMaxWidth())
                } }
                item { Button(onClick = reveal, enabled = quiz.response.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Check answer") } }
            } else {
                item { InfoCard(if (quiz.correct) "You remembered it" else "A word worth another look",
                    "${quiz.word.word} → ${quiz.word.translation}\n\n${quiz.word.example}\n\n${quiz.word.exampleTranslation}") }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(if (quiz.correct) "How did that feel?" else "Practice it again in 10 minutes.", style = MaterialTheme.typography.titleMedium)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val ratings = if (quiz.correct) Rating.entries else listOf(Rating.AGAIN)
                            ratings.forEach { rating ->
                                val next = SpacedRepetition.next(quiz.word.schedule(), rating, now)
                                FilledTonalButton(onClick = { rate(rating) }, enabled = !busy) {
                                    Text("${rating.name.lowercase().replaceFirstChar { it.uppercase() }} · ${if (rating == Rating.AGAIN) "10 min" else "${next.intervalDays}d"}")
                                }
                            }
                        }
                    }
                }
            }
            item { TextButton(onClick = exit, enabled = !busy) { Text("Leave practice") } }
        }
    }
}
