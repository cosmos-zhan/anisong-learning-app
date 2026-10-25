package io.github.cosmoszhan.anisong

import java.net.URI
import org.junit.Assert.*
import org.junit.Test

class NeteaseNetworkPolicyTest {
    @Test fun acceptsOnlyExactHttpsNetEaseAndMusicCdnHosts() {
        for (url in listOf("https://music.163.com/weapi/test", "https://y.music.163.com/m/song?id=1", "https://163cn.tv/test", "https://m801.music.126.net/song.mp3"))
            assertTrue(NeteaseNetworkPolicy.allowed(URI(url)))
    }
    @Test fun rejectsPrivateNetworksLookalikesCredentialsAndOtherSchemes() {
        for (url in listOf("http://music.163.com/api", "https://music.163.com.evil.test/api", "https://127.0.0.1/a", "https://169.254.169.254/a", "https://private@music.163.com/a", "https://music.163.com:444/a", "file:///private"))
            assertFalse(NeteaseNetworkPolicy.allowed(URI(url)))
    }
}
