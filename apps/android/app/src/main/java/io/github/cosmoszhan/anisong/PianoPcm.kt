package io.github.cosmoszhan.anisong

import java.io.File
import java.io.OutputStream
import kotlin.math.*

data class PianoTone(val at: Double, val duration: Double, val midi: Int)
/** Streaming synthesis: bounded memory, zero attack/release endpoints, no
 * aliased partials, absolute output ceiling. No WebView timer drives playback. */
object PianoPcm {
    const val RATE = 24000
    fun valid(notes: List<PianoTone>, duration: Double) = duration.isFinite() &&
        duration > 0 && duration <= 1800 && notes.size <= 20000 && notes.all {
            it.at.isFinite() && it.duration.isFinite() && it.at >= 0 &&
                it.duration > 0 && it.at + it.duration <= duration + 0.001 && it.midi in 0..127
        }
    fun envelope(age: Double, held: Double): Double {
        if (age <= 0 || age >= held) return 0.0
        val attack = min(1.0, age / 0.008)
        val release = min(1.0, (held - age) / min(0.08, held / 2))
        return 0.075 * attack * release * exp(-max(0.0, age - 0.008) * 3.5)
    }
    fun write(file: File, notes: List<PianoTone>, duration: Double, cancelled: () -> Boolean = { false }) {
        require(valid(notes, duration))
        val frames = ceil(duration * RATE).toInt()
        val ordered = notes.sortedBy { it.at }
        val active = mutableListOf<PianoTone>()
        var next = 0
        file.outputStream().buffered().use { out ->
            out.write("RIFF".toByteArray()); le(out, 36 + frames * 2, 4)
            out.write("WAVEfmt ".toByteArray()); le(out, 16, 4)
            le(out, 1, 2); le(out, 1, 2); le(out, RATE, 4); le(out, RATE * 2, 4)
            le(out, 2, 2); le(out, 16, 2); out.write("data".toByteArray()); le(out, frames * 2, 4)
            for (frame in 0 until frames) {
                if (frame % 1024 == 0 && cancelled()) throw InterruptedException("Cancelled")
                val time = frame.toDouble() / RATE
                while (next < ordered.size && ordered[next].at <= time) active.add(ordered[next++])
                active.removeAll { it.at + it.duration <= time }
                var sample = 0.0
                for (note in active) {
                    val age = time - note.at
                    val hz = 440 * 2.0.pow((note.midi - 69) / 12.0)
                    var tone = sin(2 * PI * hz * age)
                    if (hz * 2 < RATE / 2) tone += 0.22 * sin(4 * PI * hz * age)
                    if (hz * 3 < RATE / 2) tone += 0.08 * sin(6 * PI * hz * age)
                    sample += envelope(age, note.duration) * tone
                }
                val bounded = 0.55 * tanh(0.8 * sample / 0.55)
                le(out, (bounded * 32767).roundToInt(), 2)
            }
        }
    }
    private fun le(out: OutputStream, value: Int, bytes: Int) {
        repeat(bytes) { out.write((value ushr (8 * it)) and 255) }
    }
}
