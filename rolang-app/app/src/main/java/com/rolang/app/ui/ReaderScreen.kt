package com.rolang.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
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
import com.rolang.app.domain.VocabularyStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.distinctUntilChanged

private data class SelectedWord(val text: String, val paragraph: Int)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(story: Story, state: LearningState, viewModel: LearningViewModel, onBack: () -> Unit) {
    val prefs = state.preferences
    val savedReading = state.courseReadings.firstOrNull { it.storyId == story.id }
    val listState = rememberSaveable(story.id, prefs.target.code, saver = LazyListState.Saver) {
        val paragraph = (savedReading?.sentence ?: 0).coerceIn(story.sentences.indices)
        LazyListState(if (paragraph == 0) 0 else paragraph + 1)
    }
    val index by remember(story.sentences.size, listState) {
        derivedStateOf {
            ((listState.layoutInfo.visibleItemsInfo.lastOrNull { it.index in 1..story.sentences.size }?.index
                ?: listState.firstVisibleItemIndex) - 1).coerceIn(story.sentences.indices)
        }
    }
    var translated by rememberSaveable(story.id, prefs.target.code) { mutableStateOf(false) }
    var selected by remember(story.id, prefs.target, prefs.native) { mutableStateOf<SelectedWord?>(null) }
    var detail by remember(selected) { mutableStateOf<WordDetail?>(null) }
    var lookupError by remember(selected) { mutableStateOf(false) }
    val textColor = MaterialTheme.colorScheme.onSurface
    val statuses = state.courseWords.filter { it.storyId == story.id }.associate { it.word to it.learningStatus() }
    LaunchedEffect(story.id, prefs.target, story.sentences.size, listState) {
        // Clamp restored positions when a downloaded story has been shortened.
        if (listState.firstVisibleItemIndex > story.sentences.size) {
            listState.scrollToItem(story.sentences.size)
        }
        snapshotFlow { (listState.firstVisibleItemIndex - 1).coerceIn(story.sentences.indices) }
            .distinctUntilChanged().collect { paragraph ->
                viewModel.reading(story, prefs.target, paragraph, savedReading?.completed == true)
            }
    }
    LaunchedEffect(selected, prefs.target, prefs.native) {
        selected?.let { word ->
            try { detail = viewModel.lookup(story, word.paragraph, word.text, prefs) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { lookupError = true }
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Reading room", style = MaterialTheme.typography.titleMedium) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back to stories") } })
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Paragraph ${index + 1} of ${story.sentences.size}", style = MaterialTheme.typography.labelLarge)
            LinearProgressIndicator(progress = { (index + 1f) / story.sentences.size }, modifier = Modifier.fillMaxWidth())
        }
        LazyColumn(Modifier.weight(1f).testTag("reader-content"), state = listState,
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            item(key = "heading") {
                Column(Modifier.widthIn(max = 680.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionTitle(story.title(prefs.target), "${story.category} · ${story.level.label}")
                    Text("Tap any word to explore its meaning.", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    VocabularyLegend()
                    OutlinedButton(onClick = { translated = !translated }) {
                        Icon(Icons.Outlined.Translate, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (translated) "Hide translation" else "Translate story")
                    }
                }
            }
            itemsIndexed(story.sentences, key = { paragraph, _ -> "paragraph:$paragraph" }) { paragraph, _ ->
                val text = story.sentence(paragraph, prefs.target)
                val annotated = remember(story.id, paragraph, prefs.target, prefs.native, text, textColor, statuses) {
                    buildAnnotatedString {
                        append(text)
                        Words.tokens(text).forEach { token ->
                            addLink(LinkAnnotation.Clickable(token.text,
                                styles = TextLinkStyles(style = vocabularyStyle(
                                    statuses[Words.key(token.text)] ?: VocabularyStatus.NEW, textColor)),
                                linkInteractionListener = { selected = SelectedWord(token.text, paragraph) }), token.start, token.end)
                        }
                    }
                }
                Column(Modifier.widthIn(max = 680.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(annotated, Modifier.fillMaxWidth().testTag("story-paragraph-$paragraph"),
                        style = TextStyle(fontFamily = FontFamily.Serif, fontSize = prefs.fontSize.sp,
                            lineHeight = (prefs.fontSize * 1.8).sp))
                    AnimatedVisibility(translated) {
                        Text(story.sentence(paragraph, prefs.native), color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            item(key = "finish") {
                Button(onClick = { viewModel.reading(story, prefs.target, story.sentences.lastIndex, true); onBack() },
                    modifier = Modifier.widthIn(max = 680.dp).fillMaxWidth()) { Text("Finish story") }
            }
        }
    }
    if (selected != null) ModalBottomSheet(onDismissRequest = { selected = null }) {
        LazyColumn(modifier = Modifier.testTag("word-details"), contentPadding = PaddingValues(start = 24.dp, end = 24.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(selected!!.text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium)
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
                    VocabularyStatusSelector(state.wordStatus(story.id, word.word)) {
                        viewModel.status(story, word, prefs, it)
                    }
                }
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
