package io.github.cosmoszhan.anisong

import org.junit.Assert.*
import org.junit.Test

class AudioSourceTest {
    @Test fun acceptsShippedRecordingAndOriginalDemo() {
        val path = "public/private-media/haruhikage-crychic-012345abcdef.mp3"
        assertEquals(path, AudioSource.assetPath("file:///android_asset/$path"))
        assertTrue(AudioSource.allowed("file:///android_asset/$path"))
        assertEquals("public/demo/demo.wav", AudioSource.assetPath("file:///android_asset/public/demo/demo.wav"))
    }

    @Test fun documentPickerUrisRemainSupported() {
        assertTrue(AudioSource.allowed("content://com.android.providers.media.documents/document/audio%3A12"))
        assertNull(AudioSource.assetPath("content://provider/song.mp3"))
        assertFalse(AudioSource.allowed("content://"))
    }

    @Test fun refusesOtherAssetsTraversalAndRemoteSources() {
        listOf(
            "file:///etc/passwd",
            "https://example.org/song.mp3",
            "file:///android_asset/public/private-media/../demo/demo.wav",
            "file:///android_asset/public/private-media/haruhikage-crychic-not-a-hash.mp3",
            "file:///android_asset/public/private-media/haruhikage-crychic-012345abcdef.mxl",
            "file:///android_asset/public/private-media/haruhikage-crychic-012345abcdef.mp3?x=1",
        ).forEach { assertFalse(it, AudioSource.allowed(it)) }
    }
}
