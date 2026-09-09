import React, { createContext, useContext, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { ArrowLeft, ArrowRight, X } from "lucide-react-native";
import { router } from "expo-router";
import { wordmark } from "./brand";
import { demo } from "./config";
export const colors = {
  bg: "#f7f5ef",
  paper: "#fffefa",
  ink: "#173c30",
  muted: "#63756b",
  line: "#e2e5dc",
  accent: "#ad5037",
  soft: "#e9eee5",
};
export const styles = StyleSheet.create({
  text: { fontFamily: "DM", fontSize: 16, lineHeight: 24, color: colors.ink },
  muted: { color: colors.muted },
  heading: {
    fontFamily: "Serif",
    fontSize: 42,
    lineHeight: 45,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stack: { gap: 18 },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    padding: 20,
    gap: 14,
  },
  label: {
    fontFamily: "DMBold",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  field: {
    fontFamily: "DM",
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    minHeight: 52,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: 15,
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondary: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: {
    fontFamily: "DMBold",
    fontSize: 15,
    color: colors.paper,
    textAlign: "center",
  },
  pill: {
    backgroundColor: colors.soft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 24,
    alignSelf: "flex-start",
  },
  line: { height: 1, backgroundColor: colors.line },
});
export function Body({
  children,
  muted,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<import("react-native").TextStyle>;
}) {
  return (
    <Text style={[styles.text, muted && styles.muted, style]}>{children}</Text>
  );
}
export function Heading({
  children,
  small,
  style,
}: {
  children: React.ReactNode;
  small?: boolean;
  style?: StyleProp<import("react-native").TextStyle>;
}) {
  return (
    <Text
      accessibilityRole="header"
      style={[styles.heading, small && { fontSize: 30, lineHeight: 34 }, style]}
    >
      {children}
    </Text>
  );
}
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: "DMBold",
        fontSize: 11,
        letterSpacing: 2,
        color: colors.accent,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}
export function Logo({
  white = false,
  width = 110,
}: {
  white?: boolean;
  width?: number;
}) {
  const artwork = wordmark.replace(/\s(?:aria-[\w-]+|role)="[^"]*"/g, "");
  return (
    <View accessibilityRole="image" accessibilityLabel="Furnio">
      <SvgXml
        xml={white ? artwork.replace(/#[0-9a-f]{6}/gi, colors.paper) : artwork}
        width={width}
        height={(width * 70.1) / 237.6}
      />
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.label, { color: colors.ink }]}>{children}</Text>
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  busy,
  icon = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.ink : colors.paper} />
      ) : (
        <>
          <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>
            {title}
          </Text>
          {icon && (
            <ArrowRight
              size={19}
              color={secondary ? colors.ink : colors.paper}
            />
          )}
        </>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.field,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({
  children,
  warning,
}: {
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <View
      accessibilityRole="text"
      style={{
        padding: 14,
        borderRadius: 14,
        backgroundColor: warning ? "#f3e5de" : colors.soft,
      }}
    >
      <Body style={{ fontSize: 14, lineHeight: 21 }}>{children}</Body>
    </View>
  );
}
export function Page({
  children,
  title,
  back,
  right,
}: {
  children: React.ReactNode;
  title?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {demo && (
          <View
            style={{
              backgroundColor: colors.soft,
              padding: 5,
              alignItems: "center",
            }}
          >
            <Text style={[styles.label, { fontSize: 10 }]}>
              DEVELOPMENT DEMO · SAMPLE DATA · NO LIVE CALLS
            </Text>
          </View>
        )}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            padding: 23,
            paddingBottom: 36,
            width: "100%",
            maxWidth: 760,
            alignSelf: "center",
            gap: 22,
          }}
        >
          <View style={styles.between}>
            {back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace("/")
                }
                style={{
                  padding: 12,
                  backgroundColor: colors.paper,
                  borderRadius: 30,
                }}
              >
                <ArrowLeft color={colors.ink} size={22} />
              </Pressable>
            ) : (
              <Logo />
            )}
            {!!title && (
              <Body
                style={{ fontFamily: "DMBold", flex: 1, textAlign: "center" }}
              >
                {title}
              </Body>
            )}
            {right}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
type DialogAction = { title: string; action?: () => void; secondary?: boolean };
type Show = (title: string, message: string, actions?: DialogAction[]) => void;
const DialogContext = createContext<Show>(() => undefined);
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    actions: DialogAction[];
  } | null>(null);
  return (
    <DialogContext.Provider
      value={(title, message, actions = [{ title: "Got it" }]) =>
        setDialog({ title, message, actions })
      }
    >
      {children}
      <Modal
        visible={!!dialog}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#102a24aa",
            padding: 24,
          }}
        >
          <View
            accessibilityViewIsModal
            style={[
              styles.card,
              { width: "100%", maxWidth: 460, padding: 26, gap: 20 },
            ]}
          >
            <View style={styles.between}>
              <Logo width={88} />
              <Pressable
                accessibilityLabel="Close dialog"
                accessibilityRole="button"
                style={{ padding: 8 }}
                onPress={() => setDialog(null)}
              >
                <X color={colors.ink} size={22} />
              </Pressable>
            </View>
            <Heading small>{dialog?.title}</Heading>
            <Body muted>{dialog?.message}</Body>
            {dialog?.actions.map((action, index) => (
              <Button
                key={index}
                title={action.title}
                secondary={action.secondary}
                onPress={() => {
                  setDialog(null);
                  action.action?.();
                }}
              />
            ))}
          </View>
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}
export function useDialog() {
  return useContext(DialogContext);
}
