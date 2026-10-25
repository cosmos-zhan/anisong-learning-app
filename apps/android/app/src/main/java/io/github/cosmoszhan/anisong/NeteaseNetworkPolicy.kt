package io.github.cosmoszhan.anisong

import java.net.URI

object NeteaseNetworkPolicy {
    fun allowed(uri: URI): Boolean {
        val host = uri.host ?: return false
        return uri.scheme == "https" && uri.userInfo == null && uri.port == -1 && uri.toString().length <= 4096 &&
            (host in setOf("music.163.com", "y.music.163.com", "163cn.tv") ||
                host.matches(Regex("(?:[a-z0-9-]+\\.)*music\\.126\\.net")))
    }
}
