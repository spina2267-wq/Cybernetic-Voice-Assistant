import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { useRef, useState } from "react";
import { Alert, Platform } from "react-native";

const getApiBase = () =>
  `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const startRecording = async (): Promise<boolean> => {
    try {
      if (Platform.OS === "web") {
        Alert.alert("Not Supported", "Voice recording is not supported in web preview. Use the Expo Go app on your device.");
        return false;
      }
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Microphone access is needed for voice input. Please enable it in Settings."
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
      return true;
    } catch (err) {
      setIsRecording(false);
      return false;
    }
  };

  const stopRecording = async (): Promise<string | null> => {
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

  const speak = async (text: string, voice = "alloy"): Promise<void> => {
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
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
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
        });
        sound.playAsync();
      });

      await sound.unloadAsync();
      soundRef.current = null;
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
    } catch {
      // Silently fail TTS — text is still shown
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

  return { isRecording, isSpeaking, startRecording, stopRecording, speak, stopSpeaking };
}
