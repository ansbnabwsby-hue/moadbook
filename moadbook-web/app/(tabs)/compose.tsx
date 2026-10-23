import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { AppButton, AppText, Card, Page, PageHeading, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { dbDelete, dbPost, dbPut, userFacingError } from "@/lib/firebase/client";
import { mediaErrorMessage, pickCompressedImage } from "@/lib/media";
import { AuthPanel } from "@/components/AuthPanel";

const postTypes = [
  { id: "general", label: "عام", icon: "chatbubble-ellipses-outline" },
  { id: "question", label: "سؤال", icon: "help-circle-outline" },
  { id: "idea", label: "فكرة", icon: "bulb-outline" },
  { id: "announcement", label: "إعلان", icon: "megaphone-outline" },
] as const;

export default function ComposeScreen() {
  const c = usePalette();
  const router = useRouter();
  const { session, profile, loading: authLoading } = useAuth();
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState<(typeof postTypes)[number]["id"]>("general");
  const [image, setImage] = useState<{ uri: string; dataUrl: string; length: number } | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (authLoading) return <Page style={styles.center}><ActivityIndicator color={c.purple} size="large" /></Page>;
  if (!session) return <Page><AuthPanel /></Page>;

  const chooseImage = async () => {
    setError("");
    setPicking(true);
    try {
      const result = await pickCompressedImage(360_000);
      if (result) {
        setImage({ uri: result.uri, dataUrl: result.dataUrl, length: result.length });
        setMediaUrl("");
      }
    } catch (e) { setError(mediaErrorMessage(e)); }
    finally { setPicking(false); }
  };

  const publish = async () => {
    const text = body.trim();
    if (!text && !image && !mediaUrl.trim()) { setError("اكتب شيئًا أو أرفق صورة أو رابطًا."); return; }
    if (text.length > 2000) { setError("المنشور أطول من الحد المسموح."); return; }
    let url = "";
    if (mediaUrl.trim()) {
      try {
        const parsed = new URL(mediaUrl.trim());
        if (parsed.protocol !== "https:") throw new Error();
        url = parsed.href;
      } catch { setError("أدخل رابطًا صحيحًا يبدأ بـ https://."); return; }
    }
    setBusy(true);
    setError("");
    setSuccess("");
    let postId = "";
    try {
      const createdAt = Date.now();
      const post = { authorId: session.user.id, authorName: (profile?.displayName || session.user.displayName || session.user.username).slice(0, 60), body: text, postType, createdAt, hasMedia: !!(image || url), mood: "" };
      const result = await dbPost<{ name: string }>("/posts", post);
      postId = result.name;
      if (image) {
        await dbPut(`/postMedia/${postId}`, { authorId: session.user.id, type: "imageData", value: image.dataUrl, createdAt: Date.now() });
      } else if (url) {
        const isVideo = /\.(mp4|m4v|mov|m3u8|webm)(\?|$)/i.test(url) || /(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|vimeo\.com)/i.test(url);
        await dbPut(`/postMedia/${postId}`, { authorId: session.user.id, type: isVideo ? "videoUrl" : "imageUrl", value: url, createdAt: Date.now() });
      }
      setSuccess("تم نشر مشاركتك.");
      setBody("");
      setImage(null);
      setMediaUrl("");
      setTimeout(() => router.replace("/(tabs)" as never), 500);
    } catch (e) {
      if (postId) await dbDelete(`/posts/${postId}`).catch(() => undefined);
      setError(userFacingError(e));
    } finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeading title="مشاركة جديدة" subtitle="خلّ فكرتك توصل بالطريقة اللي تحبها" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.authorCard}>
            <View style={[styles.avatar, { backgroundColor: c.soft }]}><Ionicons name="person" size={18} color={c.purple} /></View>
            <View style={{ flex: 1, alignItems: "flex-start" }}><AppText bold>{profile?.displayName || session.user.username}</AppText><AppText muted style={{ fontSize: 11 }}>تنشر باسم حسابك</AppText></View>
            <Ionicons name="globe-outline" size={17} color={c.muted} />
          </Card>
          <TextInput value={body} onChangeText={setBody} placeholder="وش يدور في بالك؟" placeholderTextColor={c.muted} maxLength={2000} multiline textAlign="right" textAlignVertical="top" style={[styles.bodyInput, { color: c.text }]} />
          <View style={styles.counter}><AppText muted style={{ fontSize: 11 }}>{body.length}/2000</AppText></View>
          <AppText bold style={styles.sectionLabel}>نوع المشاركة</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeList}>
            {postTypes.map((item) => {
              const selected = postType === item.id;
              return <Pressable key={item.id} onPress={() => setPostType(item.id)} style={[styles.typeChip, { backgroundColor: selected ? c.soft : c.surface, borderColor: selected ? c.purple : c.border }]}><Ionicons name={item.icon} size={15} color={selected ? c.purple : c.muted} /><AppText style={{ color: selected ? c.purple : c.muted, fontSize: 12, fontWeight: "700" }}>{item.label}</AppText></Pressable>;
            })}
          </ScrollView>
          {image ? <View style={styles.previewWrap}><Image source={{ uri: image.uri }} contentFit="cover" style={styles.preview} /><View style={[styles.imageBadge, { backgroundColor: c.surface }]}><AppText muted style={{ fontSize: 10 }}>صورة واحدة · {Math.round(image.length / 1024)} ك.ب تقريبًا</AppText></View><Pressable onPress={() => setImage(null)} style={styles.removeImage}><Ionicons name="close" size={17} color="#FFF" /></Pressable></View> : null}
          <View style={styles.mediaTools}>
            <AppButton title={picking ? "جارٍ ضغط الصورة" : image ? "تغيير الصورة" : "إضافة صورة"} icon="image-outline" variant="soft" onPress={chooseImage} loading={picking} style={{ flex: 1 }} />
            {image ? <AppButton title="إزالة" icon="trash-outline" variant="quiet" onPress={() => setImage(null)} /> : null}
          </View>
          {!image ? (
            <View style={[styles.linkRow, { borderColor: c.border }]}>
              <Ionicons name="link-outline" size={18} color={c.muted} />
              <TextInput value={mediaUrl} onChangeText={setMediaUrl} onFocus={() => setImage(null)} placeholder="أضف رابط صورة أو فيديو https://" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="url" textAlign="right" style={[styles.linkInput, { color: c.text }]} />
            </View>
          ) : null}
          <AppText muted style={styles.privacyNote}>نضغط الصورة تلقائيًا قبل الإرسال للمساعدة على سرعة النشر. إذا رفض Firebase الرفع، ستظهر لك رسالة السبب ولن نغيّر قواعده.</AppText>
          {error ? <AppText style={[styles.message, { color: c.danger }]}>{error}</AppText> : null}
          {success ? <AppText style={[styles.message, { color: c.positive }]}>{success}</AppText> : null}
          <AppButton title="نشر المشاركة" icon="paper-plane-outline" onPress={publish} loading={busy} disabled={picking} style={{ marginTop: 6 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingBottom: 32, gap: 14 },
  authorCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bodyInput: { minHeight: 145, padding: 5, fontSize: 18, lineHeight: 30, writingDirection: "rtl" },
  counter: { alignItems: "flex-start", marginTop: -10 },
  sectionLabel: { fontSize: 14, textAlign: "right", marginTop: 2 },
  typeList: { flexDirection: "row-reverse", gap: 8, paddingVertical: 2 },
  typeChip: { flexDirection: "row-reverse", gap: 6, alignItems: "center", borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 },
  previewWrap: { borderRadius: 18, overflow: "hidden", position: "relative", backgroundColor: "#EDEAF4" },
  preview: { width: "100%", height: 245 },
  imageBadge: { position: "absolute", bottom: 10, right: 10, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  removeImage: { position: "absolute", top: 10, left: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "#312B3BCC", alignItems: "center", justifyContent: "center" },
  mediaTools: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  linkRow: { minHeight: 48, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  linkInput: { flex: 1, minHeight: 44, fontSize: 13, writingDirection: "ltr" },
  privacyNote: { fontSize: 11, lineHeight: 18, textAlign: "right" },
  message: { fontSize: 13, textAlign: "right", lineHeight: 20 },
});
