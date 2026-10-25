package io.github.cosmoszhan.anisong

import org.junit.Assert.*
import org.junit.Test

class UpdatePolicyTest {
    private val url = "https://github.com/cosmos-zhan/anisong-learning-app/releases/download/v0.6.0-alpha.1/anisong-0.6.0-alpha.1-debug.apk"
    private val hash = "a".repeat(64)
    @Test fun restrictsReleaseAndRedirectHosts() {
        assertTrue(UpdatePolicy.releaseUrl(url))
        for (bad in listOf(url.replace("https:", "http:"), url + "?token=x", url.replace("github.com", "github.com.evil.test"), url.replace("cosmos-zhan", "other")))
            assertFalse(UpdatePolicy.releaseUrl(bad))
        assertTrue(UpdatePolicy.redirectUrl("https://release-assets.githubusercontent.com/a?signature=x"))
        assertFalse(UpdatePolicy.redirectUrl("https://evil.test/a"))
        assertFalse(UpdatePolicy.redirectUrl("https://user@github.com/a"))
    }
    @Test fun refusesDowngradeMismatchAndUnboundedDownloads() {
        UpdatePolicy.validateRequest(url, hash, 10000000, 6, hash, 5, hash)
        for (action in listOf<() -> Unit>(
            { UpdatePolicy.validateRequest(url, hash, 100, 4, hash, 5, hash) },
            { UpdatePolicy.validateRequest(url, hash, UpdatePolicy.MAX_APK + 1, 6, hash, 5, hash) },
            { UpdatePolicy.validateRequest(url, hash, 100, 6, "b".repeat(64), 5, hash) },
            { UpdatePolicy.validateArchive("other.app", 6, hash, 6, hash) },
            { UpdatePolicy.validateArchive(UpdatePolicy.PACKAGE, 7, hash, 6, hash) },
            { UpdatePolicy.validateArchive(UpdatePolicy.PACKAGE, 6, "b".repeat(64), 6, hash) }
        )) {
            try { action(); fail("Unsafe update was accepted") } catch (_: IllegalArgumentException) { }
        }
        UpdatePolicy.validateArchive(UpdatePolicy.PACKAGE, 6, hash, 6, hash)
    }
}
