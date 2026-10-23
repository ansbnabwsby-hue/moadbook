import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { AuthPanel } from "@/components/AuthPanel";
import { AppText, Avatar, Card, Page, PageHeading, usePalette } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { dbGet, dbPost, dbPut, userFacingError } from "@/lib/firebase/client";
import type { ChatMessage, Conversation, UserProfile } from "@/lib/moadbook-types";

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("ar-LY", { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

export default function MessagesScreen() {
  const c = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const { session, profile, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const loadConversations = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const index = await dbGet<Record<string, boolean> | null>(`/conversationIndex/${session.user.id}`);
      const ids = Object.keys(index || {});
      const rows = await Promise.all(ids.map(async (id) => {
        const row = await dbGet<Omit<Conversation, "id"> | null>(`/conversations/${id}`).catch(() => null);
        if (!row) return null;
        const otherId = row.memberA === session.user.id ? row.memberB : row.memberA;
        const person = await dbGet<Record<string, unknown> | null>(`/profiles/${otherId}`).catch(() => null);
        return { id, ...row, person: person ? { ...person, id: otherId } as UserProfile : { id: otherId, username: "", displayName: "عضو", bio: "" } } as Conversation;
      }));
      const sorted = rows.filter((row): row is Conversation => !!row).sort((a, b) => b.updatedAt - a.updatedAt);
      setConversations(sorted);
    } catch (e) { setError(userFacingError(e)); }
    finally { setLoading(false); }
  }, [session]);

  const openConversation = useCallback(async (conversation: Conversation) => {
    if (!session) return;
    setActive(conversation);
    setError("");
    await dbPut(`/conversationIndex/${session.user.id}/${conversation.id}`, true).catch(() => undefined);
    setLoading(true);
    try {
      const data = await dbGet<Record<string, Omit<ChatMessage, "id">> | null>(`/messages/${conversation.id}`, { orderBy: '"createdAt"', limitToLast: 60 });
      setMessages(Object.entries(data || {}).map(([id, row]) => ({ id, ...row })).sort((a, b) => a.createdAt - b.createdAt));
    } catch (e) { setError(userFacingError(e)); }
    finally { setLoading(false); }
  }, [session]);

  useFocusEffect(useCallback(() => { void loadConversations(); }, [loadConversations]));

  useEffect(() => {
    const id = typeof params.conversationId === "string" ? params.conversationId : "";
    if (!id || !session) return;
    let activeEffect = true;
    (async () => {
      try {
        const row = await dbGet<Omit<Conversation, "id"> | null>(`/conversations/${id}`);
        if (!row || !activeEffect) return;
        const otherId = row.memberA === session.user.id ? row.memberB : row.memberA;
        const person = await dbGet<Record<string, unknown> | null>(`/profiles/${otherId}`).catch(() => null);
        const conversation: Conversation = { id, ...row, person: person ? { ...person, id: otherId } as UserProfile : { id: otherId, username: "", displayName: "عضو", bio: "" } };
        await openConversation(conversation);
      } catch (e) { if (activeEffect) setError(userFacingError(e)); }
    })();
    return () => { activeEffect = false; };
  }, [params.conversationId, session, openConversation]);

  const send = async () => {
    const body = value.trim();
    if (!active || !session || !body || sending) return;
    setSending(true);
    setError("");
    try {
      const createdAt = Date.now();
      const authorName = (profile?.displayName || session.user.displayName || session.user.username).slice(0, 60);
      const result = await dbPost<{ name: string }>(`/messages/${active.id}`, { authorId: session.user.id, authorName, body: body.slice(0, 2000), createdAt });
      const updated = { memberA: active.memberA, memberB: active.memberB, createdAt: active.createdAt, updatedAt: createdAt, lastMessage: body.slice(0, 120), lastSenderId: session.user.id };
      await dbPut(`/conversations/${active.id}`, updated);
      await Promise.all([dbPut(`/conversationIndex/${session.user.id}/${active.id}`, true), dbPut(`/conversationIndex/${active.person?.id || (active.memberA === session.user.id ? active.memberB : active.memberA)}/${active.id}`, true)]);
      const recipientId = active.memberA === session.user.id ? active.memberB : active.memberA;
      await dbPost(`/notifications/${recipientId}`, { type: "message", actorId: session.user.id, actorName: authorName, recipientId, createdAt, targetId: active.id, eventId: result.name, text: "أرسل إليك رسالة", read: false }).catch(() => undefined);
      setMessages((old) => [...old, { id: result.name, authorId: session.user.id, authorName, body, createdAt }]);
      setValue("");
      void loadConversations();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (e) { setError(userFacingError(e)); }
    finally { setSending(false); }
  };

  if (authLoading) return <Page style={styles.center}><ActivityIndicator color={c.purple} size="large" /></Page>;
  if (!session) return <Page><AuthPanel /></Page>;

  if (active) {
    return (
      <Page>
        <PageHeading title={active.person?.displayName || "محادثة"} subtitle={active.person?.username ? `@${active.person.username}` : "رسائل خاصة"} right={<Pressable onPress={() => { setActive(null); setMessages([]); router.setParams({ conversationId: undefined }); }} accessibilityLabel="قائمة المحادثات"><Ionicons name="chevron-forward" size={21} color={c.purple} /></Pressable>} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.messageList} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled">
            {loading ? <ActivityIndicator color={c.purple} style={{ marginTop: 25 }} /> : messages.length ? messages.map((message) => {
              const mine = message.authorId === session.user.id;
              return <View key={message.id} style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirRow]}><View style={[styles.bubble, { backgroundColor: mine ? c.purple : c.surface, borderColor: mine ? c.purple : c.border }]}><AppText style={{ color: mine ? "#FFFFFF" : c.text, fontSize: 14 }}>{message.body}</AppText><AppText style={{ color: mine ? "#E7E2FF" : c.muted, fontSize: 9, textAlign: "left", marginTop: 4 }}>{formatTime(message.createdAt)}</AppText></View></View>;
            }) : <View style={styles.firstMessage}><Ionicons name="chatbubble-ellipses-outline" size={29} color={c.purple} /><AppText muted>هذه بداية محادثتكما. قل مرحبًا!</AppText></View>}
          </ScrollView>
          {error ? <AppText style={{ color: c.danger, textAlign: "right", paddingHorizontal: 14, fontSize: 12 }}>{error}</AppText> : null}
          <View style={[styles.composer, { borderColor: c.border }]}><TextInput value={value} onChangeText={setValue} placeholder="اكتب رسالة..." placeholderTextColor={c.muted} maxLength={2000} multiline textAlign="right" style={[styles.messageInput, { backgroundColor: c.surface, color: c.text }]} /><Pressable disabled={!value.trim() || sending} onPress={send} style={[styles.sendButton, { backgroundColor: value.trim() ? c.purple : c.border }]}><Ionicons name="arrow-up" size={19} color="#FFF" /></Pressable></View>
        </KeyboardAvoidingView>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeading title="الرسائل" subtitle="محادثاتك مع الأصدقاء" right={<Ionicons name="chatbubbles" size={19} color={c.purple} />} />
      {error ? <AppText style={{ color: c.danger, textAlign: "right", paddingHorizontal: 18, fontSize: 12 }}>{error}</AppText> : null}
      {loading && !conversations.length ? <View style={styles.loading}><ActivityIndicator size="large" color={c.purple} /></View> : <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Pressable onPress={() => openConversation(item)}><Card style={styles.chatRow}><Avatar id={item.person?.id} name={item.person?.displayName} uri={item.person?.avatarUrl} size={48} /><View style={styles.chatCopy}><View style={styles.chatMeta}><AppText bold>{item.person?.displayName || "عضو"}</AppText><AppText muted style={{ fontSize: 10 }}>{formatTime(item.updatedAt)}</AppText></View><AppText muted numberOfLines={1} style={{ fontSize: 12 }}>{item.lastMessage || "ابدأ المحادثة"}</AppText></View><Ionicons name="chevron-back" size={16} color={c.muted} /></Card></Pressable>}
        ItemSeparatorComponent={() => <View style={{ height: 9 }} />}
        ListEmptyComponent={<Card style={styles.empty}><Ionicons name="mail-open-outline" size={30} color={c.purple} /><AppText bold>ما عندك محادثات بعد</AppText><AppText muted style={{ textAlign: "center" }}>أضف صديقًا من صفحة «استكشف» وابدأوا الكلام.</AppText><Pressable onPress={() => router.push("/(tabs)/explore" as never)}><AppText style={{ color: c.purple, fontWeight: "700" }}>استكشف الأصدقاء</AppText></Pressable></Card>}
      />}
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  chatRow: { flexDirection: "row-reverse", alignItems: "center", gap: 11, padding: 13 },
  chatCopy: { flex: 1, alignItems: "flex-start", gap: 3 },
  chatMeta: { width: "100%", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  empty: { alignItems: "center", gap: 8, marginHorizontal: 16, padding: 24 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  messageList: { flexGrow: 1, padding: 15, gap: 9, justifyContent: "flex-end" },
  bubbleRow: { width: "100%", flexDirection: "row" },
  mineRow: { justifyContent: "flex-start" },
  theirRow: { justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  firstMessage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9, paddingVertical: 50 },
  composer: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 8 },
  messageInput: { flex: 1, minHeight: 43, maxHeight: 110, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14 },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 2 },
});
