package com.rolang.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Light = lightColorScheme(
    primary = Color(0xFF286451), onPrimary = Color.White,
    primaryContainer = Color(0xFFDCECE2), onPrimaryContainer = Color(0xFF173E32),
    secondary = Color(0xFF9F513A), secondaryContainer = Color(0xFFFFE3D4),
    background = Color(0xFFF9F7F1), surface = Color(0xFFF9F7F1),
    surfaceContainer = Color(0xFFF0EEE7), surfaceContainerLow = Color(0xFFFFFCF6),
    onSurface = Color(0xFF252D28), onSurfaceVariant = Color(0xFF626B63),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFA6D5B8), primaryContainer = Color(0xFF284D3D),
    secondary = Color(0xFFFFB596), background = Color(0xFF151D18), surface = Color(0xFF151D18),
    surfaceContainer = Color(0xFF253128), surfaceContainerLow = Color(0xFF1D2720),
)
private val Type = Typography(
    headlineLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 36.sp, lineHeight = 42.sp, fontWeight = FontWeight.Medium),
    headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Medium),
    titleLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 23.sp, lineHeight = 28.sp, fontWeight = FontWeight.Medium),
    titleMedium = TextStyle(fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 17.sp, lineHeight = 26.sp),
    bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 23.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
)

@Composable
fun RoLangTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type,
        shapes = Shapes(medium = RoundedCornerShape(18.dp), large = RoundedCornerShape(24.dp)), content = content)
}

@Composable
fun SectionTitle(title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        if (subtitle != null) Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun InfoCard(title: String, text: String, action: String? = null, onClick: () -> Unit = {}) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (action != null) Button(onClick = onClick) { Text(action) }
        }
    }
}
