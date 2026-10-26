// Only an explicit operator opt-out enables public registration; typos fail closed.
export function dmInviteRequired(mode = process.env.DM_SIGNUP_MODE) {
  return mode !== "open";
}
