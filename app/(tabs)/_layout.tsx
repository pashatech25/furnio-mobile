import { Redirect, Tabs } from "expo-router";
import { Home, Images, Plus, Clock3, UserRound } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { useApp } from "../../src/state";
import { colors } from "../../src/ui";
export default function TabLayout() {
  const { user, loading, trial } = useApp();
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
        },
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
