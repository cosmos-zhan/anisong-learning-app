package io.github.cosmoszhan.anisong

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

@CapacitorPlugin(name = "AnisongUpdates")
class AnisongUpdatesPlugin : Plugin() {
    private val worker = Executors.newFixedThreadPool(2)
    private val generation = AtomicLong()
    private data class Progress(val state: String = "idle", val received: Long = 0, val total: Long = 0, val error: String? = null)
    @Volatile private var progress = Progress()
    @Volatile private var activeConnection: java.net.HttpURLConnection? = null
    private val directory get() = File(context.cacheDir, "updates").apply { mkdirs() }
    private val readyFile get() = File(directory, "update.apk")
    private val preferences get() = context.getSharedPreferences("anisong-update", 0)
    private fun signingFlags() = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    @Suppress("DEPRECATION")
    private fun installedInfo() = context.packageManager.getPackageInfo(context.packageName, signingFlags())
    @Suppress("DEPRECATION")
    private fun signer(info: PackageInfo): String {
        val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
        require(signatures?.size == 1) { "无法识别当前安装包的签名。" }
        return UpdatePolicy.digest(signatures!![0].toByteArray())
    }
    private fun background(call: PluginCall, action: () -> Unit) {
        worker.execute { try { action() } catch (e: Exception) { call.reject(e.message ?: "更新操作失败。") } }
    }
    @PluginMethod fun installed(call: PluginCall) = background(call) {
        val info = installedInfo()
        call.resolve(JSObject().put("version", info.versionName).put("versionCode", PackageInfoCompat.getLongVersionCode(info)).put("signerSha256", signer(info)))
    }
    // HTTPS only, bounded redirects, no credentials; metadata and APK use the same transport policy.
    private fun open(value: String): java.net.HttpURLConnection {
        var url = URL(value)
        repeat(6) {
            val connection = url.openConnection() as java.net.HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000; connection.readTimeout = 20000
            connection.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream")
            val code = connection.responseCode
            if (code in listOf(301, 302, 303, 307, 308)) {
                val location = connection.getHeaderField("Location")
                connection.disconnect()
                require(!location.isNullOrBlank()) { "下载地址重定向无效。" }
                url = URL(url, location)
                require(UpdatePolicy.redirectUrl(url.toString())) { "下载地址跳转到了不受支持的服务。" }
            } else {
                if (code != 200) { connection.disconnect(); error(if (code == 403 || code == 429) "更新服务暂时受限，请稍后重试。" else "更新服务暂不可用（HTTP $code）。") }
                return connection
            }
        }
        error("下载地址重定向次数过多。")
    }
    private fun json(value: String, limit: Int): String {
        val connection = open(value)
        try {
            return connection.inputStream.use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer); if (count < 0) break
                    require(output.size() + count <= limit) { "更新信息过大。" }
                    output.write(buffer, 0, count)
                }
                output.toString("UTF-8")
            }
        } finally { connection.disconnect() }
    }
    @PluginMethod fun releases(call: PluginCall) = background(call) {
        val value = json("https://api.github.com/repos/${UpdatePolicy.REPOSITORY}/releases?per_page=100", 2 * 1024 * 1024)
        call.resolve(JSObject().put("releases", JSONArray(value)))
    }
    @PluginMethod fun buildInfo(call: PluginCall) = background(call) {
        val url = call.getString("url") ?: error("缺少更新地址。")
        require(UpdatePolicy.releaseUrl(url, true)) { "更新信息地址无效。" }
        call.resolve(JSObject().put("info", JSONObject(json(url, 64 * 1024))))
    }
    @Synchronized @PluginMethod fun download(call: PluginCall) {
        try {
            require(progress.state !in listOf("downloading", "verifying")) { "已有安装包正在下载。" }
            val url = call.getString("url") ?: error("缺少安装包地址。")
            val hash = call.getString("sha256") ?: ""
            val bytes = call.getDouble("bytes")?.toLong() ?: 0L
            val code = call.getDouble("versionCode")?.toLong() ?: 0L
            val expectedSigner = call.getString("signerSha256") ?: ""
            val info = installedInfo()
            UpdatePolicy.validateRequest(url, hash, bytes, code, expectedSigner, PackageInfoCompat.getLongVersionCode(info), signer(info))
            val task = generation.incrementAndGet()
            preferences.edit().clear().apply(); readyFile.delete()
            progress = Progress("downloading", 0, bytes)
            worker.execute { downloadFile(task, url, hash, bytes, code) }
            call.resolve()
        } catch (e: Exception) { call.reject(e.message ?: "无法开始下载更新。") }
    }
    private fun downloadFile(task: Long, url: String, hash: String, bytes: Long, code: Long) {
        val partial = File(directory, "update-$task.part")
        var connection: java.net.HttpURLConnection? = null
        try {
            fun current() { check(generation.get() == task) { "下载已取消。" } }
            current(); val downloadConnection = open(url); connection = downloadConnection
            synchronized(this) { current(); activeConnection = downloadConnection }
            var received = 0L
            val digest = MessageDigest.getInstance("SHA-256")
            downloadConnection.inputStream.use { input -> partial.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    current(); val count = input.read(buffer); if (count < 0) break
                    received += count; require(received <= bytes) { "安装包超过声明大小，已停止下载。" }
                    output.write(buffer, 0, count); digest.update(buffer, 0, count)
                    synchronized(this) { current(); progress = Progress("downloading", received, bytes) }
                }
            } }
            current(); require(received == bytes) { "安装包下载不完整，请重试。" }
            require(digest.digest().joinToString("") { "%02x".format(it) } == hash) { "安装包文件校验失败，请重试。" }
            synchronized(this) { current(); progress = Progress("verifying", received, bytes) }
            validateApk(partial, code)
            synchronized(this) {
                current(); check(partial.renameTo(readyFile)) { "无法保存安装包，请检查剩余空间。" }
                preferences.edit().putString("hash", hash).putLong("bytes", bytes).putLong("code", code).apply()
                progress = Progress("ready", bytes, bytes)
            }
        } catch (e: Exception) {
            synchronized(this) { if (generation.get() == task) progress = Progress("error", 0, bytes,
                if(e is java.io.IOException) "安装包下载失败，请检查网络后重试。" else e.message ?: "安装包下载失败，请重试。") }
        } finally { partial.delete(); connection?.disconnect(); if (generation.get() == task) activeConnection = null }
    }
    @Suppress("DEPRECATION")
    private fun validateApk(file: File, code: Long) {
        val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, signingFlags()) ?: error("下载文件不是有效的 Android 安装包。")
        UpdatePolicy.validateArchive(archive.packageName, PackageInfoCompat.getLongVersionCode(archive), signer(archive), code, signer(installedInfo()))
        require(code > PackageInfoCompat.getLongVersionCode(installedInfo())) { "该版本已经安装，请重新检查更新。" }
    }
    @Synchronized @PluginMethod fun status(call: PluginCall) {
        try {
            var snapshot = progress
            val hash = preferences.getString("hash", "") ?: ""
            val bytes = preferences.getLong("bytes", 0)
            val code = preferences.getLong("code", 0)
            if (snapshot.state == "ready" || snapshot.state == "idle" && (readyFile.isFile || preferences.contains("hash"))) {
                val installedCode = PackageInfoCompat.getLongVersionCode(installedInfo())
                if (readyFile.isFile && UpdatePolicy.cachedIsInstallable(hash, code, installedCode, bytes, readyFile.length())) {
                    snapshot = Progress("ready", bytes, bytes)
                } else {
                    preferences.edit().clear().apply()
                    readyFile.delete()
                    snapshot = Progress()
                    progress = snapshot
                }
            }
            val result = JSObject().put("state", snapshot.state).put("received", snapshot.received).put("total", snapshot.total).put("error", snapshot.error)
            if (snapshot.state == "ready") result.put("sha256", hash).put("versionCode", code)
            call.resolve(result)
        } catch (_: Exception) { call.reject("无法读取安装包状态，请重试。") }
    }
    @Synchronized @PluginMethod fun cancel(call: PluginCall) {
        generation.incrementAndGet(); activeConnection?.disconnect(); activeConnection = null
        progress = Progress("cancelled"); preferences.edit().clear().apply(); readyFile.delete(); call.resolve()
    }
    @PluginMethod fun install(call: PluginCall) = background(call) {
        require(readyFile.isFile && preferences.contains("hash")) { "请先下载安装包。" }
        val digest = MessageDigest.getInstance("SHA-256")
        readyFile.inputStream().use { input -> val buffer = ByteArray(64 * 1024); while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) } }
        require(readyFile.length() == preferences.getLong("bytes", 0) && digest.digest().joinToString("") { "%02x".format(it) } == preferences.getString("hash", "")) { "安装包已损坏，请重新下载。" }
        validateApk(readyFile, preferences.getLong("code", 0))
        activity.runOnUiThread {
            try {
                if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
                    call.resolve(JSObject().put("permissionRequired", true))
                } else {
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", readyFile)
                    activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                    call.resolve(JSObject().put("permissionRequired", false))
                }
            } catch (_: Exception) { call.reject("无法打开系统安装窗口。请稍后重试。") }
        }
    }
    override fun handleOnDestroy() {
        generation.incrementAndGet(); activeConnection?.disconnect(); worker.shutdownNow(); super.handleOnDestroy()
    }
}
