import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { AppText, Avatar, Card, usePalette } from "@/components/ui";
import { dbDelete, dbGet, dbPost, dbPut, userFacingError } from "@/lib/firebase/client";
import type { FeedPost, PostComment } from "@/lib/moadbook-types";

function cleanBody(text: string) {
  return String(text || "").replace(/\u2063mbfont:.*?\u2063/g, "").replace(/\u2063mbgallery:\d+\u2063/g, "").trim();
}

function timeAgo(timestamp: number) {
  const delta = Math.max(0, Date.now() - Number(timestamp || 0));
  if (delta < 60_000) return "الآن";
  if (delta < 3_600_000) return `منذ ${Math.floor(delta / 60_000)} د`;
  if (delta < 86_400_000) return `منذ ${Math.floor(delta / 3_600_000)} س`;
  return new Intl.DateTimeFormat("ar-LY", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

function NativeVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  return <VideoView player={player} style={styles.video} nativeControls fullscreenOptions={{ enable: true, orientation: "landscape" }} allowsPictureInPicture contentFit="contain" />;
}

function CommentSheet({ visible, post, userId, userName, onClose, onCommented }: {
  visible: boolean; post: FeedPost; userId: string; userName: string; onClose: () => void; onCommented: () => void;
}) {
  const c = usePalette();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await dbGet<Record<string, Omit<PostComment, "id">> | null>(`/comments/${post.id}`);
      setComments(Object.entries(data ?? {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => a.createdAt - b.createdAt));
    } catch (e) {
      setError(userFacingError(e));
    } finally { setLoading(false); }
  };
  const send = async () => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const createdAt = Date.now();
      const result = await dbPost<{ name: string }>(`/comments/${post.id}`, { authorId: userId, authorName: userName.slice(0, 60), body: body.slice(0, 800), createdAt, postAuthorId: post.authorId });
      if (post.authorId !== userId) {
        await dbPost(`/notifications/${post.authorId}`, { type: "comment", actorId: userId, actorName: userName.slice(0, 60), recipientId: post.authorId, createdAt, targetId: post.id, eventId: result.name, text: "علّق على منشورك", read: false }).catch(() => undefined);
      }
      setValue("");
      await load();
      onCommented();
    } catch (e) { setError(userFacingError(e)); }
    finally { setSending(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onShow={load} onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: c.background }]}>
        <View style={styles.sheetHeader}>
          <AppText bold style={{ fontSize: 19 }}>التعليقات</AppText>
          <Pressable onPress={onClose} accessibilityLabel="إغلاق التعليقات" style={styles.closeButton}><Ionicons name="close" size={23} color={c.text} /></Pressable>
        </View>
        {loading ? <ActivityIndicator style={{ marginTop: 30 }} color={c.purple} /> : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20, gap: 12 }}>
            {!comments.length ? <AppText muted style={{ textAlign: "center", marginTop: 30 }}>ابدأ أول تعليق على هذا المنشور.</AppText> : comments.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Avatar id={comment.authorId} name={comment.authorName} size={34} />
                <View style={[styles.commentBubble, { backgroundColor: c.surface }]}>
                  <View style={styles.commentMeta}><AppText bold style={{ fontSize: 13 }}>{comment.authorName}</AppText><AppText muted style={{ fontSize: 10 }}>{timeAgo(comment.createdAt)}</AppText></View>
                  <AppText style={{ fontSize: 13 }}>{comment.body}</AppText>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        {error ? <AppText style={{ color: c.danger, textAlign: "right", fontSize: 12, marginBottom: 8 }}>{error}</AppText> : null}
        <View style={[styles.composerBar, { borderColor: c.border }]}>
          <TextInput value={value} onChangeText={setValue} placeholder="اكتب تعليقًا..." placeholderTextColor={c.muted} maxLength={800} multiline style={[styles.commentInput, { backgroundColor: c.surface, color: c.text }]} textAlign="right" />
          <Pressable disabled={!value.trim() || sending} onPress={send} style={[styles.sendCircle, { backgroundColor: value.trim() ? c.purple : c.border }]}><Ionicons name="arrow-up" size={18} color="#FFF" /></Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function PostCard({ post, userId, userName, onUpdated }: { post: FeedPost; userId: string; userName: string; onUpdated: () => void }) {
  const c = usePalette();
  const [liked, setLiked] = useState(!!post.liked);
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
  const [commentOpen, setCommentOpen] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const media = post.media;
  const value = media?.value || "";
  const isVideo = media?.type === "videoUrl";
  const isImage = media?.type === "imageData" || media?.type === "imageUrl" || value.startsWith("data:image/") || /\.(png|jpe?g|webp)(\?|$)/i.test(value);
  const externalVideo = isVideo && !/\.(mp4|m4v|mov|m3u8|webm)(\?|$)/i.test(value);

  const toggleLike = async () => {
    if (likeBusy) return;
    const next = !liked;
    setLikeBusy(true);
    setLiked(next);
    setLikesCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const path = `/likes/${post.id}/${userId}`;
      if (next) {
        await dbPut(path, true);
        if (post.authorId !== userId) {
          await dbPost(`/notifications/${post.authorId}`, { type: "like", actorId: userId, actorName: userName.slice(0, 60), recipientId: post.authorId, createdAt: Date.now(), targetId: post.id, text: "أعجب بمنشورك", read: false }).catch(() => undefined);
        }
      } else await dbDelete(path);
    } catch {
      setLiked(!next);
      setLikesCount((n) => Math.max(0, n + (next ? -1 : 1)));
    } finally { setLikeBusy(false); }
  };

  return (
    <Card style={styles.postCard}>
      <View style={styles.postHeader}>
        <Avatar id={post.authorId} name={post.author?.displayName || post.authorName} uri={post.author?.avatarUrl} size={44} />
        <View style={styles.authorCopy}>
          <AppText bold style={{ fontSize: 14 }}>{post.author?.displayName || post.authorName || "عضو"}</AppText>
          <AppText muted style={{ fontSize: 11 }}>{post.author?.username ? `@${post.author.username}  ·  ` : ""}{timeAgo(post.createdAt)}</AppText>
        </View>
        <View style={[styles.typeChip, { backgroundColor: c.soft }]}><AppText style={{ color: c.purple, fontSize: 10, fontWeight: "700" }}>{post.postType === "question" ? "سؤال" : post.postType === "idea" ? "فكرة" : "منشور"}</AppText></View>
      </View>
      {cleanBody(post.body) ? <AppText style={styles.body}>{cleanBody(post.body)}</AppText> : null}
      {value ? (
        <View style={styles.mediaWrap}>
          {isImage ? <Image source={{ uri: value }} contentFit="cover" transition={180} style={styles.mediaImage} /> : isVideo && !externalVideo ? <NativeVideo uri={value} /> : isVideo ? (
            <Pressable onPress={() => Linking.openURL(value).catch(() => undefined)} style={[styles.externalVideo, { backgroundColor: c.elevated }]}>
              <View style={[styles.playBadge, { backgroundColor: c.purple }]}><Ionicons name="play" size={21} color="#FFF" /></View>
              <AppText bold>شاهد الفيديو على المنصة</AppText>
              <AppText muted style={{ fontSize: 12 }}>قد تمنع المنصة تشغيل الفيديو داخل التطبيق.</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.postActions, { borderTopColor: c.border }]}>
        <Pressable onPress={toggleLike} style={styles.action} accessibilityRole="button" accessibilityLabel={liked ? "إلغاء الإعجاب" : "أعجبني"}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? c.danger : c.muted} />
          <AppText muted style={{ fontSize: 12 }}>{likesCount}</AppText>
        </Pressable>
        <Pressable onPress={() => setCommentOpen(true)} style={styles.action} accessibilityRole="button" accessibilityLabel="التعليقات">
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={c.muted} />
          <AppText muted style={{ fontSize: 12 }}>{commentsCount}</AppText>
        </Pressable>
        <View style={{ flex: 1 }} />
        <AppText muted style={{ fontSize: 11 }}>moadbook</AppText>
      </View>
      <CommentSheet visible={commentOpen} post={post} userId={userId} userName={userName} onClose={() => setCommentOpen(false)} onCommented={() => setCommentsCount((n) => n + 1)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  postCard: { padding: 15, gap: 13 },
  postHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  authorCopy: { flex: 1, alignItems: "flex-start" },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  body: { fontSize: 15, lineHeight: 25, textAlign: "right" },
  mediaWrap: { borderRadius: 17, overflow: "hidden", backgroundColor: "#14131B" },
  mediaImage: { width: "100%", height: 270, backgroundColor: "#EEEAF5" },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#111" },
  externalVideo: { minHeight: 205, alignItems: "center", justifyContent: "center", gap: 8, padding: 20 },
  playBadge: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  postActions: { flexDirection: "row-reverse", alignItems: "center", gap: 20, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 2 },
  sheet: { flex: 1, paddingTop: 14, paddingHorizontal: 18, paddingBottom: 16 },
  sheetHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingBottom: 14 },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  commentRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 9 },
  commentBubble: { flex: 1, borderRadius: 15, padding: 11, gap: 3 },
  commentMeta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  composerBar: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  commentInput: { flex: 1, minHeight: 43, maxHeight: 100, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  sendCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 2 },
});
