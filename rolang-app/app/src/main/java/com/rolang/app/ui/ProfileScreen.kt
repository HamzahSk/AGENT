package com.rolang.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rolang.app.LearningState
import com.rolang.app.domain.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(state: LearningState, target: (Language) -> Unit, native: (Language) -> Unit, level: (Level) -> Unit,
                  font: (Float) -> Unit, dark: (Boolean) -> Unit) {
    val prefs = state.preferences
    val reviews = state.courseReviews
    val mastered = state.courseWords.count { it.mastered }
    val dates = reviews.map { Instant.ofEpochMilli(it.reviewedAt).atZone(ZoneId.systemDefault()).toLocalDate() }.toSet()
    var cursor = if (LocalDate.now() in dates) LocalDate.now() else LocalDate.now().minusDays(1)
    var streak = 0
    while (cursor in dates) { streak++; cursor = cursor.minusDays(1) }
    LazyColumn(modifier = Modifier.testTag("profile-content"), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item { SectionTitle("Your learning journey", "Small steps become lasting progress.") }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile("$streak", "Day review streak", Modifier.weight(1f))
                StatTile(if (reviews.isEmpty()) "—" else "${reviews.count { it.correct } * 100 / reviews.size}%", "Review accuracy", Modifier.weight(1f))
            }
        }
        item {
            Card {
                Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("$mastered of ${state.courseWords.size} words mastered", style = MaterialTheme.typography.titleMedium)
                    LinearProgressIndicator(progress = { if (state.courseWords.isEmpty()) 0f else mastered.toFloat() / state.courseWords.size }, modifier = Modifier.fillMaxWidth())
                    Text("Stories completed: ${state.courseReadings.count { it.completed }} · Reviews recorded: ${reviews.size}")
                }
            }
        }
        item {
            LanguagePicker("I'm learning", prefs.target, target)
        }
        item {
            LanguagePicker("Translate into", prefs.native, native)
            Text("Your vocabulary and reviews stay separate for each language pair.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Preferred reading level", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Level.entries.forEach { value -> FilterChip(prefs.level == value, { level(value) }, label = { Text(value.label) }) }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Reader text size", style = MaterialTheme.typography.titleMedium)
                var size by remember(prefs.fontSize) { mutableFloatStateOf(prefs.fontSize) }
                Text("${size.toInt()} sp · A comfortable pace for every page")
                Slider(value = size, onValueChange = { size = it }, valueRange = 16f..28f, steps = 5,
                    onValueChangeFinished = { font(size) })
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Dark appearance")
                    Switch(checked = prefs.dark, onCheckedChange = dark)
                }
            }
        }
        item { InfoCard("Your library travels with you", "Stories, translations, saved words, reading progress, and reviews live on this device. Ro-Lang works without an account or internet connection. Clearing app data or uninstalling removes your collection.") }
        item { Text("Ro-Lang · Version 1.0", color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LanguagePicker(title: String, selected: Language, choose: (Language) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Language.entries.forEach { language -> FilterChip(selected == language, { choose(language) }, label = { Text(language.label) }) }
        }
    }
}
