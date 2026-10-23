import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { AppText, Avatar, Card, Page, PageHeading, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { dbGet, dbPut, userFacingError } from "@/lib/firebase/client";
import type { AppNotification } from "@/lib/moadbook-types";

function notificationLabel(type: string) {
  if (type === "like") return "أعجب بمنشورك";
  if (type === "comment") return "علّق على منشورك";
  if (type === "friend_request") return "أرسل لك طلب صداقة";
  if (type === "friend_accept") return "قبل طلب صداقتك";
  if (type === "follow") return "بدأ بمتابعتك";
  if (type === "message") return "أرسل إليك رسالة";
  if (type === "group_member") return "انضم إلى مجتمعك";
  return "لديك إشعار جديد";
}

export default function NotificationsScreen() {
  const c = usePalette();
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const data = await dbGet<Record<string, Omit<AppNotification, "id">> | null>(`/notifications/${session.user.id}`, { orderBy: '"createdAt"', limitToLast: 80 });
      setItems(Object.entries(data || {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) { setError(userFacingError(e)); }
    finally { setLoading(false); }
  }, [session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const markAll = async () => {
    if (!session) return;
    const unread = items.filter((item) => item.read !== true);
    try {
      await Promise.all(unread.map((item) => dbPut(`/notifications/${session.user.id}/${item.id}/read`, true)));
      setItems((old) => old.map((item) => ({ ...item, read: true })));
    } catch (e) { setError(userFacingError(e)); }
  };

  const openItem = async (item: AppNotification) => {
    if (!session) return;
    if (!item.read) {
      await dbPut(`/notifications/${session.user.id}/${item.id}/read`, true).catch(() => undefined);
      setItems((old) => old.map((row) => row.id === item.id ? { ...row, read: true } : row));
    }
    if (item.type === "message") router.push({ pathname: "/(tabs)/messages", params: { conversationId: item.targetId } } as never);
    else if (item.type === "friend_request" || item.type === "friend_accept" || item.type === "follow") router.push({ pathname: "/(tabs)/explore", params: { section: "friends" } } as never);
    else if (item.type === "group_member") router.push({ pathname: "/(tabs)/explore", params: { section: "communities", groupId: item.targetId } } as never);
    else if ((item.type === "like" || item.type === "comment") && item.targetId) router.push({ pathname: "/(tabs)", params: { postId: item.targetId } } as never);
    else router.push("/(tabs)" as never);
  };

  const unreadCount = items.filter((item) => item.read !== true).length;
  return (
    <Page>
      <PageHeading title="الإشعارات" subtitle={unreadCount ? `لديك ${unreadCount} إشعار غير مقروء` : "أنت على اطلاع بكل جديد"} right={<Pressable onPress={() => router.back()} accessibilityLabel="رجوع"><Ionicons name="chevron-down" size={21} color={c.purple} /></Pressable>} />
      {unreadCount > 0 ? <Pressable onPress={markAll} style={styles.markAll}><AppText style={{ color: c.purple, fontSize: 12, fontWeight: "700" }}>تعليم الكل كمقروء</AppText></Pressable> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator size="large" color={c.purple} /></View> : <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => openItem(item)}>
            <Card style={[styles.row, { backgroundColor: item.read ? c.surface : c.soft }]}>
              <Avatar id={item.actorId} name={item.actorName} size={43} />
              <View style={styles.copy}><AppText bold style={{ fontSize: 13 }}>{item.actorName || "عضو"}</AppText><AppText style={{ fontSize: 12 }}>{item.text || notificationLabel(item.type)}</AppText><AppText muted style={{ fontSize: 10 }}>{new Intl.DateTimeFormat("ar-LY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</AppText></View>
              {!item.read ? <View style={[styles.unreadDot, { backgroundColor: c.purple }]} /> : <Ionicons name="chevron-back" size={16} color={c.muted} />}
            </Card>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 9 }} />}
        ListEmptyComponent={<Card style={styles.empty}><Ionicons name="notifications-off-outline" size={30} color={c.purple} /><AppText bold>ما عندك إشعارات جديدة</AppText><AppText muted style={{ textAlign: "center" }}>لما يصير تفاعل على منشوراتك أو حسابك، بتشوفه هنا.</AppText></Card>}
      />}
      {error ? <AppText style={[styles.error, { color: c.danger }]}>{error}</AppText> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  markAll: { alignSelf: "flex-start", marginHorizontal: 20, marginBottom: 10, paddingVertical: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 26 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 13 },
  copy: { flex: 1, alignItems: "flex-start", gap: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 8, marginHorizontal: 16, padding: 24 },
  error: { fontSize: 12, textAlign: "right", padding: 16 },
});
