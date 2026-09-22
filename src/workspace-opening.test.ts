import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  ActivityIndicator: () => React.createElement("span", null, "Loading"),
}));
vi.mock("./ui", () => {
  const text = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  return { Body: text, Heading: text, Page: text, colors: {},
    Logo: () => React.createElement("span", null, "Furnio"),
    Button: ({ title }: { title: string }) => React.createElement("button", null, title),
  };
});
import { WorkspaceOpening } from "./WorkspaceOpening";

describe("account-opening UI", () => {
  const render = (error: string | null) => renderToStaticMarkup(React.createElement(WorkspaceOpening, {
    error, retry: vi.fn(), signOut: vi.fn(), privacy: vi.fn(),
  }));
  it("shows no sign-out/privacy/retry buttons during successful auth and verification checks", () => {
    const html = render(null);
    expect(html).toContain("Opening your workspace");
    expect(html).toContain("Loading");
    expect(html).not.toContain("<button");
  });
  it("keeps recovery and account privacy accessible on an actual error", () => {
    const html = render("Unable to connect");
    for (const text of ["Unable to connect", "Try again", "Sign out", "Account privacy"]) expect(html).toContain(text);
  });
});
