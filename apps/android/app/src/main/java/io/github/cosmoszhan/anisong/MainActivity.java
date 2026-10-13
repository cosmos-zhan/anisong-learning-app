package io.github.cosmoszhan.anisong;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AnisongAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
