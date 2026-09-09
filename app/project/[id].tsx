import { useCallback, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { z } from "zod";
import { api, useApp } from "../../src/state";
import { demo } from "../../src/config";
import { sampleHistory } from "../../src/data/demo";
import { photos, getService } from "../../src/services";
import { workspaceSchema, type Workspace } from "../../src/api/schemas";
import {
  Body,
  Button,
  Card,
  Heading,
  Notice,
  Page,
  Pill,
  styles,
  useDialog,
} from "../../src/ui";
export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { projects, refresh } = useApp();
  const show = useDialog();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (demo) {
        const project = projects.find((item) => item.id === id);
        if (project)
          setData({
            project,
            history: sampleHistory,
            photoUsage: { count: 2, limit: 50 },
          });
      } else
        void api(`/api/projects/${id}`, workspaceSchema)
          .then((value) => {
            if (active) setData(value);
          })
          .catch((error) => {
            if (active) setError(error.message);
          });
      return () => {
        active = false;
      };
    }, [id, projects]),
  );
  return (
    <Page back title="Project">
      <Heading>{data?.project.name ?? "Your project"}</Heading>
      <Body muted>{data?.project.address}</Body>
      {!!error && <Notice warning>{error}</Notice>}
      <Pill>
        {data?.photoUsage.count ?? "—"} / {data?.photoUsage.limit ?? "—"} source
        photos
      </Pill>
      <Button
        title="Create a new edit"
        onPress={() =>
          router.push({
            pathname: "/studio/virtual_staging",
            params: { projectId: id },
          })
        }
        icon
      />
      <Button
        title="Create a batch of edits"
        secondary
        onPress={() =>
          router.push({ pathname: "/batch", params: { projectId: id } })
        }
      />
      {data?.history.map((job) => (
        <Pressable
          key={job.id}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/result/[jobId]",
              params: { jobId: job.id, projectId: id },
            })
          }
        >
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {(job.resultUrl || demo) && (
              <Image
                source={job.resultUrl ? { uri: job.resultUrl } : photos.after}
                style={{ width: "100%", height: 215 }}
              />
            )}
            <View style={{ padding: 18, gap: 10 }}>
              <View style={styles.between}>
                <Body style={{ fontFamily: "DMBold" }}>
                  {getService(job.featureSlug)?.name ?? job.featureSlug}
                </Body>
                <Pill>{job.status}</Pill>
              </View>
              <Body muted style={{ fontSize: 13 }}>
                {job.resultAccessLevel === "trial_locked"
                  ? "Watermarked trial preview"
                  : "Open result and comparison"}
              </Body>
            </View>
          </Card>
        </Pressable>
      ))}
      <Button
        secondary
        title="Archive project"
        onPress={() =>
          show(
            "Archive this project?",
            "This uses Furnio’s existing archive operation and removes the project’s stored media. This is not an undoable hide action.",
            [
              { title: "Keep project", secondary: true },
              {
                title: "Archive project",
                action: () => {
                  if (demo) {
                    show("Demo only", "No real project or image was archived.");
                    return;
                  }
                  void api(
                    `/api/projects/${id}/archive`,
                    z.object({ archived: z.boolean() }),
                    {},
                  )
                    .then(async () => {
                      await refresh();
                      router.replace("/projects");
                    })
                    .catch((error) => show("Archive failed", error.message));
                },
              },
            ],
          )
        }
      />
    </Page>
  );
}
