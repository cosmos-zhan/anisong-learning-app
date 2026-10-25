package io.github.cosmoszhan.anisong

import android.app.Activity
import android.content.Intent
import android.content.ComponentName
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.media3.common.MediaMetadata
import androidx.core.content.ContextCompat
import com.google.common.util.concurrent.ListenableFuture
import java.io.File
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors
import kotlin.math.roundToLong

@UnstableApi
@CapacitorPlugin(name = "AnisongAudio")
class AnisongAudioPlugin : Plugin() {
    private lateinit var player: MediaController
    private lateinit var connection: ListenableFuture<MediaController>
    private var kind = "lyrics"
    private var pianoRounds = 0
    private var pianoFile: File? = null
    private val handler = Handler(Looper.getMainLooper())
    private val metadataWorker = Executors.newSingleThreadExecutor()
    private var uri: Uri? = null
    private var duration = 0.0
    private var start = 0.0
    private var end = 0.0
    @Volatile private var loadRevision = 0
    @Volatile private var destroyed = false
    private var pendingLoad: PluginCall? = null
    private val ticker = object : Runnable {
        override fun run() {
            if (destroyed) return
            if (::player.isInitialized && uri != null) {
                val position = if (kind == "piano") player.currentPosition / 1000.0 else ClipCoordinates.toOriginalSeconds(player.currentPosition, start)
                emit(JSObject().put("type", "position").put("position", position).put("rounds", pianoRounds))
            }
            handler.postDelayed(this, 60)
        }
    }
    override fun load() {
        connection = MediaController.Builder(context, SessionToken(context,
            ComponentName(context, PlaybackService::class.java))).buildAsync()
        connection.addListener({
            if (destroyed) return@addListener
            try {
                player = connection.get()
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Buffering does not mean that the user has paused.
                emit(JSObject().put("type", "playing").put("playing", player.playWhenReady))
            }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                emit(JSObject().put("type", "playing").put("playing", playWhenReady))
            }
            override fun onPlaybackSuppressionReasonChanged(reason: Int) {
                if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) player.pause()
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) emit(JSObject().put("type", "end"))
            }
            override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) {
                    ++pianoRounds
                    emit(JSObject().put("type", "loop").put("rounds", pianoRounds))
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                emit(JSObject().put("type", "error").put("code", "NATIVE"))
            }
        })
                handler.post(ticker)
            } catch (_: Exception) { emit(JSObject().put("type", "error").put("code", "NATIVE")) }
        }, ContextCompat.getMainExecutor(context))
    }
    private fun emit(event: JSObject) { notifyListeners(if (kind == "piano") "pianoEvent" else "audioEvent", event) }
    private fun main(call: PluginCall, action: () -> Unit) {
        connection.addListener({
            try {
                if (destroyed || !::player.isInitialized) call.reject("NATIVE") else action()
            } catch (_: Exception) { call.reject("NATIVE") }
        }, ContextCompat.getMainExecutor(context))
    }
    @PluginMethod
    fun storeAudio(call: PluginCall) {
        val encoded = call.getString("base64") ?: return call.reject("LOAD")
        val hash = call.getString("sha256") ?: return call.reject("LOAD")
        if (encoded.length > 42 * 1024 * 1024) return call.reject("LOAD")
        metadataWorker.execute {
            try {
                val bytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT)
                DownloadedAudioStore.store(context.filesDir, hash, bytes)
                call.resolve(JSObject().put("source", "downloaded:$hash"))
            } catch (_: Exception) { call.reject("LOAD") }
        }
    }
    private fun metadata(title: String) = MediaMetadata.Builder().setTitle(title)
        .setArtist("Anisong Learning").build()
    @PluginMethod
    fun load(call: PluginCall) = main(call) {
        val source = call.getString("source") ?: return@main call.reject("LOAD")
        if (!AudioSource.allowed(source)) return@main call.reject("LOAD")
        val assetPath = AudioSource.assetPath(source)
        val downloaded = AudioSource.downloadHash(source)?.let { DownloadedAudioStore.file(context.filesDir, it) }
        if (downloaded != null && !downloaded.isFile) return@main call.reject("LOAD")
        val next = if (downloaded != null) Uri.fromFile(downloaded) else Uri.parse(source)
        val revision = ++loadRevision
        kind = "lyrics"
        pendingLoad?.reject("LOAD")
        pendingLoad = call
        player.pause(); player.stop(); player.clearMediaItems(); uri = null
        metadataWorker.execute {
            val length = try {
                val retriever = MediaMetadataRetriever()
                try {
                    if (assetPath != null) {
                        context.assets.openFd(assetPath).use { retriever.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
                    } else retriever.setDataSource(context, next)
                    (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0)/1000.0
                } finally { retriever.release() }
            } catch (_: Exception) { 0.0 }
            handler.post {
                if (destroyed || revision != loadRevision) return@post
                pendingLoad = null
                if (length <= 0) { call.reject("LOAD"); return@post }
                uri = next; duration = length; start = 0.0; end = length
                player.setMediaItem(MediaItem.Builder().setUri(next).setMediaMetadata(metadata("歌词学唱")).build()); player.prepare()
                call.resolve(JSObject().put("duration", length))
            }
        }
    }
    @PluginMethod
    fun setRange(call: PluginCall) = main(call) {
        val a = call.getDouble("start") ?: return@main call.reject("NATIVE")
        val b = call.getDouble("end") ?: return@main call.reject("NATIVE")
        if (uri == null || !ClipCoordinates.valid(a, b, duration)) return@main call.reject("NATIVE")
        val repeat = call.getBoolean("loop", true) ?: true
        if (start != a || end != b) {
            val original = ClipCoordinates.toOriginalSeconds(player.currentPosition, start)
            val resume = player.playWhenReady
            start = a; end = b
            val clip = MediaItem.ClippingConfiguration.Builder().setStartPositionMs((a*1000).roundToLong()).setEndPositionMs((b*1000).roundToLong()).build()
            player.setMediaItem(MediaItem.Builder().setUri(uri!!).setMediaMetadata(metadata("歌词片段循环")).setClippingConfiguration(clip).build(), ClipCoordinates.toClipMs(original, a, b))
            player.prepare(); player.playWhenReady = resume
        }
        player.repeatMode = if (repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        call.resolve()
    }
    @PluginMethod
    fun setSpeed(call: PluginCall) = main(call) {
        val speed = call.getDouble("speed") ?: return@main call.reject("NATIVE")
        if (speed !in listOf(0.5, 0.75, 1.0)) return@main call.reject("NATIVE")
        player.playbackParameters = PlaybackParameters(speed.toFloat(), 1f); call.resolve()
    }
    @PluginMethod fun play(call: PluginCall) = main(call) { if (uri == null) call.reject("NATIVE") else { player.play(); call.resolve() } }
    @PluginMethod fun pause(call: PluginCall) = main(call) { player.pause(); call.resolve() }
    @PluginMethod fun seek(call: PluginCall) = main(call) {
        val position = call.getDouble("position") ?: return@main call.reject("NATIVE")
        player.seekTo(ClipCoordinates.toClipMs(position, start, end)); call.resolve()
    }
    @PluginMethod
    fun playPiano(call: PluginCall) = main(call) {
        val length = call.getDouble("duration") ?: return@main call.reject("PIANO")
        val speed = call.getDouble("speed") ?: return@main call.reject("PIANO")
        val position = call.getDouble("position") ?: return@main call.reject("PIANO")
        val raw = call.getArray("notes") ?: return@main call.reject("PIANO")
        val notes = (0 until raw.length()).map {
            val n = raw.getJSONObject(it)
            PianoTone(n.getDouble("at"), n.getDouble("duration"), n.getInt("midi"))
        }
        if (!PianoPcm.valid(notes, length) || speed !in listOf(0.5, 0.75, 1.0, 1.25)
            || !position.isFinite() || position < 0 || position >= length) return@main call.reject("PIANO")
        val repeat = call.getBoolean("loop", true) ?: true
        val revision = ++loadRevision
        pendingLoad?.reject("LOAD"); pendingLoad = call
        player.pause(); player.stop(); player.clearMediaItems()
        kind = "piano"; uri = null; pianoRounds = 0
        metadataWorker.execute {
            val file = File.createTempFile("anisong-piano-", ".wav", context.cacheDir)
            val success = try {
                PianoPcm.write(file, notes, length) { destroyed || revision != loadRevision }
                true
            } catch (_: Exception) { file.delete(); false }
            handler.post {
                if (destroyed || revision != loadRevision) { file.delete(); return@post }
                pendingLoad = null
                if (!success) { call.reject("钢琴音频生成失败，请缩小小节范围重试。"); return@post }
                pianoFile?.delete(); pianoFile = file
                uri = Uri.fromFile(file); duration = length; start = 0.0; end = length
                player.setMediaItem(MediaItem.Builder().setUri(uri!!)
                    .setMediaMetadata(metadata("钢琴小节试听")).build(), (position * 1000).roundToLong())
                player.repeatMode = if (repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                player.playbackParameters = PlaybackParameters(speed.toFloat(), 1f)
                player.prepare(); player.play(); call.resolve()
            }
        }
    }
    @PluginMethod
    fun stopPiano(call: PluginCall) = main(call) {
        if (kind == "piano") {
            ++loadRevision; pendingLoad?.reject("已取消"); pendingLoad = null
            player.pause()
        }
        call.resolve()
    }
    @PluginMethod
    fun pianoLoop(call: PluginCall) = main(call) {
        if (kind == "piano") player.repeatMode = if (call.getBoolean("loop", true) == true)
            Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        call.resolve()
    }
    @PluginMethod
    fun syncPiano(call: PluginCall) = main(call) {
        if (kind == "piano") {
            emit(JSObject().put("type", "position").put("position", player.currentPosition / 1000.0).put("rounds", pianoRounds))
            emit(JSObject().put("type", "playing").put("playing", player.playWhenReady))
            if (player.playbackState == Player.STATE_ENDED) emit(JSObject().put("type", "end"))
        }
        call.resolve()
    }
    @PluginMethod
    fun pickAudio(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "audio/*"; addCategory(Intent.CATEGORY_OPENABLE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(call, intent, "audioPicked")
    }
    @ActivityCallback
    private fun audioPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val selected = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || selected == null) { call.reject("选择已取消"); return }
        // Keep the provider grant across process restarts when supported. Revoked or
        // moved files still fail explicitly and can be reselected from materials.
        try {
            context.contentResolver.takePersistableUriPermission(selected, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) { /* Provider only grants this session. */ }
        var name = "本地音频"
        context.contentResolver.query(selected, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
        }
        call.resolve(JSObject().put("source", selected.toString()).put("name", name))
    }

    override fun handleOnResume() {
        handler.post {
            if (!destroyed && ::player.isInitialized && uri != null) {
                val position = if (kind == "piano") player.currentPosition / 1000.0
                    else ClipCoordinates.toOriginalSeconds(player.currentPosition, start)
                emit(JSObject().put("type", "position").put("position", position).put("rounds", pianoRounds))
                emit(JSObject().put("type", "playing").put("playing", player.playWhenReady))
                if (player.playbackState == Player.STATE_ENDED) emit(JSObject().put("type", "end"))
            }
        }
    }
    override fun handleOnDestroy() {
        destroyed = true; ++loadRevision; pendingLoad?.reject("LOAD"); pendingLoad = null
        handler.removeCallbacksAndMessages(null); metadataWorker.shutdownNow()
        if (::connection.isInitialized) MediaController.releaseFuture(connection)
    }
}
