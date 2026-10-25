package io.github.cosmoszhan.anisong

/** Only audio assets shipped with this application may be opened by the bridge. */
object AudioSource {
    private const val prefix = "file:///android_asset/"
    private val recording = Regex("public/private-media/haruhikage-crychic-[0-9a-f]{12}\\.mp3")

    fun assetPath(source: String): String? {
        if (!source.startsWith(prefix)) return null
        val path = source.removePrefix(prefix)
        return path.takeIf { it == "public/demo/demo.wav" || recording.matches(it) }
    }

    fun allowed(source: String): Boolean =
        (source.startsWith("content://") && source.length > "content://".length) || assetPath(source) != null || downloadHash(source) != null
    fun downloadHash(source: String): String? =
        source.removePrefix("downloaded:").takeIf { source.startsWith("downloaded:") && Regex("[a-f0-9]{64}").matches(it) }
}
