import * as _FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform } from "react-native";

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

interface UseVoiceOptions {
  /**
   * Called when the auto-stop timer fires and transcription completes.
   * Receive the transcribed text (or null on failure) so callers can send it.
   */
  onAutoStop?: (transcribed: string | null) => void;
}

export function useVoice({ onAutoStop }: UseVoiceOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref so the timer callback always has the latest onAutoStop
  const onAutoStopRef = useRef(onAutoStop);
  useEffect(() => { onAutoStopRef.current = onAutoStop; }, [onAutoStop]);

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // Handle app going to background — release all audio resources immediately
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        clearRecordingTimer();

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

        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
          });
        } catch {}
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRecordingTimer();
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const stopRecording = async (): Promise<string | null> => {
    clearRecordingTimer();
    deactivateKeepAwake("vox-recording");

    try {
      if (!recordingRef.current) return null;
      setIsRecording(false);

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) return null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

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

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone Access Required",
          "VOX needs microphone access to hear your voice commands. Please enable it in Settings.",
          [{ text: "OK" }]
        );
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);

      activateKeepAwakeAsync("vox-recording").catch(() => {});

      // Auto-stop after MAX_RECORDING_MS to prevent stuck mic.
      // Transcription result is forwarded to onAutoStop so the caller can send it.
      clearRecordingTimer();
      recordingTimerRef.current = setTimeout(async () => {
        if (recordingRef.current) {
          const text = await stopRecording();
          onAutoStopRef.current?.(text);
        }
      }, MAX_RECORDING_MS);

      return true;
    } catch {
      setIsRecording(false);
      return false;
    }
  };

  const speak = async (
    text: string,
    voice = "alloy",
    attempt = 1
  ): Promise<void> => {
    if (Platform.OS === "web") return;

    let tempUri: string | null = null;

    try {
      setIsSpeaking(true);

      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      const res = await fetch(`${getApiBase()}/vox/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4096), voice }),
      });

      if (!res.ok) {
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 1000));
          return speak(text, voice, 2);
        }
        return;
      }

      // Abort if app went to background while waiting for TTS
      if (AppState.currentState !== "active") return;

      const { audio, format } = await res.json();
      tempUri = (documentDirectory ?? "") + `tts_${Date.now()}.${format}`;

      await writeAsStringAsync(tempUri, audio, {
        encoding: EncodingType.Base64,
      });

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: tempUri });
      soundRef.current = sound;

      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) resolve();
          if (!s.isLoaded) resolve();
        });
        sound.playAsync().catch(() => resolve());
      });

      await sound.unloadAsync().catch(() => {});
      soundRef.current = null;
    } catch {
      // TTS failure is non-fatal — text is still visible in chat
    } finally {
      setIsSpeaking(false);
      // Always clean up temp file regardless of success or failure
      if (tempUri) {
        deleteAsync(tempUri, { idempotent: true }).catch(() => {});
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
