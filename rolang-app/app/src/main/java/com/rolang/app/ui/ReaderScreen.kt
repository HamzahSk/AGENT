package com.rolang.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.BookmarkAdd
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Translate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rolang.app.LearningState
import com.rolang.app.LearningViewModel
import com.rolang.app.data.Story
import com.rolang.app.data.WordDetail
import com.rolang.app.domain.Words
import kotlinx.coroutines.CancellationException

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(story: Story, state: LearningState, viewModel: LearningViewModel, onBack: () -> Unit) {
    val prefs = state.preferences
    val savedReading = state.courseReadings.firstOrNull { it.storyId == story.id }
    var position by rememberSaveable(story.id, prefs.target.code) { mutableIntStateOf(savedReading?.sentence ?: 0) }
    // A published story can become shorter while a device retains an older position.
    val index = position.coerceIn(story.sentences.indices)
    var translated by rememberSaveable(story.id, prefs.target.code) { mutableStateOf(false) }
    var selected by remember(story.id, prefs.target, prefs.native, index) { mutableStateOf<String?>(null) }
    var detail by remember(selected, index) { mutableStateOf<WordDetail?>(null) }
    var lookupError by remember(selected, index) { mutableStateOf(false) }
    val color = MaterialTheme.colorScheme.primary
    LaunchedEffect(story.id, prefs.target, index) {
        viewModel.reading(story, prefs.target, index, savedReading?.completed == true)
    }
    LaunchedEffect(selected, prefs.target, prefs.native, index) {
        selected?.let { word ->
            try { detail = viewModel.lookup(story, index, word, prefs) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { lookupError = true }
        }
    }
    val text = story.sentence(index, prefs.target)
    val annotated = remember(text, color) {
        buildAnnotatedString {
            append(text)
            Words.tokens(text).forEach { token ->
                addLink(LinkAnnotation.Clickable(token.text,
                    styles = TextLinkStyles(style = SpanStyle(color = color)),
                    linkInteractionListener = { selected = token.text }), token.start, token.end)
            }
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Reading room", style = MaterialTheme.typography.titleMedium) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back to stories") } })
        LazyColumn(Modifier.weight(1f).testTag("reader-content"), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            item { SectionTitle(story.title(prefs.target), "${story.category} · ${story.level.label}") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Passage ${index + 1} of ${story.sentences.size}", style = MaterialTheme.typography.labelLarge)
                    LinearProgressIndicator(progress = { (index + 1f) / story.sentences.size }, modifier = Modifier.fillMaxWidth())
                    Text("Tap any word to explore its meaning.", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large) {
                    Text(annotated, Modifier.fillMaxWidth().padding(24.dp).animateContentSize(),
                        style = TextStyle(fontFamily = FontFamily.Serif, fontSize = prefs.fontSize.sp,
                            lineHeight = (prefs.fontSize * 1.8).sp))
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { translated = !translated }) {
                        Icon(Icons.Outlined.Translate, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (translated) "Hide translation" else "Translate passage")
                    }
                    AnimatedVisibility(translated) {
                        InfoCard(prefs.native.label, story.sentence(index, prefs.native))
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { position = index - 1; translated = false }, enabled = index > 0, modifier = Modifier.weight(1f)) { Text("Previous") }
                    Button(onClick = {
                        if (index < story.sentences.lastIndex) { position = index + 1; translated = false }
                        else { viewModel.reading(story, prefs.target, index, true); onBack() }
                    }, modifier = Modifier.weight(1f)) { Text(if (index < story.sentences.lastIndex) "Next passage" else "Finish story") }
                }
            }
        }
    }
    if (selected != null) ModalBottomSheet(onDismissRequest = { selected = null }) {
        LazyColumn(modifier = Modifier.testTag("word-details"), contentPadding = PaddingValues(start = 24.dp, end = 24.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(selected!!, modifier = Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium)
                    IconButton(onClick = { selected = null }) { Icon(Icons.Outlined.Close, "Close word details") }
                }
            }
            val word = detail
            if (word == null) item {
                if (lookupError) Text("Unable to open this translation. Close and tap the word to retry.")
                else CircularProgressIndicator()
            } else {
                item {
                    Text(word.translation, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text("${word.partOfSpeech} · ${prefs.target.label} → ${prefs.native.label}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item { DetailSection("Meaning", word.meaning) }
                item { DetailSection("In context", word.explanation) }
                item { DetailSection("Example", word.example + "\n\n" + word.exampleTranslation) }
                item {
                    val saved = state.courseWords.any { it.storyId == story.id && it.word == Words.key(word.word) }
                    Button(onClick = { viewModel.save(story, word, prefs) }, enabled = !saved, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.BookmarkAdd, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp))
                        Text(if (saved) "Saved to vocabulary" else "Save word")
                    }
                }
            }
        }
    }
}

@Composable
fun DetailSection(title: String, text: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
