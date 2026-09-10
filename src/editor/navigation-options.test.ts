import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import { editorNavigationOptions } from "./navigation-options";

it("disables swipe dismissal only on the two editor routes", () => {
  expect(editorNavigationOptions).toEqual({
    gestureEnabled: false,
    fullScreenGestureEnabled: false,
  });
  const tree = ts.createSourceFile(
    "layout.tsx",
    readFileSync(new URL("../../app/_layout.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const bound: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(tree) === "Stack.Screen"
    ) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const options = attributes.find(
        (attribute) => attribute.name.getText(tree) === "options",
      );
      if (options?.initializer?.getText(tree) === "{editorNavigationOptions}") {
        const name = attributes.find(
          (attribute) => attribute.name.getText(tree) === "name",
        )?.initializer;
        if (name && ts.isStringLiteral(name)) bound.push(name.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  expect(bound.sort()).toEqual(["batch", "studio/[service]"]);
});
