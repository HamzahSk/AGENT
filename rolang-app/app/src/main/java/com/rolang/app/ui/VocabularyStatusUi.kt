package com.rolang.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import com.rolang.app.domain.VocabularyStatus

/** Shared, high-contrast colors for reading, vocabulary, and practice in both themes. */
fun vocabularyStyle(status: VocabularyStatus, textColor: Color): SpanStyle = when (status) {
    VocabularyStatus.NEW -> SpanStyle(color = Color(0xFF174A8B), background = Color(0xFFDCEBFF))
    VocabularyStatus.LEARNING -> SpanStyle(color = Color(0xFF14532D), background = Color(0xFFDCF5E2))
    VocabularyStatus.ALMOST_MASTERED -> SpanStyle(color = Color(0xFF654900), background = Color(0xFFFFF0AD))
    VocabularyStatus.KNOWN -> SpanStyle(color = textColor, background = Color.Transparent)
}

@Composable
fun VocabularyStatusLabel(status: VocabularyStatus) {
    val style = vocabularyStyle(status, MaterialTheme.colorScheme.onSurface)
    Surface(color = style.background, contentColor = style.color, shape = MaterialTheme.shapes.small) {
        Text(status.label, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VocabularyLegend() {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        VocabularyStatus.entries.forEach { VocabularyStatusLabel(it) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VocabularyStatusSelector(status: VocabularyStatus, onChange: (VocabularyStatus) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Learning status: ${status.label}", style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            VocabularyStatus.entries.forEach { value ->
                val style = vocabularyStyle(value, MaterialTheme.colorScheme.onSurface)
                FilterChip(selected = status == value, onClick = { onChange(value) }, label = { Text(value.label) },
                    colors = FilterChipDefaults.filterChipColors(containerColor = style.background, labelColor = style.color,
                        selectedContainerColor = style.background, selectedLabelColor = style.color))
            }
        }
        Text(if (status == VocabularyStatus.KNOWN) "Known words have no highlight and are paused in review."
            else "Saved on this device. Practice will adapt the status and next review.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
