package io.github.cosmoszhan.anisong

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name = "AnisongNeteaseSession")
class AnisongNeteaseSessionPlugin : Plugin() {
    private val worker = Executors.newFixedThreadPool(3)
    private val alias = "anisong.netease.session.v1"
    private val preferences get() = context.getSharedPreferences("netease-session", 0)
    // A separate client keeps NetEase cookies out of WebView's plaintext cookie jar.
    private val http = OkHttpClient.Builder().cookieJar(okhttp3.CookieJar.NO_COOKIES).followRedirects(false).followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS).build()
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias)) return store.getKey(alias, null) as SecretKey
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun background(call: PluginCall, action: () -> Unit) {
        worker.execute { try { action() } catch (_: Exception) { call.reject("无法保存网易云登录状态，请重新登录。") } }
    }
    private fun readCookie(): String {
        val value = preferences.getString("encrypted", null)
        if (value == null) return ""
        return try {
            val bytes = Base64.decode(value, Base64.NO_WRAP)
            require(bytes.size in 29..12288)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
        } catch (_: Exception) {
            preferences.edit().remove("encrypted").commit()
            ""
        }
    }
    @PluginMethod fun read(call: PluginCall) = background(call) { call.resolve(JSObject().put("cookie", readCookie())) }
    @PluginMethod fun request(call: PluginCall) = background(call) {
        val url = call.getString("url") ?: ""
        val uri = java.net.URI(url)
        require(NeteaseNetworkPolicy.allowed(uri)) { "网易云请求来源不受支持。" }
        val method = call.getString("method", "GET")!!.uppercase()
        require(method == "GET" || method == "POST")
        val headers = call.getObject("headers", JSObject())!!
        val builder = Request.Builder().url(url)
        val allowedHeaders = setOf("content-type", "accept", "referer", "range", "user-agent", "x-forwarded-for", "x-real-ip")
        val iterator = headers.keys()
        while (iterator.hasNext()) {
            val name = iterator.next()
            if (name.lowercase() == "cookie") continue
            require(name.lowercase() in allowedHeaders) { "请求包含不受支持的凭据或请求头。" }
            builder.header(name, headers.getString(name) ?: throw IllegalArgumentException("请求头无效。"))
        }
        val stored = readCookie()
        val supplied = headers.optString("cookie", headers.optString("Cookie", ""))
        require(supplied.isEmpty() || uri.host == "music.163.com" && supplied == stored)
        if (uri.host == "music.163.com" && stored.isNotEmpty()) builder.header("Cookie", stored)
        val data = call.getString("data", "")!!
        require(data.length <= 65536)
        if (method == "POST") builder.post(data.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull()))
        http.newCall(builder.build()).execute().use { response ->
            require((response.body?.contentLength() ?: 0) <= 25L * 1024 * 1024) { "返回的文件超过大小限制。" }
            val bytes = ByteArrayOutputStream()
            val probe = headers.optString("range", headers.optString("Range", "")) == "bytes=0-4095"
            response.body?.byteStream()?.use { stream ->
                val buffer = ByteArray(16384)
                while (true) {
                    if (probe && bytes.size() >= 4096) break
                    val count = stream.read(buffer, 0, if (probe) minOf(buffer.size, 4096 - bytes.size()) else buffer.size)
                    if (count < 0) break
                    require(bytes.size() + count <= 25 * 1024 * 1024) { "返回的文件超过大小限制。" }
                    bytes.write(buffer, 0, count)
                }
            }
            val responseHeaders = JSObject()
            for (name in listOf("Content-Type", "Content-Length", "Content-Range", "Location", "Set-Cookie")) {
                if (response.headers.values(name).isNotEmpty()) responseHeaders.put(name, response.headers.values(name).joinToString(", "))
            }
            call.resolve(JSObject().put("status", response.code).put("headers", responseHeaders)
                .put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)).put("url", url))
        }
    }
    @PluginMethod fun write(call: PluginCall) = background(call) {
        val value = call.getString("cookie") ?: ""
        require(value.length in 8..8192 && !value.contains('\r') && !value.contains('\n'))
        require(value.split("; ").all { it.startsWith("MUSIC_U=") || it.startsWith("__csrf=") })
        require(value.split("; ").any { it.startsWith("MUSIC_U=") && it.length > 8 })
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        require(cipher.iv.size == 12)
        val encrypted = Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(preferences.edit().putString("encrypted", encrypted).commit())
        call.resolve()
    }
    @PluginMethod fun clear(call: PluginCall) = background(call) {
        check(preferences.edit().remove("encrypted").commit())
        call.resolve()
    }
    override fun handleOnDestroy() { http.dispatcher.cancelAll(); worker.shutdownNow(); super.handleOnDestroy() }
}
