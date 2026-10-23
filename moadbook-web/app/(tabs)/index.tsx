import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AuthPanel } from "@/components/AuthPanel";
import { PostCard } from "@/components/PostCard";
import { AppButton, AppText, Card, Page, PageHeading, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { dbGet, userFacingError } from "@/lib/firebase/client";
import type { FeedPost, PostMedia, UserProfile } from "@/lib/moadbook-types";
import { rows } from "@/lib/moadbook-types";

export default function HomeScreen() {
  const c = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ postId?: string }>();
  const targetPostId = typeof params.postId === "string" ? params.postId : "";
  const { session, profile, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadFeed = useCallback(async (pull = false) => {
    if (!session) { setLoading(false); return; }
    if (pull) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const data = await dbGet<Record<string, Omit<FeedPost, "id">> | null>("/posts", { orderBy: '"createdAt"', limitToLast: 40 });
      const base = rows(data as Record<string, Omit<FeedPost, "id">> | null).sort((a, b) => b.createdAt - a.createdAt);
      if (targetPostId && !base.some((post) => post.id === targetPostId)) {
        const target = await dbGet<Omit<FeedPost, "id"> | null>(`/posts/${targetPostId}`).catch(() => null);
        if (target) base.unshift({ id: targetPostId, ...target });
      }
      if (targetPostId) base.sort((a, b) => Number(b.id === targetPostId) - Number(a.id === targetPostId));
      const authorCache = new Map<string, UserProfile | null>();
      const enriched = await Promise.all(base.map(async (post) => {
        const [media, likes, comments] = await Promise.all([
          dbGet<PostMedia | null>(`/postMedia/${post.id}`).catch(() => null),
          dbGet<Record<string, boolean> | null>(`/likes/${post.id}`).catch(() => null),
          dbGet<Record<string, unknown> | null>(`/comments/${post.id}`).catch(() => null),
        ]);
        let author = authorCache.get(post.authorId);
        if (author === undefined) {
          author = await dbGet<Record<string, unknown> | null>(`/profiles/${post.authorId}`).then((row) => row ? { ...row, id: post.authorId } as UserProfile : null).catch(() => null);
          authorCache.set(post.authorId, author);
        }
        return { ...post, media, author, liked: !!likes?.[session.user.id], likesCount: Object.keys(likes ?? {}).length, commentsCount: Object.keys(comments ?? {}).length };
      }));
      setPosts(enriched);
    } catch (e) {
      setError(userFacingError(e));
    } finally { setLoading(false); setRefreshing(false); }
  }, [session, targetPostId]);

  useFocusEffect(useCallback(() => { void loadFeed(); }, [loadFeed]));

  if (authLoading) return <Page style={styles.center}><ActivityIndicator color={c.purple} size="large" /></Page>;
  if (!session) return <Page><AuthPanel /></Page>;

  return (
    <Page>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFeed(true)} tintColor={c.purple} />}
        ListHeaderComponent={(
          <View>
            <PageHeading
              title="moadbook"
              subtitle="مساحتك، وأفكارك، ومجتمعك"
              right={<Pressable onPress={() => router.push("/notifications" as never)} accessibilityRole="button" accessibilityLabel="الإشعارات"><Ionicons name="notifications-outline" size={20} color={c.purple} /></Pressable>}
            />
            {targetPostId ? <Card style={styles.targetBanner}><AppText bold>المنشور المرتبط بالإشعار يظهر أولًا</AppText><Pressable onPress={() => router.setParams({ postId: undefined })}><AppText style={{ color: c.purple, fontSize: 12, fontWeight: "700" }}>العودة إلى أحدث المشاركات</AppText></Pressable></Card> : null}
            <View style={styles.greeting}>
              <AppText bold style={styles.greetingTitle}>أهلًا، {profile?.displayName || session.user.username}</AppText>
              <AppText muted style={{ fontSize: 13 }}>وش حاب تشارك مجتمعك اليوم؟</AppText>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/compose" as never)} accessibilityRole="button">
              <Card style={styles.composeTeaser}>
                <View style={[styles.composeIcon, { backgroundColor: c.soft }]}><Ionicons name="create-outline" size={20} color={c.purple} /></View>
                <View style={{ flex: 1, alignItems: "flex-start" }}><AppText bold>اكتب منشورًا جديدًا</AppText><AppText muted style={{ fontSize: 11 }}>فكرة، سؤال، أو صورة واحدة</AppText></View>
                <Ionicons name="arrow-back" size={17} color={c.muted} />
              </Card>
            </Pressable>
            <View style={styles.feedLabel}><AppText bold style={{ fontSize: 17 }}>آخر المشاركات</AppText><View style={[styles.liveDot, { backgroundColor: c.positive }]} /><AppText muted style={{ fontSize: 11 }}>الأحدث</AppText></View>
          </View>
        )}
        renderItem={({ item }) => <PostCard post={item} userId={session.user.id} userName={profile?.displayName || session.user.username} onUpdated={() => loadFeed(true)} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={c.purple} /><AppText muted style={{ marginTop: 8 }}>نجهّز موجزك…</AppText></View> : error ? (
          <Card style={styles.emptyCard}><AppText bold>تعذر تحميل الموجز</AppText><AppText muted style={{ textAlign: "center" }}>{error}</AppText><AppButton title="إعادة المحاولة" icon="refresh" variant="soft" onPress={() => loadFeed()} /></Card>
        ) : <Card style={styles.emptyCard}><Ionicons name="sparkles-outline" size={30} color={c.purple} /><AppText bold>موجزك يبدأ من هنا</AppText><AppText muted style={{ textAlign: "center" }}>تابع المجتمعات والأصدقاء أو شارك أول فكرة لك.</AppText><AppButton title="اكتب أول منشور" icon="create-outline" onPress={() => router.push("/(tabs)/compose" as never)} /></Card>}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  greeting: { paddingHorizontal: 4, paddingBottom: 13, alignItems: "flex-start" },
  greetingTitle: { fontSize: 19, marginBottom: 1 },
  composeTeaser: { flexDirection: "row-reverse", alignItems: "center", gap: 11, paddingVertical: 12, paddingHorizontal: 13 },
  composeIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  feedLabel: { flexDirection: "row-reverse", alignItems: "center", gap: 7, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, marginRight: 2 },
  empty: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  emptyCard: { alignItems: "center", gap: 10, marginTop: 8, padding: 24 },
  targetBanner: { alignItems: "flex-start", gap: 6, padding: 12 },
});
