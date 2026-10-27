package io.github.cosmoszhan.anisong

import java.net.URI
import org.junit.Assert.*
import org.junit.Test

class NeteaseNetworkPolicyTest {
    @Test fun clientCredentialsAreRestrictedToTheExactPlayerEndpointAndStoredAccount() {
        val id = "a".repeat(32)
        val stored = "MUSIC_U=fixture; __csrf=fixture"
        val key = URI("https://interface.music.163.com/api/bsr/sk/get")
        val player = URI("https://interface3.music.163.com/xeapi/song/enhance/player/url/v1")
        assertEquals("deviceId=$id", NeteaseNetworkPolicy.cookie(key, stored, "deviceId=$id"))
        val expected = "$stored; os=android; appver=9.5.61; deviceId=$id"
        assertEquals(expected, NeteaseNetworkPolicy.cookie(player, stored, expected, id, "fixture"))
        assertEquals("", NeteaseNetworkPolicy.cookie(URI("https://m801.music.126.net/song.mp3"), stored, ""))
        for (attempt in listOf<() -> Unit>(
            { NeteaseNetworkPolicy.cookie(key, stored, stored) },
            { NeteaseNetworkPolicy.cookie(player, stored, expected, id, "other-account") },
            { NeteaseNetworkPolicy.cookie(URI("https://m801.music.126.net/song.mp3"), stored, stored) }
        )) { try { attempt(); fail("Untrusted account credentials accepted") } catch (_: IllegalArgumentException) {} }
        assertFalse(NeteaseNetworkPolicy.allowed(URI("https://interface3.music.163.com/xeapi/other")))
        assertFalse(NeteaseNetworkPolicy.allowed(URI("https://interface.music.163.com/api/bsr/sk/get?redirect=evil")))
    }
    @Test fun acceptsOnlyExactHttpsNetEaseAndMusicCdnHosts() {
        for (url in listOf("https://music.163.com/weapi/test", "https://y.music.163.com/m/song?id=1", "https://163cn.tv/test", "https://m801.music.126.net/song.mp3"))
            assertTrue(NeteaseNetworkPolicy.allowed(URI(url)))
    }
    @Test fun rejectsPrivateNetworksLookalikesCredentialsAndOtherSchemes() {
        for (url in listOf("http://music.163.com/api", "https://music.163.com.evil.test/api", "https://127.0.0.1/a", "https://169.254.169.254/a", "https://private@music.163.com/a", "https://music.163.com:444/a", "file:///private"))
            assertFalse(NeteaseNetworkPolicy.allowed(URI(url)))
    }
}
