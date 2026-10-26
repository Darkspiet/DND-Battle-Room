import { expect, it } from "vitest";
import { dmInviteRequired } from "../../lib/server/signupPolicy";
it("requires invitations unless the operator explicitly opts into open registration", () => {
  for (const value of ["invite", "", "OPEN", "false", "typo"]) expect(dmInviteRequired(value)).toBe(true);
  expect(dmInviteRequired("open")).toBe(false);
});
