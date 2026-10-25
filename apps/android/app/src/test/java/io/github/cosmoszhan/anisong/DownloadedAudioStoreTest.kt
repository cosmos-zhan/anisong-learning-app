package io.github.cosmoszhan.anisong

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.security.MessageDigest

class DownloadedAudioStoreTest {
    @Test fun storesVerifiedAudioInPersistentFilesAndReloadsByToken() {
        val root = Files.createTempDirectory("anisong-download").toFile()
        try {
            val bytes = "downloaded audio test".toByteArray()
            val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val target = DownloadedAudioStore.store(root, hash, bytes)
            assertArrayEquals(bytes, DownloadedAudioStore.file(root, hash).readBytes())
            assertEquals(hash, AudioSource.downloadHash("downloaded:$hash"))
            assertTrue(AudioSource.allowed("downloaded:$hash"))
            assertEquals(root.canonicalFile, target.parentFile!!.parentFile.canonicalFile)
        } finally { root.deleteRecursively() }
    }
    @Test fun rejectsWrongDigestAndNeverReplacesExistingBytes() {
        val root = Files.createTempDirectory("anisong-download").toFile()
        try {
            val bytes = "original".toByteArray()
            val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            DownloadedAudioStore.store(root, hash, bytes)
            assertThrows(IllegalArgumentException::class.java) { DownloadedAudioStore.store(root, hash, "changed".toByteArray()) }
            assertArrayEquals(bytes, DownloadedAudioStore.file(root, hash).readBytes())
        } finally { root.deleteRecursively() }
    }
    @Test fun refusesPathsAndRemoteUrisAsDownloadTokens() {
        listOf("downloaded:../song", "downloaded:https://example.org/a", "downloaded:" + "a".repeat(64) + "?x", "downloaded:" + "A".repeat(64)).forEach { assertFalse(AudioSource.allowed(it)) }
    }
}
