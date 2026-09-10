import { expect, it } from "vitest";
import { pendingPhone } from "./pending-phone";

it("restores a permitted pending phone change with or without its plus", () => {
  for (const input of ["+14165550123", "14165550123"])
    expect(pendingPhone(input, ["CA"])).toEqual({ number: "+14165550123", country: "CA" });
});
it("does not invent pending verification or restore a forbidden country", () => {
  for (const input of [undefined, "", "invalid", "1234", "+14165550123<script>"])
    expect(pendingPhone(input, ["CA"])).toBeNull();
  expect(pendingPhone("+14165550123", ["US"])).toBeNull();
});
