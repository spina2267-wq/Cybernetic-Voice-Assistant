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

// ─── Timing constants ────────────────────────────────────────────────────────
const MAX_RECORDING_MS = 30_000;

// STT: audio upload + Whisper transcription. 30s recordings are ~0.5 MB;
// typical transcription is 2-4s on a good connection, 10-12s on 3G.
// 15s gives a wide safety margin without leaving the user stuck forever.
const STT_TIMEOUT_MS = 15_000;

// TTS: server-side text-to-speech generation. Scales with response length.
// Typical single-sentence: 1-3s. Long paragraph: 5-8s. 20s is the ceiling.
// Both fetch attempts (initial + retry) share this same timeout window.
const TTS_TIMEOUT_MS = 20_000;

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
   * Receives the transcribed text (or null if transcription failed / timed out).
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

  // Generation counter: incremented on each speak() call AND whenever external
  // code stops TTS (stopSpeaking, startRecording, background handler).
  // Lets an in-progress speak() detect it was superseded and bail out early,
  // preventing two concurrent TTS sessions fighting over soundRef / audio focus.
  const speakGenRef = useRef(0);

  // Re-entrant guard for startRecording: covers the async window between the
  // recordingRef.current === null check and recordingRef.current = recording
  // assignment (~200-500ms of Audio.Recording.createAsync). Without this, a
  // rapid double-tap creates two concurrent recordings — one orphaned.
  const isStartingRef = useRef(false);

  // AbortController for the in-flight STT transcription fetch.
  // Aborted on: STT_TIMEOUT_MS elapsed, app goes to background, unmount.
  const sttAbortRef = useRef<AbortController | null>(null);

  // AbortController for the in-flight TTS generation fetch.
  // Aborted on: TTS_TIMEOUT_MS elapsed, new speak() call, stopSpeaking(),
  // startRecording() (mic tap during TTS), app goes to background, unmount.
  const speakAbortRef = useRef<AbortController | null>(null);

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

        // Abort any in-flight network requests BEFORE destroying resources.
        // This lets speak() / stopRecording() detect cancellation via AbortError
        // and exit cleanly, rather than continuing to operate on freed objects.
        sttAbortRef.current?.abort();
        sttAbortRef.current = null;
        speakAbortRef.current?.abort();
        speakAbortRef.current = null;

        // Signal any in-progress speak() to bail before we destroy its resources.
        speakGenRef.current++;

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
      // Cancel in-flight requests so their callbacks don't fire on a dead component
      sttAbortRef.current?.abort();
      speakAbortRef.current?.abort();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const stopRecording = async (): Promise<string | null> => {
    clearRecordingTimer();
    keepAwakeDeactivate();

    // Cancel any previously pending STT request (edge-case re-entry guard).
    if (sttAbortRef.current) {
      sttAbortRef.current.abort();
    }
    const sttController = new AbortController();
    sttAbortRef.current = sttController;
    let sttTimer: ReturnType<typeof setTimeout> | null = null;

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

      // Start the STT timeout only after the file is read — we don't want to
      // penalize slow local file I/O against the network budget.
      sttTimer = setTimeout(() => sttController.abort(), STT_TIMEOUT_MS);

      const res = await fetch(`${getApiBase()}/vox/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, format: ext }),
        signal: sttController.signal,
      });

      if (!res.ok) return null;
      const data = await res.json();
      return (data.text as string) || null;
    } catch {
      // Covers: AbortError (timeout / background), network errors, file read errors.
      // All are non-fatal — UI shows idle state, user can try again.
      setIsRecording(false);
      recordingRef.current = null;
      // Ensure audio focus is released even when an error interrupts the flow
      try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}
      return null;
    } finally {
      if (sttTimer) clearTimeout(sttTimer);
      // Only null the ref if it still points to our controller; a concurrent
      // call (e.g. background handler) may have already replaced it.
      if (sttAbortRef.current === sttController) {
        sttAbortRef.current = null;
      }
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

    // Guard: don't start if a recording is already active.
    if (recordingRef.current) return false;

    // Guard: don't start if we're already in the async setup phase.
    // Covers the ~200-500ms window between the recordingRef check above and
    // recordingRef.current = recording below — a rapid second tap would pass
    // the recordingRef check and launch a second concurrent createAsync().
    if (isStartingRef.current) return false;
    isStartingRef.current = true;

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

      // Stop any active TTS before switching to RECORDING_MODE.
      // Switching audio mode while a Sound is playing causes Android audio routing
      // glitches (speaker→earpiece swap) and can corrupt the recording with
      // mixed TTS audio. Abort the in-flight TTS fetch so speak() exits cleanly.
      if (soundRef.current) {
        speakGenRef.current++;
        speakAbortRef.current?.abort();
        speakAbortRef.current = null;
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
        setIsSpeaking(false);
      }

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
    } finally {
      // Always release the re-entrant guard, even if an exception or early
      // return skips the success path.
      isStartingRef.current = false;
    }
  };

  /**
   * Plays TTS audio for the given text.
   * - Configurable timeout (TTS_TIMEOUT_MS) via AbortController — no indefinite waits.
   * - Aborts any previously in-flight TTS fetch when a new speak() starts.
   * - One automatic retry on HTTP failure (after 1s delay, within same timeout window).
   * - Temp audio file always cleaned up in `finally` — no leaks on early exit.
   * - Aborts if app goes to background before or during playback.
   * - Properly releases Android audio focus when done.
   */
  const speak = async (text: string, voice = "alloy"): Promise<void> => {
    if (Platform.OS === "web") return;

    // Increment generation so any previously-running speak() can detect
    // it has been superseded and exit cleanly without touching the new state.
    const myGen = ++speakGenRef.current;

    // Abort any in-flight TTS fetch from the previous speak() call.
    // This makes the old fetch fail immediately with AbortError rather than
    // waiting for the full server response before realising it's been superseded.
    if (speakAbortRef.current) {
      speakAbortRef.current.abort();
    }
    const controller = new AbortController();
    speakAbortRef.current = controller;

    let ttsTimer: ReturnType<typeof setTimeout> | null = null;

    // tempUri declared outside try so `finally` can always clean it up,
    // even if an exception is thrown after the file is written.
    let tempUri: string | null = null;

    try {
      setIsSpeaking(true);

      // Start timeout: both fetch attempts must complete within TTS_TIMEOUT_MS.
      // Using a single controller/timer for initial + retry keeps the logic simple
      // and ensures a slow first attempt doesn't hide a retry that also times out.
      ttsTimer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

      // Stop any previous TTS sound that's still playing.
      // stopAsync() before unloadAsync() avoids Android audio glitches when
      // cutting off mid-playback (unload without stop can cause buffer errors).
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      // Bail out if a newer speak() call already superseded this one
      if (myGen !== speakGenRef.current) return;

      const body = JSON.stringify({ text: text.slice(0, 4096), voice });
      const doFetch = () =>
        fetch(`${getApiBase()}/vox/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });

      let res = await doFetch();

      if (!res.ok) {
        // One retry after a short delay (within the same TTS_TIMEOUT_MS window).
        await new Promise((r) => setTimeout(r, 1000));
        // Fast-exit if superseded or aborted during the retry delay
        if (myGen !== speakGenRef.current) return;
        res = await doFetch();
        if (!res.ok) return; // Both attempts failed — finally handles cleanup
      }

      // Foreground + generation check: user may have minimized while waiting for TTS,
      // or a newer speak() call arrived while we were awaiting the network.
      if (AppState.currentState !== "active" || myGen !== speakGenRef.current) return;

      const { audio, format } = (await res.json()) as { audio: string; format: string };
      tempUri = `${documentDirectory ?? ""}tts_${Date.now()}.${format}`;

      await writeAsStringAsync(tempUri, audio, { encoding: EncodingType.Base64 });

      // Check again after file write (file I/O can take a moment on slower devices)
      if (AppState.currentState !== "active" || myGen !== speakGenRef.current) return;

      // Request audio focus for playback (ducks other apps' audio on Android)
      await Audio.setAudioModeAsync(PLAYBACK_MODE);

      // Check after mode switch: stopSpeaking() or startRecording() may have been
      // called during this await, already setting IDLE_MODE and nulling soundRef.
      // Without this guard, audio plays even after an explicit stop request.
      if (AppState.currentState !== "active" || myGen !== speakGenRef.current) return;

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

      // stopAsync() before unloadAsync() prevents Android buffer-underrun clicks
      // when the sound finishes naturally (didJustFinish path).
      await sound.stopAsync().catch(() => {});
      await sound.unloadAsync().catch(() => {});
      soundRef.current = null;

      // Release audio focus — allow other apps to resume normal volume
      try { await Audio.setAudioModeAsync(IDLE_MODE); } catch {}
    } catch {
      // Covers: AbortError (timeout, cancelled by new speak() / stopSpeaking() /
      // background), network errors, file write errors. All non-fatal — the
      // assistant's response is already visible as text in the chat.
    } finally {
      if (ttsTimer) clearTimeout(ttsTimer);
      // Only null the ref if it still points to our controller — a newer speak()
      // may have already replaced it with its own controller.
      if (speakAbortRef.current === controller) {
        speakAbortRef.current = null;
      }
      // Only reset isSpeaking if this generation is still the current one.
      // If a newer speak() call has already taken ownership of the flag, leave
      // it alone — resetting here would flicker the UI to "not speaking".
      if (myGen === speakGenRef.current) {
        setIsSpeaking(false);
      }
      // Always clean up the temp audio file — even on early return or exception
      if (tempUri) {
        await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      }
    }
  };

  const stopSpeaking = async () => {
    // Increment generation and abort the in-flight fetch before destroying
    // the sound — so speak() exits via AbortError rather than trying to
    // operate on a sound object we're about to unload.
    speakGenRef.current++;
    speakAbortRef.current?.abort();
    speakAbortRef.current = null;

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
