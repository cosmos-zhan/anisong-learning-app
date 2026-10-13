package io.github.cosmoszhan.anisong
import kotlin.math.roundToLong
/** All bridge coordinates are original-track seconds; Media3 coordinates are clip milliseconds. */
object ClipCoordinates {
    fun toClipMs(originalSeconds: Double, startSeconds: Double, endSeconds: Double): Long =
        ((originalSeconds - startSeconds).coerceIn(0.0, (endSeconds-startSeconds).coerceAtLeast(0.0))*1000).roundToLong()
    fun toOriginalSeconds(clipMs: Long, startSeconds: Double): Double = startSeconds + clipMs/1000.0
    fun valid(start: Double, end: Double, duration: Double): Boolean =
        start.isFinite() && end.isFinite() && start >= 0 && end <= duration+0.001 && end-start >= 0.15
}
