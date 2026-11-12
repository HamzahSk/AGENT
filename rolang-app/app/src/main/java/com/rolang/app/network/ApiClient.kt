package com.rolang.app.network

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(val status: Int, val code: String) : IOException("Server request failed ($status).")

class ApiClient(private val config: ServerConfig) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(config.connectionTimeoutMs, TimeUnit.MILLISECONDS)
        .readTimeout(config.requestTimeoutMs, TimeUnit.MILLISECONDS)
        .callTimeout(config.requestTimeoutMs, TimeUnit.MILLISECONDS)
        // Authentication must not follow a redirect to a different API host.
        .followRedirects(false).followSslRedirects(false).build()

    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null,
        token: String? = null, query: Map<String, String> = emptyMap()): JSONObject {
        val url = config.apiUrl().newBuilder()
        path.split('/').filter { it.isNotEmpty() }.forEach(url::addPathSegment)
        query.forEach { (key, value) -> url.addQueryParameter(key, value) }
        val builder = Request.Builder().url(url.build()).header("Accept", "application/json")
        if (token != null) builder.header("Authorization", "Bearer $token")
        val payload = body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())
        builder.method(method, if (method in setOf("POST", "PUT")) payload ?: "{}".toRequestBody("application/json".toMediaType()) else null)
        val call = client.newCall(builder.build())
        return suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (!continuation.isCancelled) continuation.resumeWithException(e)
                }
                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        try {
                            val source = response.body?.source()
                            if (source?.request(8_388_609) == true) throw IOException("Server response is too large.")
                            val raw = source?.readUtf8().orEmpty()
                            if (!response.isSuccessful) {
                                val code = runCatching { JSONObject(raw).getJSONObject("error").getString("code") }.getOrDefault("SERVER_ERROR")
                                throw ApiException(response.code, code)
                            }
                            val json = if (response.code == 204) JSONObject() else JSONObject(raw)
                            if (!continuation.isCancelled) continuation.resume(json)
                        } catch (e: Exception) {
                            if (!continuation.isCancelled) continuation.resumeWithException(e)
                        }
                    }
                }
            })
        }
    }
}
