import * as _FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform } from "react-native";

// Keep-awake is only meaningful on native (mic recording not supported on web).
// Calling deactivateKeepAwake before activation throws on web — guard all calls.
const KEEP_AWAKE_TAG = "vox-recording";
const keepAwakeActivate = () => {
  if (Platform.OS === "web") return;
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
};
const keepAwakeDeactivate = () => {
  if (Platform.OS === "web") return;
  try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
};

// expo-file-system v19 type workaround: legacy API still works at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FS = _FileSystem as any;
const EncodingType = FS.EncodingType as { Base64: "base64"; UTF8: "utf8" };
const documentDirectory = FS.documentDirectory as string | null;
const readAsStringAsync = FS.readAsStringAsync as (
  uri: string,
  options?: { encoding: string }
) => Promise<string>;
const writeAsStringAsync = FS.writeAsStringAsync as (
  uri: string,
  contents: string,
  options?: { encoding: string }
) => Promise<void>;
const deleteAsync = FS.deleteAsync as (
  uri: string,
  options?: { idempotent?: boolean }
) => Promise<void>;

const getApiBase = () => `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

const MAX_RECORDING_MS = 30_000;

// Shared Android + iOS audio mode for playback (TTS).
// shouldDuckAndroid: lower other apps' volume while we speak (polite).
// playThroughEarpieceAndroid: false → speaker, not earpiece.
// staysActiveInBackground: false → release audio focus when minimized.
const PLAYBACK_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
} as const;

// Audio mode for microphone recording.
// shouldDuckAndroid: false → recording needs clean, undistorted audio input.
const RECORDING_MODE = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: false,
  playThroughEarpieceAndroid: false,
} as const;

// Idle audio mode: release audio focus entirely.
const IDLE_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: false,
  playThroughEarpieceAndroid: false,
} as const;

export interface UseVoiceOptions {
  /**
   * Called when the 30-second auto-stop timer fires.
   * Receives the transcribed text (or null if transcription failed).
   * Use this to send the message automatically.
   */
  onAutoStop?: (text: string | null) => void;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref for onAutoStop — prevents stale closure in the timer
  const onAutoStopRef = useRef(options.onAutoStop);
  useEffect(() => { onAutoStopRef.current = options.onAutoStop; }, [options.onAutoStop]);

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // Handle app going to background — release ALL audio resources immediately.
  // This is the Android foreground service compatibility layer: we don't hold
  // audio focus in background, preventing stuck mic or audio ANR issues.
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        clearRecordingTimer();
        keepAwakeDeactivate();

        if (recordingRef.current) {
          try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
          recordingRef.current = null;
          setIsRecording(false);
        }

        if (soundRef.current) {
          try {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
          } catch {}
          soundRef.current = null;
          setIsSpeaking(false);
        }

        // Release audio focus — let Android reclaim resources
        try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRecordingTimer();
      keepAwakeDeactivate();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const stopRecording = async (): Promise<string | null> => {
    clearRecordingTimer();
    keepAwakeDeactivate();

    try {
      if (!recordingRef.current) return null;
      setIsRecording(false);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) return null;

      // Release recording audio focus before reading file
      try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}

      const base64 = await readAsStringAsync(uri, {
        encoding: EncodingType.Base64,
      });
      const ext = uri.split(".").pop() ?? "m4a";

      const res = await fetch(`${getApiBase()}/vox/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, format: ext }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return (data.text as string) || null;
    } catch {
      setIsRecording(false);
      recordingRef.current = null;
      return null;
    }
  };

  const startRecording = async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Supported on Web",
        "Voice recording requires the Expo Go app on your Android or iOS device."
      );
      return false;
    }

    // Guard: don't start a second recording if one is already in progress.
    // Prevents orphaned recordings from rapid double-taps.
    if (recordingRef.current) return false;

    try {
      const { granted, canAskAgain } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone Access Required",
          canAskAgain
            ? "VOX needs microphone access to hear your voice commands. Please enable it in Settings."
            : "Microphone access was permanently denied. Go to Settings → Apps → VOX AI → Permissions to enable it.",
          [{ text: "OK" }]
        );
        return false;
      }

      // Guard: don't start if app went to background while permission dialog was open
      if (AppState.currentState !== "active") return false;

      await Audio.setAudioModeAsync(RECORDING_MODE);

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      // Race condition guard: if app went to background DURING createAsync,
      // immediately stop and unload the recording to prevent orphaned mic session.
      if (AppState.currentState !== "active") {
        await recording.stopAndUnloadAsync().catch(() => {});
        keepAwakeDeactivate();
        try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}
        return false;
      }

      recordingRef.current = recording;
      setIsRecording(true);

      // Keep screen on while mic is active (native only — guarded inside helper)
      keepAwakeActivate();

      // Auto-stop after MAX_RECORDING_MS to prevent stuck mic
      clearRecordingTimer();
      recordingTimerRef.current = setTimeout(async () => {
        if (recordingRef.current) {
          const text = await stopRecording().catch(() => null);
          onAutoStopRef.current?.(text);
        }
      }, MAX_RECORDING_MS);

      return true;
    } catch {
      setIsRecording(false);
      recordingRef.current = null;
      return false;
    }
  };

  /**
   * Plays TTS audio for the given text.
   * - One automatic retry on HTTP failure (after 1s delay).
   * - Temp audio file always cleaned up in `finally` — no leaks on early exit.
   * - Aborts if app goes to background before or during playback.
   * - Properly releases Android audio focus when done.
   */
  const speak = async (text: string, voice = "alloy"): Promise<void> => {
    if (Platform.OS === "web") return;

    // tempUri declared outside try so `finally` can always clean it up,
    // even if an exception is thrown after the file is written.
    let tempUri: string | null = null;

    try {
      setIsSpeaking(true);

      // Stop any previous TTS that's still playing
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      const body = JSON.stringify({ text: text.slice(0, 4096), voice });
      const doFetch = () =>
        fetch(`${getApiBase()}/vox/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

      let res = await doFetch();

      if (!res.ok) {
        // One retry after a short delay
        await new Promise((r) => setTimeout(r, 1000));
        res = await doFetch();
        if (!res.ok) return; // Both attempts failed — finally handles cleanup
      }

      // First foreground check: user may have minimized while waiting for TTS network response
      if (AppState.currentState !== "active") return;

      const { audio, format } = (await res.json()) as { audio: string; format: string };
      tempUri = `${documentDirectory ?? ""}tts_${Date.now()}.${format}`;

      await writeAsStringAsync(tempUri, audio, { encoding: EncodingType.Base64 });

      // Second foreground check: user may have minimized during file write
      if (AppState.currentState !== "active") return;

      // Request audio focus for playback (ducks other apps' audio on Android)
      await Audio.setAudioModeAsync(PLAYBACK_MODE);

      const { sound } = await Audio.Sound.createAsync({ uri: tempUri });
      soundRef.current = sound;

      // Wait for playback to complete (or fail). Both paths resolve the promise.
      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) resolve();
          if (!s.isLoaded) resolve();
        });
        sound.playAsync().catch(() => resolve());
      });

      await sound.unloadAsync().catch(() => {});
      soundRef.current = null;

      // Release audio focus — allow other apps to resume normal volume
      try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}
    } catch {
      // TTS failure is non-fatal — text is still visible in chat
    } finally {
      setIsSpeaking(false);
      // Always clean up the temp audio file — even on early return or exception
      if (tempUri) {
        await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      }
    }
  };

  const stopSpeaking = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setIsSpeaking(false);
    try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}
  };

  return {
    isRecording,
    isSpeaking,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
  };
}
