package com.rolang.app.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.rolang.app.LearningState
import com.rolang.app.data.Story
import com.rolang.app.domain.*

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeScreen(state: LearningState, now: Long, stories: () -> Unit, review: () -> Unit, read: (String) -> Unit) {
    val prefs = state.preferences
    val due = state.due(now).size
    val completed = state.courseReadings.count { it.completed }
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Ro-Lang", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(50)) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.OfflinePin, null, Modifier.size(18.dp))
                        Text("Offline library", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("One story.\nA world of words.", style = MaterialTheme.typography.headlineLarge)
                Text("Learning ${prefs.target.label} with ${prefs.native.label}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            Card(onClick = stories, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Row(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(
                    MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.surfaceContainer))).padding(24.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("YOUR NEXT CHAPTER", style = MaterialTheme.typography.labelLarge)
                        Text("A little reading,\na little discovery.", style = MaterialTheme.typography.titleLarge)
                        Text("${prefs.level.label} · 3 story genres")
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Explore stories", style = MaterialTheme.typography.labelLarge)
                            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.padding(start = 8.dp).size(20.dp))
                        }
                    }
                    Icon(Icons.AutoMirrored.Outlined.MenuBook, null, Modifier.size(52.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatTile("$completed", "Stories finished", Modifier.weight(1f))
                StatTile("${state.courseWords.size}", "Words collected", Modifier.weight(1f))
            }
        }
        item {
            InfoCard(if (due > 0) "$due ${if (due == 1) "word" else "words"} ready to review" else "Grow your vocabulary",
                if (due > 0) "A quick practice helps your new words stay with you." else "Tap a word while reading and save it. Your first review starts there.",
                if (due > 0) "Start a review" else "Find a story", if (due > 0) review else stories)
        }
        item { SectionTitle("Made for a quiet moment", "Built-in stories · no connection needed") }
        items(state.stories.filter { it.level == prefs.level }, key = { it.id }) { story ->
            StoryCard(story, state, read)
        }
    }
}

@Composable
fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(modifier, color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StoriesScreen(state: LearningState, level: (Level) -> Unit, read: (String) -> Unit) {
    var category by rememberSaveable { mutableStateOf("All genres") }
    var query by rememberSaveable { mutableStateOf("") }
    val prefs = state.preferences
    val categories = listOf("All genres") + state.stories.map { it.category }.distinct()
    val filtered = state.stories.filter { story ->
        story.level == prefs.level && (category == "All genres" || story.category == category) &&
            (story.title(prefs.target).contains(query, true) || story.category.contains(query, true) || story.summary(prefs.target).contains(query, true))
    }
    LazyColumn(modifier = Modifier.testTag("stories-list"), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { SectionTitle("Your story shelf", "Read in ${prefs.target.label} · translate into ${prefs.native.label}") }
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
                label = { Text("Search stories") }, leadingIcon = { Icon(Icons.Outlined.Search, null) })
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Reading level", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Level.entries.forEach { item -> FilterChip(prefs.level == item, { level(item) }, label = { Text(item.label) }) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    categories.forEach { value -> FilterChip(category == value, { category = value }, label = { Text(value) }) }
                }
            }
        }
        item { Text("${filtered.size} stories · all available offline", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
        if (filtered.isEmpty()) item { InfoCard("No stories found", "Try another search or genre.") }
        items(filtered, key = { it.id }) { story -> StoryCard(story, state, read) }
    }
}

@Composable
fun StoryCard(story: Story, state: LearningState, read: (String) -> Unit) {
    val reading = state.courseReadings.firstOrNull { it.storyId == story.id }
    Card(onClick = { read(story.id) }, modifier = Modifier.fillMaxWidth().animateContentSize(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(story.category.uppercase(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
                Icon(when (story.family) {
                    "river" -> Icons.Outlined.Park
                    "letter" -> Icons.Outlined.MailOutline
                    else -> Icons.Outlined.Storefront
                }, null, tint = MaterialTheme.colorScheme.primary)
            }
            Text(story.title(state.preferences.target), style = MaterialTheme.typography.titleLarge)
            Text(story.summary(state.preferences.target), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(story.level.label, style = MaterialTheme.typography.bodyMedium)
            if (reading != null) LinearProgressIndicator(progress = {
                if (reading.completed) 1f else (reading.sentence + 1f) / story.sentences.size
            }, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (reading?.completed == true) "Read again" else if (reading != null) "Continue reading" else "Start reading",
                    color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.padding(start = 8.dp).size(18.dp))
            }
        }
    }
}
