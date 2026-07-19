import { describe, it, expect, vi, afterEach } from "vitest";
import { isBlobConfigured } from "@/lib/blob";

afterEach(() => vi.unstubAllEnvs());

describe("isBlobConfigured", () => {
  it("false כשאין token ואין store-id", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    expect(isBlobConfigured()).toBe(false);
  });
  it("true עם RW token הישן", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_xxx");
    vi.stubEnv("BLOB_STORE_ID", "");
    expect(isBlobConfigured()).toBe(true);
  });
  it("true עם BLOB_STORE_ID (מודל OIDC החדש)", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_abc");
    expect(isBlobConfigured()).toBe(true);
  });
});
