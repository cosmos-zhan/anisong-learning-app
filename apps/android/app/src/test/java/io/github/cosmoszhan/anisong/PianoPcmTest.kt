package io.github.cosmoszhan.anisong

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

class PianoPcmTest {
    @Test fun validatesUntrustedNotesAndBounds() {
        assertFalse(PianoPcm.valid(listOf(PianoTone(0.0, 1.0, 128)), 1.0))
        assertFalse(PianoPcm.valid(listOf(PianoTone(Double.NaN, 1.0, 60)), 1.0))
        assertFalse(PianoPcm.valid(listOf(PianoTone(0.0, 2.0, 60)), 1.0))
        assertFalse(PianoPcm.valid(emptyList(), 1801.0))
        assertTrue(PianoPcm.valid(listOf(PianoTone(0.0, 1.0, 60)), 1.0))
    }
    @Test fun rendersRealPcmWithBoundedPeaksAndSmoothEndpoints() {
        val file = File.createTempFile("piano-test", ".wav")
        try {
            // Dense, phase-aligned repeated notes stress the output limiter.
            PianoPcm.write(file, List(64) { PianoTone(0.1, 0.3, 69) }, 0.5)
            val bytes = file.readBytes()
            assertEquals("RIFF", String(bytes.copyOfRange(0, 4)))
            assertEquals(44 + 12000 * 2, bytes.size)
            val buffer = ByteBuffer.wrap(bytes, 44, bytes.size - 44).order(ByteOrder.LITTLE_ENDIAN)
            val samples = ShortArray(12000) { buffer.short }
            val peak = samples.maxOf { abs(it.toInt()) }
            assertTrue("actual waveform must be audible", peak > 500)
            assertTrue("absolute peak < 0.56 full scale", peak < 32767 * 0.56)
            assertEquals(0, samples.first().toInt()); assertEquals(0, samples.last().toInt())
            assertEquals(0, samples[(0.4 * PianoPcm.RATE).toInt()].toInt())
        } finally { file.delete() }
    }
    @Test fun cancelsRenderingAndNeverReturnsSuccess() {
        val file = File.createTempFile("piano-cancel", ".wav")
        try {
            assertThrows(InterruptedException::class.java) {
                PianoPcm.write(file, listOf(PianoTone(0.0, 1.0, 60)), 1.0) { true }
            }
        } finally { file.delete() }
    }
    @Test fun envelopeHasNoAbruptAttackOrNoteOff() {
        assertEquals(0.0, PianoPcm.envelope(0.0, 0.5), 0.0)
        assertEquals(0.0, PianoPcm.envelope(0.5, 0.5), 0.0)
        assertTrue(PianoPcm.envelope(0.00001, 0.5) < 0.0001)
        assertTrue(PianoPcm.envelope(0.49999, 0.5) < 0.0001)
    }
}
