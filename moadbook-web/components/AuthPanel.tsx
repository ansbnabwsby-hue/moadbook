import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppText, Card, Field, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { userFacingError } from "@/lib/firebase/client";

export function AuthPanel() {
  const c = usePalette();
  const { signIn, signUp, busy } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      if (mode === "login") await signIn(username, password);
      else await signUp(username, password);
    } catch (e) {
      const code = String((e as Error)?.message || "");
      setError(code === "USERNAME_INVALID" ? "استخدم 3–24 حرفًا إنجليزيًا أو رقمًا أو _." : code === "DISPLAY_NAME_INVALID" ? "تعذر إنشاء الملف الشخصي الآن." : userFacingError(e));
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.brandOrb, { backgroundColor: c.soft }]}>
          <View style={[styles.brandMark, { backgroundColor: c.purple }]}>
            <Ionicons name="chatbubbles" color="#FFFFFF" size={31} />
          </View>
        </View>
        <AppText bold style={styles.wordmark}>moadbook</AppText>
        <AppText muted style={styles.tagline}>مساحة تجمع أفكارك والناس اللي يشبهوك</AppText>

        <Card style={styles.form}>
          <AppText bold style={styles.formTitle}>{mode === "login" ? "أهلًا بعودتك" : "خلّينا نبدأ"}</AppText>
          <AppText muted style={styles.formSubtitle}>{mode === "login" ? "سجّل دخولك وارجع لمجتمعك." : "أنشئ حسابًا باسم مستخدم فريد."}</AppText>
          <Field label="اسم المستخدم" value={username} onChangeText={setUsername} placeholder="مثال: moad_23" autoCapitalize="none" />
          <Field label="كلمة المرور" value={password} onChangeText={setPassword} placeholder="8 أحرف على الأقل" secureTextEntry autoCapitalize="none" />
          {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
          <AppButton title={mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"} icon={mode === "login" ? "arrow-forward" : "sparkles"} onPress={submit} loading={busy} style={styles.submit} />
          <AppButton title={mode === "login" ? "ما عندك حساب؟ أنشئ واحدًا" : "عندك حساب؟ سجّل دخولك"} onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} variant="quiet" />
          <AppText muted style={styles.hint}>اسم المستخدم من 3 إلى 24 حرفًا إنجليزيًا أو رقمًا أو _.</AppText>
        </Card>
        <AppText muted style={styles.privacy}>نحافظ على جلستك بأمان على هذا الجهاز.</AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 32, alignItems: "center", justifyContent: "center" },
  brandOrb: { width: 94, height: 94, borderRadius: 32, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-7deg" }] },
  brandMark: { width: 64, height: 64, borderRadius: 23, alignItems: "center", justifyContent: "center", transform: [{ rotate: "7deg" }] },
  wordmark: { fontSize: 29, letterSpacing: -0.8, marginTop: 12, writingDirection: "ltr" },
  tagline: { marginTop: 2, marginBottom: 26, fontSize: 13, textAlign: "center" },
  form: { width: "100%", maxWidth: 430, padding: 20, gap: 14 },
  formTitle: { fontSize: 23, textAlign: "right" },
  formSubtitle: { fontSize: 13, textAlign: "right", marginTop: -9, marginBottom: 2 },
  submit: { marginTop: 2 },
  error: { fontSize: 13, textAlign: "right", lineHeight: 20 },
  hint: { fontSize: 11, textAlign: "center", lineHeight: 18, marginTop: 3 },
  privacy: { marginTop: 18, fontSize: 11 },
});
