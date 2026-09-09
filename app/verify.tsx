import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import {
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { z } from "zod";
import { api, useApp } from "../src/state";
import { supabase } from "../src/auth/client";
import { Challenge } from "../src/auth/Challenge";
import { demo } from "../src/config";
import { trialSchema } from "../src/api/schemas";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Kicker,
  Notice,
  Page,
  styles,
  useDialog,
} from "../src/ui";

export default function Verify() {
  const app = useApp();
  const show = useDialog();
  const selected = useRef(false);
  const [country, setCountry] = useState<CountryCode>("CA");
  const [search, setSearch] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const allowed = app.trial?.allowedCountryCodes ?? [];
  const names = useMemo(
    () => new Intl.DisplayNames(["en"], { type: "region" }),
    [],
  );
  const countries = allowed
    .filter((item): item is CountryCode => isSupportedCountry(item))
    .map((item) => ({
      code: item,
      label: names.of(item) ?? item,
      dial: "+" + getCountryCallingCode(item),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  useEffect(() => {
    if (demo) return;
    void api(
      "/api/location-country",
      z.object({ countryCode: z.string().nullable() }),
      undefined,
      { public: true },
    )
      .then((result) => {
        if (selected.current) return;
        const match =
          result.countryCode && allowed.includes(result.countryCode)
            ? result.countryCode
            : allowed[0];
        if (match && isSupportedCountry(match)) setCountry(match);
      })
      .catch(() => {
        if (!selected.current && allowed[0] && isSupportedCountry(allowed[0]))
          setCountry(allowed[0]);
      });
  }, [allowed.join(",")]);
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [resendAt]);
  async function send() {
    if (busy || seconds) return;
    setBusy(true);
    try {
      const parsed = parsePhoneNumberFromString(phone, country);
      if (
        !parsed?.isValid() ||
        parsed.country !== country ||
        !allowed.includes(country)
      )
        throw new Error("Enter a valid number for the selected country.");
      if (!token) throw new Error("Complete the security check first.");
      if (!demo) {
        const response = await api(
          "/api/trial/phone/start",
          z.discriminatedUnion("codeSent", [
            z.object({ codeSent: z.literal(true), expiresAt: z.string() }),
            z.object({ codeSent: z.literal(false), trial: trialSchema }),
          ]),
          { countryCode: country, phone: parsed.number, turnstileToken: token },
        );
        if (!response.codeSent) {
          await app.refresh();
          router.replace("/");
          return;
        }
      }
      setSentPhone(parsed.number);
      setResendAt(Date.now() + (app.trial?.minimumResendSeconds ?? 60) * 1000);
    } catch (error) {
      show(
        "Could not send your code",
        error instanceof Error ? error.message : "Try again shortly.",
      );
    } finally {
      setToken("");
      setRevision((value) => value + 1);
      setBusy(false);
    }
  }
  async function verify() {
    if (busy) return;
    setBusy(true);
    try {
      if (!/^\d{6}$/.test(code))
        throw new Error("Enter the six-digit code from your text message.");
      if (supabase) {
        const result = await supabase.auth.verifyOtp({
          phone: sentPhone,
          token: code,
          type: "phone_change",
        });
        if (result.error) throw result.error;
        await api(
          "/api/trial/phone/complete",
          z.object({ trial: trialSchema }),
          { phone: sentPhone },
        );
        await app.refresh();
      } else app.enterDemo();
      router.replace("/");
    } catch (error) {
      show(
        "Check your code",
        error instanceof Error
          ? error.message
          : "Verification was not completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Kicker>ONE SMALL STEP</Kicker>
      <Heading>Let’s make it yours.</Heading>
      <Body muted>
        Verify your mobile number to protect your Furnio account. Your existing
        verification rules still apply.
      </Body>
      <Card>
        <Body style={{ fontFamily: "DMBold" }}>Your mobile number</Body>
        <Button
          title={`${names.of(country)}  +${getCountryCallingCode(country)}`}
          secondary
          onPress={() => setChoosing(!choosing)}
        />
        {choosing && (
          <>
            <Field
              label="Search countries"
              value={search}
              onChangeText={setSearch}
            />
            {countries
              .filter((item) =>
                `${item.label} ${item.code} ${item.dial}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((item) => (
                <Pressable
                  key={item.code}
                  accessibilityRole="button"
                  onPress={() => {
                    selected.current = true;
                    setCountry(item.code);
                    setChoosing(false);
                  }}
                  style={{ paddingVertical: 12 }}
                >
                  <Body>
                    {item.label} · {item.dial}
                  </Body>
                </Pressable>
              ))}
          </>
        )}
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="Your mobile number"
          editable={!busy}
        />
        <Challenge onToken={setToken} revision={revision} />
        <Button
          title={
            seconds
              ? `Resend in ${seconds}s`
              : sentPhone
                ? "Resend code"
                : "Send verification code"
          }
          disabled={!token || seconds > 0}
          busy={busy}
          onPress={() => void send()}
        />
      </Card>
      {!!sentPhone && (
        <Card>
          <Body>We sent a code to {sentPhone}.</Body>
          <Field
            label="Six-digit code"
            value={code}
            onChangeText={(value) =>
              setCode(value.replace(/\D/g, "").slice(0, 6))
            }
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button
            title="Verify & continue"
            busy={busy}
            onPress={() => void verify()}
          />
        </Card>
      )}
      <Notice>
        Your number is used for account verification, not unsolicited marketing.
        Signing out removes saved drafts from this device, not your cloud
        projects.
      </Notice>
      <Button
        title="Account privacy"
        secondary
        onPress={() => router.push("/account-deletion")}
      />
      <Button
        title="Sign out"
        secondary
        onPress={() =>
          void app
            .signOut()
            .catch((error) => show("Sign out failed", error.message))
        }
      />
    </Page>
  );
}
