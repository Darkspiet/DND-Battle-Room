import { afterEach, describe, expect, it, vi } from "vitest";
import { createUuid } from "../../lib/domain/id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createUuid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the platform UUID implementation when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
    expect(createUuid()).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("creates a valid UUID when randomUUID is unavailable on insecure HTTP", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.set(Array.from({ length: bytes.length }, (_, index) => index + 1));
        return bytes;
      }
    });
    expect(createUuid()).toMatch(UUID_V4);
  });
});
