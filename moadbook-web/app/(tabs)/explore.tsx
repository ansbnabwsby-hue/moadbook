import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { AuthPanel } from "@/components/AuthPanel";
import { AppButton, AppText, Avatar, Card, Page, PageHeading, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { dbDelete, dbGet, dbPost, dbPut, userFacingError } from "@/lib/firebase/client";
import type { Community, Friendship, UserProfile } from "@/lib/moadbook-types";
import { rows } from "@/lib/moadbook-types";
import { currentTimestamp } from "@/lib/time";

const categories = ["الكل", "عام", "ألعاب", "تقنية", "أنمي ورسوم", "صناع محتوى", "تعليم", "تصوير وتصميم", "ترفيه"];
const friendshipKey = (a: string, b: string) => [a, b].sort().join("__");

export default function ExploreScreen() {
  const c = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; groupId?: string }>();
  const { session, profile, loading: authLoading } = useAuth();
  const section = params.section === "friends" ? "friends" : "communities";
  const targetGroupId = typeof params.groupId === "string" ? params.groupId : "";
  const [communities, setCommunities] = useState<Community[]>([]);
  const [members, setMembers] = useState<Record<string, Record<string, string>>>({});
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const [groupRows, memberRows, profileRows, friendshipRows] = await Promise.all([
        dbGet<Record<string, Omit<Community, "id">> | null>("/groups"),
        dbGet<Record<string, Record<string, string>> | null>("/groupMembers"),
        dbGet<Record<string, Omit<UserProfile, "id">> | null>("/profiles"),
        dbGet<Record<string, Omit<Friendship, "id">> | null>("/friendships"),
      ]);
      setCommunities(rows(groupRows as Record<string, Omit<Community, "id">> | null).map((g) => ({ ...g, category: g.category || "عام" })));
      setMembers(memberRows || {});
      setPeople(rows(profileRows as Record<string, Omit<UserProfile, "id">> | null).filter((p) => p.id !== session.user.id));
      setFriendships(rows(friendshipRows as Record<string, Omit<Friendship, "id">> | null));
    } catch (e) { setError(userFacingError(e)); }
    finally { setLoading(false); }
  }, [session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visibleGroups = useMemo(() => communities.map((g) => ({ ...g, memberCount: Object.keys(members[g.id] || {}).length, joined: members[g.id]?.[session?.user.id || ""] === "member" }))
    .filter((g) => (!targetGroupId || g.id === targetGroupId) && (category === "الكل" || g.category === category) && `${g.name} ${g.description} ${g.category}`.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar")))
    .sort((a, b) => Number(b.memberCount) - Number(a.memberCount) || Number(b.createdAt) - Number(a.createdAt)), [communities, members, category, search, session, targetGroupId]);

  const visiblePeople = useMemo(() => people.filter((p) => `${p.displayName} ${p.username}`.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar"))).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar")), [people, search]);

  if (authLoading) return <Page style={styles.center}><ActivityIndicator color={c.purple} size="large" /></Page>;
  if (!session) return <Page><AuthPanel /></Page>;

  const toggleJoin = async (group: Community) => {
    setBusyId(group.id);
    setError("");
    try {
      if (members[group.id]?.[session.user.id] === "member") {
        await dbDelete(`/groupMembers/${group.id}/${session.user.id}`);
        setMembers((old) => { const next = { ...old, [group.id]: { ...(old[group.id] || {}) } }; delete next[group.id][session.user.id]; return next; });
      } else {
        await dbPut(`/groupMembers/${group.id}/${session.user.id}`, "member");
        setMembers((old) => ({ ...old, [group.id]: { ...(old[group.id] || {}), [session.user.id]: "member" } }));
      }
    } catch (e) { setError(userFacingError(e)); }
    finally { setBusyId(""); }
  };

  const updateFriend = async (person: UserProfile, relation?: Friendship) => {
    const id = friendshipKey(session.user.id, person.id);
    setBusyId(person.id);
    setError("");
    try {
      if (relation?.status === "pending" && relation.recipientId === session.user.id) {
        const accepted = { requesterId: relation.requesterId, recipientId: relation.recipientId, status: "accepted", createdAt: relation.createdAt };
        await dbPut(`/friendships/${id}`, accepted);
        await dbPost(`/notifications/${relation.requesterId}`, { type: "friend_accept", actorId: session.user.id, actorName: (profile?.displayName || session.user.username).slice(0, 60), recipientId: relation.requesterId, createdAt: currentTimestamp(), targetId: id, text: "قبل طلب صداقتك", read: false }).catch(() => undefined);
      } else if (!relation) {
        const row = { requesterId: session.user.id, recipientId: person.id, status: "pending", createdAt: currentTimestamp() };
        await dbPut(`/friendships/${id}`, row);
        await dbPost(`/notifications/${person.id}`, { type: "friend_request", actorId: session.user.id, actorName: (profile?.displayName || session.user.username).slice(0, 60), recipientId: person.id, createdAt: currentTimestamp(), targetId: id, text: "أرسل لك طلب صداقة", read: false }).catch(() => undefined);
      }
      await load();
    } catch (e) { setError(userFacingError(e)); }
    finally { setBusyId(""); }
  };

  const relationFor = (personId: string) => friendships.find((r) => (r.requesterId === session.user.id && r.recipientId === personId) || (r.recipientId === session.user.id && r.requesterId === personId));

  const openChat = async (person: UserProfile, relation: Friendship) => {
    const id = friendshipKey(session.user.id, person.id);
    setBusyId(person.id);
    setError("");
    try {
      let conversation = await dbGet<Record<string, unknown> | null>(`/conversations/${id}`).catch(() => null);
      if (!conversation) {
        const createdAt = currentTimestamp();
        conversation = { memberA: relation.requesterId, memberB: relation.recipientId, createdAt, updatedAt: createdAt, lastMessage: "", lastSenderId: "" };
        await dbPut(`/conversations/${id}`, conversation);
      }
      await Promise.all([dbPut(`/conversationIndex/${session.user.id}/${id}`, true), dbPut(`/conversationIndex/${person.id}/${id}`, true)]);
      router.push({ pathname: "/(tabs)/messages", params: { conversationId: id } } as never);
    } catch (e) { setError(userFacingError(e)); }
    finally { setBusyId(""); }
  };

  return (
    <Page>
      <PageHeading title="استكشف" subtitle="اعثر على مجتمعك وأصدقاء جدد" right={<Ionicons name="sparkles" size={19} color={c.purple} />} />
      <View style={styles.content}>
        <View style={[styles.segment, { backgroundColor: c.elevated }]}>
          {(["communities", "friends"] as const).map((id) => {
            const active = section === id;
            return <Pressable key={id} onPress={() => router.setParams({ section: id, groupId: undefined })} style={[styles.segmentButton, active && { backgroundColor: c.surface }]}><AppText style={{ color: active ? c.purple : c.muted, fontWeight: active ? "700" : "500", fontSize: 13 }}>{id === "communities" ? "المجتمعات" : "الأصدقاء"}</AppText></Pressable>;
          })}
        </View>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}><Ionicons name="search" size={18} color={c.muted} /><TextInput value={search} onChangeText={setSearch} placeholder={section === "communities" ? "ابحث عن مجتمع" : "ابحث عن عضو"} placeholderTextColor={c.muted} style={[styles.searchInput, { color: c.text }]} textAlign="right" /></View>
        {section === "communities" ? <FlatList
          data={visibleGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<View style={styles.categories}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, { backgroundColor: category === item ? c.soft : c.surface, borderColor: category === item ? c.purple : c.border }]}><AppText style={{ color: category === item ? c.purple : c.muted, fontSize: 11, fontWeight: "700" }}>{item}</AppText></Pressable>)}</View>}
          renderItem={({ item }) => <Card style={styles.groupCard}><View style={[styles.groupMark, { backgroundColor: c.soft }]}><Ionicons name="people" size={22} color={c.purple} /></View><View style={styles.groupCopy}><AppText bold>{item.name}</AppText><AppText muted numberOfLines={2} style={{ fontSize: 12 }}>{item.description || "مساحة للتعارف وتبادل الأفكار."}</AppText><AppText muted style={{ fontSize: 10, marginTop: 3 }}>{item.category} · {item.memberCount} عضو</AppText></View><AppButton title={item.joined ? "انضممت" : "انضم"} icon={item.joined ? "checkmark" : "add"} variant={item.joined ? "soft" : "primary"} onPress={() => toggleJoin(item)} loading={busyId === item.id} style={styles.joinButton} /></Card>}
          ItemSeparatorComponent={() => <View style={{ height: 9 }} />}
          ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={c.purple} /></View> : <Card style={styles.emptyCard}><AppText bold>لا توجد مجتمعات مطابقة</AppText><AppText muted style={{ textAlign: "center" }}>جرّب تغيير كلمة البحث أو التصنيف.</AppText></Card>}
        /> : <FlatList
          data={visiblePeople}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const relation = relationFor(item.id);
            const accepted = relation?.status === "accepted";
            const incoming = relation?.status === "pending" && relation.recipientId === session.user.id;
            const sent = relation?.status === "pending" && relation.requesterId === session.user.id;
            return <Card style={styles.personCard}><Avatar id={item.id} name={item.displayName} uri={item.avatarUrl} size={46} /><View style={styles.personCopy}><AppText bold>{item.displayName || item.username}</AppText><AppText muted style={{ fontSize: 11 }}>@{item.username}</AppText>{item.bio ? <AppText muted numberOfLines={1} style={{ fontSize: 11 }}>{item.bio}</AppText> : null}</View>{accepted ? <AppButton title="رسالة" icon="chatbubble-outline" variant="soft" onPress={() => openChat(item, relation!)} loading={busyId === item.id} style={styles.personAction} /> : sent ? <AppButton title="تم الإرسال" icon="time-outline" variant="outline" onPress={() => undefined} style={styles.personAction} /> : <AppButton title={incoming ? "قبول" : "إضافة"} icon={incoming ? "checkmark" : "person-add-outline"} onPress={() => updateFriend(item, relation)} loading={busyId === item.id} style={styles.personAction} />}</Card>;
          }}
          ItemSeparatorComponent={() => <View style={{ height: 9 }} />}
          ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={c.purple} /></View> : <Card style={styles.emptyCard}><AppText bold>لا يوجد أعضاء مطابقون</AppText><AppText muted style={{ textAlign: "center" }}>عندما ينضم أعضاء جدد سيظهرون هنا.</AppText></Card>}
        />}
        {error ? <AppText style={[styles.error, { color: c.danger }]}>{error}</AppText> : null}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  content: { flex: 1, paddingHorizontal: 16 },
  segment: { flexDirection: "row-reverse", padding: 4, borderRadius: 15, marginBottom: 11 },
  segmentButton: { flex: 1, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  search: { minHeight: 45, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, marginBottom: 9 },
  searchInput: { flex: 1, minHeight: 42, fontSize: 13, writingDirection: "rtl" },
  list: { paddingBottom: 24 },
  categories: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, paddingBottom: 11 },
  category: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  groupCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12 },
  groupMark: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  groupCopy: { flex: 1, alignItems: "flex-start", gap: 1 },
  joinButton: { minHeight: 38, paddingHorizontal: 10, borderRadius: 12 },
  personCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12 },
  personCopy: { flex: 1, alignItems: "flex-start" },
  personAction: { minHeight: 38, paddingHorizontal: 10, borderRadius: 12 },
  empty: { minHeight: 140, alignItems: "center", justifyContent: "center" },
  emptyCard: { alignItems: "center", gap: 8, padding: 22 },
  error: { fontSize: 12, textAlign: "right", paddingBottom: 8 },
});
