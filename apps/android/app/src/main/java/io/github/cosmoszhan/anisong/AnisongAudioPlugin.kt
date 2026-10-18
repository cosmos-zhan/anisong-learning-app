package io.github.cosmoszhan.anisong

import android.app.Activity
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
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
    private lateinit var player: ExoPlayer
    private val handler = Handler(Looper.getMainLooper())
    private val metadataWorker = Executors.newSingleThreadExecutor()
    private var uri: Uri? = null
    private var duration = 0.0
    private var start = 0.0
    private var end = 0.0
    private var loadRevision = 0
    private var destroyed = false
    private var pendingLoad: PluginCall? = null
    private val ticker = object : Runnable {
        override fun run() {
            if (destroyed) return
            if (uri != null) emit(JSObject().put("type", "position").put("position", ClipCoordinates.toOriginalSeconds(player.currentPosition, start)))
            handler.postDelayed(this, 60)
        }
    }
    override fun load() {
        player = ExoPlayer.Builder(context).build()
        player.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
        player.setHandleAudioBecomingNoisy(true)
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Buffering does not mean that the user has paused.
                if (!player.playWhenReady) emit(JSObject().put("type", "playing").put("playing", false))
            }
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (!playWhenReady) emit(JSObject().put("type", "playing").put("playing", false))
            }
            override fun onPlaybackSuppressionReasonChanged(reason: Int) {
                if (reason != Player.PLAYBACK_SUPPRESSION_REASON_NONE) player.pause()
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) emit(JSObject().put("type", "end"))
            }
            override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) emit(JSObject().put("type", "loop"))
            }
            override fun onPlayerError(error: PlaybackException) {
                emit(JSObject().put("type", "error").put("code", "NATIVE"))
            }
        })
        handler.post(ticker)
    }
    private fun emit(event: JSObject) { notifyListeners("audioEvent", event) }
    private fun main(call: PluginCall, action: () -> Unit) {
        handler.post {
            try { if (destroyed) call.reject("NATIVE") else action() } catch (_: Exception) { call.reject("NATIVE") }
        }
    }
    @PluginMethod
    fun load(call: PluginCall) = main(call) {
        val source = call.getString("source") ?: return@main call.reject("LOAD")
        if (!AudioSource.allowed(source)) return@main call.reject("LOAD")
        val assetPath = AudioSource.assetPath(source)
        val next = Uri.parse(source)
        val revision = ++loadRevision
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
                player.setMediaItem(MediaItem.fromUri(next)); player.prepare()
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
            player.setMediaItem(MediaItem.Builder().setUri(uri!!).setClippingConfiguration(clip).build(), ClipCoordinates.toClipMs(original, a, b))
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
    fun pickAudio(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "audio/*"; addCategory(Intent.CATEGORY_OPENABLE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivityForResult(call, intent, "audioPicked")
    }
    @ActivityCallback
    private fun audioPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val selected = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || selected == null) { call.reject("选择已取消"); return }
        var name = "本地音频"
        context.contentResolver.query(selected, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
        }
        call.resolve(JSObject().put("source", selected.toString()).put("name", name))
    }
    override fun handleOnPause() { if (::player.isInitialized) handler.post { if (!destroyed) player.pause() } }
    override fun handleOnDestroy() {
        destroyed = true; ++loadRevision; pendingLoad?.reject("LOAD"); pendingLoad = null
        handler.removeCallbacksAndMessages(null); metadataWorker.shutdownNow()
        if (::player.isInitialized) player.release()
    }
}
