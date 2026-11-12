package com.rolang.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rolang.app.LearningState
import com.rolang.app.data.VocabularyEntity
import com.rolang.app.domain.VocabularyStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun VocabularyScreen(state: LearningState, now: Long, mastery: (VocabularyEntity) -> Unit,
                     delete: (VocabularyEntity) -> Unit, status: (VocabularyEntity, VocabularyStatus) -> Unit,
                     stories: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("All words") }
    var group by rememberSaveable { mutableStateOf("Story") }
    var selectedId by rememberSaveable { mutableStateOf<Long?>(null) }
    var remove by remember { mutableStateOf<VocabularyEntity?>(null) }
    val words = state.courseWords.filter {
        (filter == "All words" || it.learningStatus().label == filter) &&
            (it.word.contains(query, true) || it.translation.contains(query, true) || it.storyTitle.contains(query, true))
    }
    LazyColumn(modifier = Modifier.testTag("vocabulary-list"), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { SectionTitle("Words to keep", "${state.preferences.target.label} → ${state.preferences.native.label}") }
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("Search vocabulary") },
                singleLine = true, leadingIcon = { Icon(Icons.Outlined.Search, null) })
        }
        item {
            Column {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (listOf("All words") + VocabularyStatus.entries.map { it.label }).forEach { item ->
                        FilterChip(filter == item, { filter = item }, label = { Text(item) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Group by", style = MaterialTheme.typography.labelLarge)
                    listOf("Story", "Category").forEach { item -> FilterChip(group == item, { group = item }, label = { Text(item) }) }
                }
            }
        }
        if (state.courseWords.isEmpty()) item {
            InfoCard("Your collection starts with a story", "Tap a word in the reader, explore its translation, and save it for practice.", "Explore stories", stories)
        } else if (words.isEmpty()) item { InfoCard("No matching words", "Try a different search or filter.") }
        words.groupBy { if (group == "Story") it.storyTitle else it.category }.forEach { (title, grouped) ->
            item(key = "group:$title") { Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary) }
            items(grouped, key = { it.id }) { word ->
                Card(onClick = { selectedId = word.id }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
                    Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(word.word, style = MaterialTheme.typography.titleLarge)
                            VocabularyStatusLabel(word.learningStatus())
                            Text(word.translation)
                            Text(if (word.mastered) "Mastered" else if (word.dueAt <= now) "Ready for review" else "Next review: ${dueDate(word.dueAt)}",
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { mastery(word) }) {
                            Icon(if (word.mastered) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
                                if (word.mastered) "Mark ${word.word} as learning" else "Mark ${word.word} as mastered")
                        }
                    }
                }
            }
        }
    }
    val selected = state.courseWords.firstOrNull { it.id == selectedId }
    if (selected != null) ModalBottomSheet(onDismissRequest = { selectedId = null }) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { SectionTitle(selected.word, "${selected.translation} · ${selected.partOfSpeech}") }
                    IconButton(onClick = { selectedId = null }) { Icon(Icons.Outlined.Close, "Close vocabulary details") }
                }
            }
            item { DetailSection("Meaning", selected.meaning) }
            item { DetailSection("In context", selected.explanation) }
            item { DetailSection("Example", selected.example + "\n\n" + selected.exampleTranslation) }
            item { DetailSection("From ${selected.storyTitle}", "${selected.category} · ${selected.repetitions} successful repetitions · ${selected.lapses} lapses") }
            item { VocabularyStatusSelector(selected.learningStatus()) { status(selected, it) } }
            item {
                Button(onClick = { mastery(selected) }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (selected.mastered) "Return to learning" else "Mark as mastered")
                }
                TextButton(onClick = { remove = selected }) { Text("Remove word", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
    remove?.let { word ->
        AlertDialog(onDismissRequest = { remove = null }, title = { Text("Remove ${word.word}?") },
            text = { Text("This removes the saved word and its review schedule. You can save it again from the story.") },
            confirmButton = { TextButton(onClick = { delete(word); remove = null; selectedId = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { remove = null }) { Text("Keep word") } })
    }
}

fun dueDate(millis: Long): String = DateTimeFormatter.ofPattern("MMM d · HH:mm")
    .format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))
