import { afterEach, describe, expect, it } from "vitest";
import { isVercelBlobConfigured } from "./config";

const original = process.env.BLOB_READ_WRITE_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = original;
});

describe("isVercelBlobConfigured", () => {
  it("is false with no token set", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(isVercelBlobConfigured()).toBe(false);
  });

  it("is true once a token is set", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    expect(isVercelBlobConfigured()).toBe(true);
  });
});
