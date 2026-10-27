package io.github.cosmoszhan.anisong

import java.net.URI

object NeteaseNetworkPolicy {
    fun clientKey(uri: URI) = uri.host == "interface.music.163.com" && uri.path == "/api/bsr/sk/get" && uri.rawQuery == null
    fun clientPlayer(uri: URI) = uri.host == "interface3.music.163.com" && uri.path == "/xeapi/song/enhance/player/url/v1" && uri.rawQuery == null
    fun cookie(uri: URI, stored: String, supplied: String, deviceId: String = "", musicU: String = ""): String {
        require(allowed(uri))
        if (clientKey(uri)) {
            require(supplied.matches(Regex("deviceId=[a-f0-9]{32}")) && musicU.isEmpty())
            return supplied
        }
        if (clientPlayer(uri)) {
            val account = stored.split("; ").find { it.startsWith("MUSIC_U=") }?.removePrefix("MUSIC_U=") ?: ""
            require(account.isNotEmpty() && account == musicU && deviceId.matches(Regex("[a-f0-9]{32}")))
            val expected = "$stored; os=android; appver=9.5.61; deviceId=$deviceId"
            require(supplied == expected)
            return expected
        }
        require(musicU.isEmpty() && (supplied.isEmpty() || uri.host == "music.163.com" && supplied == stored))
        return if (uri.host == "music.163.com") stored else ""
    }
    fun allowed(uri: URI): Boolean {
        val host = uri.host ?: return false
        return uri.scheme == "https" && uri.userInfo == null && uri.port == -1 && uri.toString().length <= 4096 &&
            (clientKey(uri) || clientPlayer(uri) || host in setOf("music.163.com", "y.music.163.com", "163cn.tv") ||
                host.matches(Regex("(?:[a-z0-9-]+\\.)*music\\.126\\.net")))
    }
}
