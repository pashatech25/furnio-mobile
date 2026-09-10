import { Redirect, Tabs } from "expo-router";
import { Home, Images, Plus, Clock3, UserRound } from "lucide-react-native";
import { ActivityIndicator, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../../src/state";
import { colors } from "../../src/ui";
export default function TabLayout() {
  const { user, loading, trial } = useApp();
  const insets = useSafeAreaInsets();
  if (loading) return <ActivityIndicator color={colors.ink} />;
  if (!user) return <Redirect href="/sign-in" />;
  if (trial?.phoneRequired && !trial.phoneVerified)
    return <Redirect href="/verify" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          minHeight: 74,
          paddingTop: 8,
          paddingBottom: 8,
          ...(Platform.OS === "android"
            ? {
                height: 80 + Math.max(8, insets.bottom),
                paddingBottom: Math.max(8, insets.bottom),
              }
            : {}),
        },
        // Android's default icon slot is smaller than our 42px Create tile.
        // Reserve its full height and keep every label above the system gesture area.
        ...(Platform.OS === "android"
          ? {
              tabBarIconStyle: { width: 44, height: 42 },
              tabBarLabelPosition: "below-icon" as const,
            }
          : {}),
        tabBarLabelStyle: { fontFamily: "DMMedium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color }) => <Images size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
          tabBarIcon: () => (
            <View
              style={{
                backgroundColor: colors.ink,
                borderRadius: 15,
                padding: 10,
              }}
            >
              <Plus size={22} color={colors.paper} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color }) => <Clock3 size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "You",
          tabBarIcon: ({ color }) => <UserRound size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
