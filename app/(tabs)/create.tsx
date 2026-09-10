import { ServicePhoto } from "../../src/ServicePhoto";
import { TrialAllowance } from "../../src/TrialAllowance";
import { hasServiceCredits, isServiceLocked } from "../../src/api/funding";
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
      <TrialAllowance />
      <Button
        title="Edit a batch of photos"
        secondary
        disabled={!runtime?.features.some(feature => hasServiceCredits(billing?.balance ?? null, feature.credits_per_output))}
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
          const locked = isServiceLocked(trial, service.id, billing?.balance ?? null, feature?.credits_per_output);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: locked }}
              disabled={locked}
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
<ServicePhoto service={service} credits={feature?.credits_per_output} locked={locked} />
            </Pressable>
          );
        })}
    </Page>
  );
}
