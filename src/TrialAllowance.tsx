import { useApp } from "./state";
import { trialRemaining } from "./api/funding";
import { services } from "./services";
import { Body, Card, Heading } from "./ui";

export function TrialAllowance() {
  const { trial } = useApp();
  const remaining = trialRemaining(trial);
  if (remaining === null || !trial) return null;
  const names = trial.allowedServiceSlugs.map(slug => services.find(service => service.id === slug)?.name ?? slug.replaceAll("_", " "));
  return <Card>
    <Heading small>Free preview trial</Heading>
    <Body>{remaining} of {trial.successfulOutputLimit} watermarked previews left</Body>
    <Body muted>Available for {names.join(" and ")}. These previews are separate from your credit balance. Other services and batch edits require usable credits.</Body>
  </Card>;
}
