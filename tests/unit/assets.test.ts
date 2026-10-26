import { describe, expect, it } from "vitest";
import { isPrivateNetworkAddress } from "../../lib/domain/network";

describe("remote asset URL address safety", () => {
  it("rejects loopback, private, link-local, and multicast addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.3", "172.16.2.4", "192.168.178.1", "169.254.1.2", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateNetworkAddress(address), address).toBe(true);
    }
  });

  it("allows representative public addresses", () => {
    expect(isPrivateNetworkAddress("1.1.1.1")).toBe(false);
    expect(isPrivateNetworkAddress("2606:4700:4700::1111")).toBe(false);
  });
});
