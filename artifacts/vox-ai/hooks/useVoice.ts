import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus, Platform } from "react-native";

const getApiBase = () => `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

const MAX_RECORDING_MS = 30_000;  // Auto-stop after 30 seconds

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up recording timer on unmount
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

      // Auto-stop after MAX_RECORDING_MS to prevent stuck mic
      clearRecordingTimer();
      recordingTimerRef.current = setTimeout(() => {
        if (recordingRef.current) {
          stopRecording().catch(() => {});
        }
      }, MAX_RECORDING_MS);

      return true;
    } catch {
      setIsRecording(false);
      return false;
    }
  };

  const stopRecording = async (): Promise<string | null> => {
    clearRecordingTimer();

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

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
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

  const speak = async (
    text: string,
    voice = "alloy",
    attempt = 1
  ): Promise<void> => {
    if (Platform.OS === "web") return;

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
        // Retry once on server error
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 1000));
          return speak(text, voice, 2);
        }
        setIsSpeaking(false);
        return;
      }

      // Abort if app went to background while waiting for TTS
      if (AppState.currentState !== "active") {
        setIsSpeaking(false);
        return;
      }

      const { audio, format } = await res.json();
      const tempUri =
        (FileSystem.documentDirectory ?? "") + `tts_${Date.now()}.${format}`;

      await FileSystem.writeAsStringAsync(tempUri, audio, {
        encoding: FileSystem.EncodingType.Base64,
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
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    } catch {
      // TTS failure is non-fatal — text is still visible in chat
    } finally {
      setIsSpeaking(false);
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
