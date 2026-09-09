import { useCallback, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Check, Clock3 } from "lucide-react-native";
import { mobileApi, useApp } from "../../src/state";
import { demo } from "../../src/config";
import { sampleHistory, sampleProjects } from "../../src/data/demo";
import {
  activityPageSchema,
  capabilitiesSchema,
  type ActivityItem,
} from "../../src/api/schemas";
import { getService } from "../../src/services";
import {
  Body,
  Button,
  Card,
  colors,
  Heading,
  Notice,
  Page,
  styles,
} from "../../src/ui";
type Cursor = { createdAt: string; id: string } | null;
export default function Activity() {
  const { user } = useApp(),
    sequence = useRef(0);
  const [items, setItems] = useState<ActivityItem[]>([]),
    [cursor, setCursor] = useState<Cursor>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (before: Cursor = null) => {
      const seq = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        if (demo) {
          setItems(
            sampleHistory.map((job) => ({
              id: job.id,
              projectId: sampleProjects[0]?.id ?? null,
              projectName: sampleProjects[0]?.name ?? null,
              createdAt: job.created_at,
              featureSlug: job.featureSlug,
              status: job.status,
              archived: false,
            })),
          );
          setCursor(null);
          return;
        }
        if (!user) throw new Error("Sign in to see your activity.");
        const capabilities = await mobileApi(
          "/v1/capabilities",
          capabilitiesSchema,
        );
        if (!capabilities.activityReady)
          throw new Error(
            "Complete activity browsing is not enabled yet. You can still open each project’s history.",
          );
        const query = before
          ? "?beforeAt=" +
            encodeURIComponent(before.createdAt) +
            "&beforeId=" +
            encodeURIComponent(before.id)
          : "";
        const page = await mobileApi(
          "/v1/activity" + query,
          activityPageSchema,
        );
        if (seq !== sequence.current) return;
        setItems((current) =>
          before
            ? [
                ...new Map(
                  [...current, ...page.items].map((item) => [item.id, item]),
                ).values(),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
      } catch (error) {
        if (seq === sequence.current)
          setError(
            error instanceof Error ? error.message : "Activity could not load.",
          );
      } finally {
        if (seq === sequence.current) setBusy(false);
      }
    },
    [user?.id],
  );
  useFocusEffect(
    useCallback(() => {
      setItems([]);
      setCursor(null);
      void load();
      return () => {
        sequence.current++;
      };
    }, [load]),
  );
  return (
    <Page>
      <Heading>Good things{"\n"}are taking shape.</Heading>
      <Body muted>Processing and finished edits across all your projects.</Body>
      <Button
        title="Refresh activity"
        secondary
        disabled={busy}
        onPress={() => void load()}
      />
      {!!error && <Notice warning>{error}</Notice>}
      {items.map((job) => (
        <Pressable
          key={job.id}
          accessibilityRole="button"
          disabled={job.archived}
          onPress={() =>
            router.push({
              pathname: "/result/[jobId]",
              params: {
                jobId: job.id,
                ...(job.projectId ? { projectId: job.projectId } : {}),
              },
            })
          }
        >
          <Card>
            <View style={styles.row}>
              {job.status === "succeeded" ? (
                <Check color={colors.ink} />
              ) : (
                <Clock3 color={colors.accent} />
              )}
              <View style={{ flex: 1 }}>
                <Body style={{ fontFamily: "DMBold" }}>
                  {getService(job.featureSlug)?.name ?? "Photo edit"}
                </Body>
                <Body muted>
                  {job.projectName ?? "Your project"} ·{" "}
                  {job.archived ? "Archived" : job.status.replaceAll("_", " ")}
                </Body>
                <Body muted>{new Date(job.createdAt).toLocaleString()}</Body>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
      {cursor && (
        <Button
          title={busy ? "Loading…" : "Load older activity"}
          secondary
          disabled={busy}
          onPress={() => void load(cursor)}
        />
      )}
      {!items.length && !error && !busy && (
        <Notice>Your history will appear here after your first edit.</Notice>
      )}
      {busy && <Notice>Loading your activity…</Notice>}
    </Page>
  );
}
