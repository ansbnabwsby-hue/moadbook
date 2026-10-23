import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dbGet } from "@/lib/firebase/client";

export const Brand = {
  purple: "#5147D9",
  lilac: "#9185F1",
  coral: "#F08B91",
  green: "#258C72",
};

export function usePalette() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  return {
    dark,
    background: dark ? "#11111A" : "#F7F6FB",
    surface: dark ? "#1C1B27" : "#FFFFFF",
    elevated: dark ? "#242332" : "#FCFBFF",
    text: dark ? "#F4F1FC" : "#28243A",
    muted: dark ? "#ADA8BE" : "#817B95",
    border: dark ? "#343244" : "#ECE9F3",
    soft: dark ? "#2D2944" : "#F0EDFF",
    purple: Brand.purple,
    positive: dark ? "#7AD4B7" : Brand.green,
    danger: dark ? "#FF9BA9" : "#D84461",
  };
}

export function Page({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = usePalette();
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.page, { backgroundColor: c.background }, style]}>{children}</SafeAreaView>;
}

export function AppText({ children, style, muted = false, bold = false, numberOfLines }: { children: React.ReactNode; style?: object; muted?: boolean; bold?: boolean; numberOfLines?: number }) {
  const c = usePalette();
  return <Text numberOfLines={numberOfLines} style={[styles.text, { color: muted ? c.muted : c.text, fontWeight: bold ? "700" : "400" }, style]}>{children}</Text>;
}

export function AppButton({ title, onPress, icon, variant = "primary", disabled = false, loading = false, style }: {
  title: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  variant?: "primary" | "soft" | "outline" | "quiet" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}) {
  const c = usePalette();
  const bg = variant === "primary" ? c.purple : variant === "soft" ? c.soft : variant === "danger" ? (c.dark ? "#482531" : "#FFF0F2") : "transparent";
  const fg = variant === "primary" ? "#FFFFFF" : variant === "danger" ? c.danger : c.purple;
  const handlePress = () => {
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
    onPress();
  };
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} disabled={disabled || loading} style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: variant === "outline" ? c.border : "transparent", opacity: disabled ? 0.5 : pressed ? 0.78 : 1 }, style]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry = false, multiline = false, autoCapitalize = "none", keyboardType = "default", maxLength, style }: {
  label?: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean; multiline?: boolean; autoCapitalize?: "none" | "sentences" | "words" | "characters"; keyboardType?: "default" | "email-address"; maxLength?: number; style?: object;
}) {
  const c = usePalette();
  return (
    <View style={style}>
      {label ? <AppText bold style={styles.fieldLabel}>{label}</AppText> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        maxLength={maxLength}
        textAlign="right"
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }, multiline && styles.multiline]}
      />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = usePalette();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export function PageHeading({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const c = usePalette();
  return <View style={styles.heading}>
    <View style={styles.headingCopy}>
      <AppText bold style={styles.headingTitle}>{title}</AppText>
      {subtitle ? <AppText muted style={styles.headingSubtitle}>{subtitle}</AppText> : null}
    </View>
    {right ? <View style={[styles.headingAction, { backgroundColor: c.surface, borderColor: c.border }]}>{right}</View> : null}
  </View>;
}

const avatarCache: Record<string, string> = {};
export function Avatar({ id, name, uri, size = 44 }: { id?: string; name?: string; uri?: string; size?: number }) {
  const c = usePalette();
  const [loaded, setLoaded] = useState<{ id: string; uri: string } | null>(null);
  useEffect(() => {
    if (uri || !id || avatarCache[id]) return;
    let alive = true;
    dbGet<{ dataUrl?: string } | null>(`/profileMedia/${id}`).then((row) => {
      if (row?.dataUrl) {
        avatarCache[id] = row.dataUrl;
        if (alive) setLoaded({ id, uri: row.dataUrl });
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [id, uri]);
  const resolved = uri || (id ? avatarCache[id] : "") || (loaded && loaded.id === id ? loaded.uri : "");
  const initial = Array.from(name?.trim() || "مoadbook")[0] || "م";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.soft }]}>
      {resolved ? <Image source={{ uri: resolved }} contentFit="cover" style={{ width: size, height: size, borderRadius: size / 2 }} /> : <Text style={[styles.avatarInitial, { color: c.purple, fontSize: size * 0.38 }]}>{initial}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  text: { fontFamily: "System", fontSize: 15, lineHeight: 23, writingDirection: "rtl" },
  button: { minHeight: 46, paddingHorizontal: 16, borderWidth: 1, borderRadius: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonText: { fontSize: 14, fontWeight: "700", writingDirection: "rtl" },
  fieldLabel: { marginBottom: 7, fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15, writingDirection: "rtl" },
  multiline: { minHeight: 110, paddingTop: 12 },
  card: { borderWidth: 1, borderRadius: 22, padding: 16 },
  heading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, gap: 12 },
  headingCopy: { flex: 1, alignItems: "flex-start" },
  headingTitle: { fontSize: 25, lineHeight: 34, letterSpacing: -0.4 },
  headingSubtitle: { fontSize: 13, marginTop: 2 },
  headingAction: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarInitial: { fontWeight: "800" },
});
