import { ServicePhoto } from "../../src/ServicePhoto";
import { TrialAllowance } from "../../src/TrialAllowance";
import { isServiceLocked } from "../../src/api/funding";
import { useCallback } from "react";
import { AppState, Image, ImageBackground, Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ArrowUpRight, ChevronRight, Sparkles } from "lucide-react-native";
import { useApp } from "../../src/state";
import { demo } from "../../src/config";
import { photos, services } from "../../src/services";
import {
  Body,
  Button,
  colors,
  Heading,
  Kicker,
  Notice,
  Page,
  Pill,
  styles,
} from "../../src/ui";
export default function Home() {
  const { user, billing, projects, runtime, error, refresh, trial } = useApp();
  useFocusEffect(useCallback(() => {
    void refresh();
    const foreground = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
    });
    return () => foreground.remove();
  }, [refresh]));
  const active = services.filter((service) =>
    runtime?.features.some((feature) => feature.slug === service.id),
  );
  return (
    <Page
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your account"
          onPress={() => router.push("/account")}
          style={{
            width: 43,
            height: 43,
            borderRadius: 24,
            backgroundColor: "#e2b998",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Body>{user?.name.slice(0, 1).toUpperCase()}</Body>
        </Pressable>
      }
    >
      <View style={{ gap: 8 }}>
        <Kicker>YOUR CREATIVE WORKSPACE</Kicker>
        <Heading>
          Good to see you,{"\n"}
          {user?.name.split(" ")[0]}.
        </Heading>
        <Body muted>Let’s make your next listing stand out.</Body>
      </View>
      {!!error && <Notice warning>{error}</Notice>}
      <TrialAllowance />
      {!!error && (
        <Button
          title="Refresh account"
          secondary
          onPress={() => void refresh()}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start a new project"
        onPress={() => router.push("/create")}
      >
        <ImageBackground
          source={photos.stage}
          resizeMode="cover"
          imageStyle={{ width: "100%", height: "100%" }}
          style={{
            height: 257,
            borderRadius: 23,
            overflow: "hidden",
            justifyContent: "flex-end",
          }}
        >
          <View style={{ backgroundColor: "#102c24c9", padding: 20, gap: 8 }}>
            <View style={styles.between}>
              <Pill>MADE FOR YOUR NEXT LISTING</Pill>
              <ArrowUpRight size={24} color={colors.paper} />
            </View>
            <Heading small style={{ color: colors.paper }}>
              A room full of possibility.
            </Heading>
            <Body style={{ color: "#d9e2d7", fontSize: 14 }}>
              Choose a photo. Make it Furnio.
            </Body>
          </View>
        </ImageBackground>
      </Pressable>
      <View
        style={[
          styles.between,
          { backgroundColor: colors.soft, borderRadius: 18, padding: 16 },
        ]}
      >
        <View>
          <Body style={{ fontSize: 25, lineHeight: 34, paddingTop: 2, fontFamily: "DMMedium" }}>
            {billing?.balance ?? "—"} credits
          </Body>
          <Body muted style={{ fontSize: 12 }}>
            One balance. Web + app.
          </Body>
        </View>
        <Button
          title="View credits"
          secondary
          onPress={() => router.push("/wallet")}
        />
      </View>
      <View style={styles.between}>
        <Body style={{ fontFamily: "DMBold" }}>Recent projects</Body>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/projects")}
          style={{ padding: 8 }}
        >
          <Body muted style={{ fontSize: 13 }}>
            View all
          </Body>
        </Pressable>
      </View>
      {projects.slice(0, 3).map((project, index) => (
        <Pressable
          key={project.id}
          accessibilityRole="button"
          onPress={() => router.push(`/project/${project.id}`)}
          style={[
            styles.row,
            {
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderColor: colors.line,
            },
          ]}
        >
          {demo ? (
            <Image
              source={index ? photos.twilight : photos.after}
              style={{ width: 70, height: 70, borderRadius: 14 }}
            />
          ) : (
            <View
              style={{
                padding: 18,
                backgroundColor: colors.soft,
                borderRadius: 14,
              }}
            >
              <Sparkles color={colors.ink} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Body style={{ fontFamily: "DMBold", fontSize: 15 }}>
              {project.name}
            </Body>
            <Body muted style={{ fontSize: 12 }}>
              {project.address}
            </Body>
          </View>
          <ChevronRight color={colors.muted} size={19} />
        </Pressable>
      ))}
      {!projects.length && (
        <Button
          title="Create your first project"
          onPress={() => router.push("/new-project")}
          icon
        />
      )}
      <Body style={{ fontFamily: "DMBold" }}>A little inspiration</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {active.filter(service => !isServiceLocked(trial, service.id, billing?.balance ?? null, runtime?.features.find(feature => feature.slug === service.id)?.credits_per_output)).slice(0, 4).map((service) => (
          <Pressable
            key={service.id}
            accessibilityRole="button"
            onPress={() => router.push(`/studio/${service.id}`)}
            style={{
              width: "48%",
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: colors.paper,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
<ServicePhoto service={service} compact />
          </Pressable>
        ))}
      </View>
    </Page>
  );
}
