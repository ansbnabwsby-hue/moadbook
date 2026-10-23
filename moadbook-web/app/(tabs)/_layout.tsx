import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { usePalette } from "@/components/ui";

export default function TabLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: c.purple,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          height: 58 + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ title: "استكشف", tabBarIcon: ({ color, size }) => <Ionicons name="compass" color={color} size={size} /> }} />
      <Tabs.Screen name="compose" options={{ title: "انشر", tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size + 8} /> }} />
      <Tabs.Screen name="messages" options={{ title: "الرسائل", tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "حسابي", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({ label: { fontSize: 10, fontWeight: "600", marginTop: 1, writingDirection: "rtl" },
});
