package io.github.cosmoszhan.anisong

import java.io.File
import java.security.MessageDigest

/** Persistent app data; addressed by content hash, never by a caller path. */
object DownloadedAudioStore {
    const val MAX_BYTES = 30 * 1024 * 1024
    fun file(root: File, hash: String): File {
        require(Regex("[a-f0-9]{64}").matches(hash))
        return File(File(root, "downloaded-audio"), "$hash.audio")
    }
    fun store(root: File, hash: String, bytes: ByteArray): File {
        require(bytes.isNotEmpty() && bytes.size <= MAX_BYTES)
        require(MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) } == hash)
        val target = file(root, hash)
        target.parentFile!!.mkdirs()
        val pending = File.createTempFile("pending-", ".audio", target.parentFile)
        try {
            pending.outputStream().use { it.write(bytes); it.flush() }
            check(pending.renameTo(target))
            return target
        } finally { pending.delete() }
    }
}
