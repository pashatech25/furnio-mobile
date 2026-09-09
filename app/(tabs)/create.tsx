import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { services } from "../../src/services";
import { useApp } from "../../src/state";
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
export default function Create() {
  const { runtime, billing, trial } = useApp();
  return (
    <Page right={<Pill>{billing?.balance ?? "—"} credits</Pill>}>
      <Kicker>MAKE SOMETHING REMARKABLE</Kicker>
      <Heading>What’s your{"\n"}next transformation?</Heading>
      <Body muted>Nine considered ways to bring a property to life.</Body>
      <Button
        title="Edit a batch of photos"
        secondary
        onPress={() => router.push("/batch")}
      />
      {trial?.state === "active" && (
        <Notice>
          Your trial includes{" "}
          {trial.allowedServiceSlugs.join(" and ").replaceAll("_", " ")}. Other
          services require usable credits.
        </Notice>
      )}
      {!runtime && (
        <Notice>
          Service availability is loading. We will not substitute a hard-coded
          live catalog.
        </Notice>
      )}
      {services
        .filter((service) =>
          runtime?.features.some((feature) => feature.slug === service.id),
        )
        .map((service) => {
          const feature = runtime?.features.find(
            (item) => item.slug === service.id,
          );
          return (
            <Pressable
              accessibilityRole="button"
              key={service.id}
              onPress={() => router.push(`/studio/${service.id}`)}
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: colors.line,
                overflow: "hidden",
                backgroundColor: colors.paper,
              }}
            >
              <Image
                source={service.image}
                style={{ width: "100%", height: 155 }}
              />
              <View style={[styles.between, { padding: 18 }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Heading small style={{ fontSize: 28 }}>
                    {service.name}
                  </Heading>
                  <Body muted style={{ fontSize: 13 }}>
                    {service.description}
                  </Body>
                  <Body style={{ fontSize: 12, fontFamily: "DMBold" }}>
                    {feature?.credits_per_output} credits per output
                  </Body>
                </View>
                <ChevronRight color={colors.ink} />
              </View>
            </Pressable>
          );
        })}
    </Page>
  );
}
