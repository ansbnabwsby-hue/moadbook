import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AuthPanel } from "@/components/AuthPanel";
import { AppButton, AppText, Avatar, Card, Field, Page, PageHeading, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { dbGet, dbPut, userFacingError } from "@/lib/firebase/client";
import { mediaErrorMessage, pickCompressedImage } from "@/lib/media";

export default function ProfileScreen() {
  const c = usePalette();
  const router = useRouter();
  const { session, profile, loading: authLoading, updateProfile, signOut, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    const row = await refreshProfile().catch(() => null);
    if (row) { setDisplayName(row.displayName || ""); setBio(row.bio || ""); }
    const media = await dbGet<{ dataUrl?: string } | null>(`/profileMedia/${session.user.id}`).catch(() => null);
    if (media?.dataUrl) setAvatar(media.dataUrl);
  }, [session, refreshProfile]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (authLoading) return <Page style={styles.center}><ActivityIndicator color={c.purple} size="large" /></Page>;
  if (!session) return <Page><AuthPanel /></Page>;

  const selectAvatar = async () => {
    setPicking(true);
    setError("");
    try {
      const image = await pickCompressedImage(220_000);
      if (!image) return;
      await dbPut(`/profileMedia/${session.user.id}`, { dataUrl: image.dataUrl, updatedAt: Date.now() });
      await dbPut(`/profiles/${session.user.id}/avatarUrl`, "");
      setAvatar(image.dataUrl);
      await refreshProfile().catch(() => undefined);
      setSuccess("تم تحديث صورتك الشخصية.");
    } catch (e) { setError(e instanceof Error && (e.message === "PHOTO_PERMISSION_DENIED" || e.message === "IMAGE_TOO_LARGE_AFTER_COMPRESSION") ? mediaErrorMessage(e) : userFacingError(e)); }
    finally { setPicking(false); }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateProfile({ displayName, bio });
      setSuccess("تم حفظ بياناتك.");
    } catch (e) {
      const code = String((e as Error)?.message || "");
      setError(code === "DISPLAY_NAME_INVALID" ? "الاسم الظاهر يجب أن يكون بين حرفين و60 حرفًا." : code === "BIO_TOO_LONG" ? "النبذة أطول من 240 حرفًا." : userFacingError(e));
    } finally { setSaving(false); }
  };

  const confirmSignOut = () => {
    const perform = async () => { await signOut(); router.replace("/(tabs)" as never); };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("هل تريد تسجيل الخروج من moadbook؟")) void perform();
    } else Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من هذا الجهاز؟", [{ text: "إلغاء", style: "cancel" }, { text: "تسجيل الخروج", style: "destructive", onPress: () => void perform() }]);
  };

  return (
    <Page>
      <PageHeading title="حسابي" subtitle="خلّ ملفك يعكس شخصيتك" right={<Pressable onPress={() => router.push("/notifications" as never)} accessibilityLabel="الإشعارات"><Ionicons name="notifications-outline" size={20} color={c.purple} /></Pressable>} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.profileCard}>
          <View style={styles.profileTop}><Avatar id={session.user.id} name={displayName || session.user.username} uri={avatar || profile?.avatarUrl} size={82} /><View style={styles.identity}><AppText bold style={styles.displayTitle}>{profile?.displayName || displayName || session.user.username}</AppText><AppText muted>@{session.user.username}</AppText><AppText muted style={{ fontSize: 12, marginTop: 3 }}>عضو في moadbook</AppText></View></View>
          <AppButton title={picking ? "جارٍ تجهيز الصورة" : "تغيير الصورة الشخصية"} icon="camera-outline" variant="soft" onPress={selectAvatar} loading={picking} />
        </Card>
        <Card style={styles.form}>
          <AppText bold style={{ fontSize: 17, marginBottom: 2 }}>معلوماتك</AppText>
          <Field label="الاسم الظاهر" value={displayName} onChangeText={setDisplayName} placeholder="اسمك الذي يظهر للناس" autoCapitalize="words" maxLength={60} />
          <Field label="نبذة قصيرة" value={bio} onChangeText={setBio} placeholder="اكتب نبذة عنك..." multiline maxLength={240} />
          <AppText muted style={{ textAlign: "left", fontSize: 10 }}>{bio.length}/240</AppText>
          <AppButton title="حفظ التغييرات" icon="checkmark" onPress={save} loading={saving} />
        </Card>
        {error ? <AppText style={[styles.message, { color: c.danger }]}>{error}</AppText> : null}
        {success ? <AppText style={[styles.message, { color: c.positive }]}>{success}</AppText> : null}
        <View style={styles.stats}><View style={styles.stat}><Ionicons name="shield-checkmark-outline" size={17} color={c.purple} /><AppText muted style={{ fontSize: 11 }}>جلسة آمنة</AppText></View><View style={styles.stat}><Ionicons name="image-outline" size={17} color={c.purple} /><AppText muted style={{ fontSize: 11 }}>صور مضغوطة</AppText></View><View style={styles.stat}><Ionicons name="phone-portrait-outline" size={17} color={c.purple} /><AppText muted style={{ fontSize: 11 }}>تجربة iPhone</AppText></View></View>
        <Pressable onPress={confirmSignOut} style={[styles.signOut, { borderColor: c.border }]}><Ionicons name="log-out-outline" size={19} color={c.danger} /><AppText style={{ color: c.danger, fontWeight: "700" }}>تسجيل الخروج</AppText></Pressable>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 17, paddingBottom: 28, gap: 13 },
  profileCard: { gap: 13, padding: 17 },
  profileTop: { flexDirection: "row-reverse", alignItems: "center", gap: 13 },
  identity: { flex: 1, alignItems: "flex-start" },
  displayTitle: { fontSize: 20 },
  form: { gap: 13, padding: 17 },
  message: { textAlign: "right", fontSize: 12 },
  stats: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4 },
  stat: { alignItems: "center", gap: 4 },
  signOut: { minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
});
