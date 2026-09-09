import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, FolderOpen } from "lucide-react-native";
import { useApp } from "../../src/state";
import {
  Body,
  Button,
  Card,
  colors,
  Field,
  Heading,
  Notice,
  Page,
  styles,
} from "../../src/ui";
export default function Projects() {
  const { projects, error, refresh } = useApp();
  const [query, setQuery] = useState("");
  const shown = projects.filter(
    (project) =>
      !project.archived_at &&
      `${project.name} ${project.address}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <Page>
      <Heading>Your properties.{"\n"}Beautifully organised.</Heading>
      <Button
        title="New project"
        onPress={() => router.push("/new-project")}
        icon
      />
      <Field
        label="Search projects"
        placeholder="Name or address"
        value={query}
        onChangeText={setQuery}
      />
      {!!error && <Notice warning>{error}</Notice>}
      {shown.map((project) => (
        <Pressable
          accessibilityRole="button"
          key={project.id}
          onPress={() => router.push(`/project/${project.id}`)}
        >
          <Card>
            <View style={styles.row}>
              <FolderOpen color={colors.accent} size={30} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontFamily: "DMBold" }}>{project.name}</Body>
                <Body muted style={{ fontSize: 13 }}>
                  {project.address}
                </Body>
              </View>
              <ChevronRight color={colors.ink} />
            </View>
          </Card>
        </Pressable>
      ))}
      {!shown.length && <Notice>No matching projects yet.</Notice>}
      <Button
        title="Refresh projects"
        secondary
        onPress={() => void refresh()}
      />
    </Page>
  );
}
