package io.github.cosmoszhan.anisong

import java.net.URI
import java.security.MessageDigest

/** Shared by the bridge and JVM tests; never accept an arbitrary download host. */
object UpdatePolicy {
    const val PACKAGE = "io.github.cosmoszhan.anisong"
    const val REPOSITORY = "cosmos-zhan/anisong-learning-app"
    const val MAX_APK = 150L * 1024 * 1024
    private const val VERSION = "v[0-9]+\\.[0-9]+\\.[0-9]+(?:-(?:alpha|beta|rc)\\.[0-9]+)?"
    fun releaseUrl(value: String, metadata: Boolean = false): Boolean = runCatching {
        val url = URI(value)
        val file = if (metadata) "build-info\\.json" else "anisong-[0-9]+\\.[0-9]+\\.[0-9]+(?:-(?:alpha|beta|rc)\\.[0-9]+)?-debug\\.apk"
        url.scheme == "https" && url.host == "github.com" && url.port == -1 && url.rawUserInfo == null &&
            url.rawQuery == null && url.rawFragment == null &&
            Regex("/$REPOSITORY/releases/download/$VERSION/$file").matches(url.rawPath)
    }.getOrDefault(false)
    fun redirectUrl(value: String): Boolean = runCatching {
        val url = URI(value)
        url.scheme == "https" && url.port == -1 && url.rawUserInfo == null && url.rawFragment == null &&
            url.host in setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")
    }.getOrDefault(false)
    fun validateRequest(url: String, hash: String, bytes: Long, versionCode: Long, signer: String, installedCode: Long, installedSigner: String) {
        require(releaseUrl(url)) { "安装包地址无效。" }
        require(Regex("[a-f0-9]{64}").matches(hash) && bytes in 1..MAX_APK) { "安装包校验信息无效。" }
        require(versionCode > installedCode) { "该安装包不是更新版本。" }
        require(signer == installedSigner && Regex("[a-f0-9]{64}").matches(signer)) { "安装包签名不同，无法覆盖更新。" }
    }
    fun validateArchive(packageName: String, versionCode: Long, signer: String, expectedCode: Long, installedSigner: String) {
        require(packageName == PACKAGE && versionCode == expectedCode) { "安装包的包名或版本不一致。" }
        require(signer == installedSigner) { "安装包签名不同，无法覆盖更新。" }
    }
    fun cachedIsInstallable(hash: String, code: Long, installedCode: Long, bytes: Long, fileBytes: Long): Boolean =
        Regex("[a-f0-9]{64}").matches(hash) && code > installedCode && bytes in 1..MAX_APK && bytes == fileBytes
    fun digest(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
