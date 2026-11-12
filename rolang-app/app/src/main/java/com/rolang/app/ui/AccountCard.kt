package com.rolang.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.rolang.app.network.OnlineState

@Composable
fun AccountCard(state: OnlineState, authenticate: (String, String, String?) -> Unit,
    synchronize: () -> Unit, logout: () -> Unit) {
    Card {
        Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Online library", style = MaterialTheme.typography.titleLarge)
            Text(state.message)
            if (state.enabled) {
                if (state.signedIn) {
                    Text("Signed in as ${state.displayName}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = synchronize, enabled = !state.busy) { Text("Sync now") }
                        OutlinedButton(onClick = logout, enabled = !state.busy) { Text("Sign out") }
                    }
                } else {
                    var email by remember { mutableStateOf("") }
                    // Account fields are deliberately excluded from saved-instance state.
                    var password by remember { mutableStateOf("") }
                    var name by remember { mutableStateOf("") }
                    var register by remember { mutableStateOf(false) }
                    OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth())
                    if (register) OutlinedTextField(name, { name = it }, label = { Text("Display name") },
                        singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            authenticate(email, password, if (register) name else null)
                            password = ""
                        }, enabled = !state.busy && email.isNotBlank() && password.length in 12..128 && (!register || name.isNotBlank())) {
                            Text(if (register) "Create account" else "Sign in")
                        }
                        TextButton(onClick = { register = !register }, enabled = !state.busy) { Text(if (register) "Use existing account" else "Register") }
                    }
                    OutlinedButton(onClick = synchronize, enabled = !state.busy) { Text("Refresh stories") }
                }
                if (state.busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
