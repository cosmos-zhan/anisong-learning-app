package io.github.cosmoszhan.anisong
import org.junit.Assert.*
import org.junit.Test
class ClipCoordinatesTest {
    @Test fun originalTrackCoordinatesSurviveClip() {
        assertEquals(1700L, ClipCoordinates.toClipMs(18.0,16.3,21.1))
        assertEquals(18.0,ClipCoordinates.toOriginalSeconds(1700,16.3),0.00001)
        assertEquals(0L,ClipCoordinates.toClipMs(-1.0,16.3,21.1))
        assertEquals(4800L,ClipCoordinates.toClipMs(30.0,16.3,21.1))
    }
    @Test fun rangeRejectsInvalidClip() {
        assertTrue(ClipCoordinates.valid(16.3,21.1,35.5))
        assertFalse(ClipCoordinates.valid(16.3,16.31,35.5))
        assertFalse(ClipCoordinates.valid(-1.0,21.1,35.5))
        assertFalse(ClipCoordinates.valid(16.3,40.0,35.5))
    }
}
