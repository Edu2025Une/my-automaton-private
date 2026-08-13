import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalExecutionRuntime } from "../infrastructure/execution/local-execution.js";

const roots: string[] = [];
function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-exec-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("LocalExecutionRuntime", () => {
  it("executes inside the workspace without network access", async () => {
    const root = makeRoot();
    const runtime = new LocalExecutionRuntime(root);
    const result = await runtime.exec("printf local; test \"$PWD\" = \"" + root + "\"");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("local");
    expect((await runtime.exec("curl -m 1 https://example.com")).exitCode).not.toBe(0);
  });

  it("reads and writes local files", async () => {
    const root = makeRoot();
    const runtime = new LocalExecutionRuntime(root);
    fs.mkdirSync(path.join(root, "nested"));
    await runtime.writeFile("nested/file.txt", "hello local");
    expect(await runtime.readFile("nested/file.txt")).toBe("hello local");
  });

  it("rejects traversal and paths outside the workspace", async () => {
    const root = makeRoot();
    const runtime = new LocalExecutionRuntime(root);
    await expect(runtime.readFile("../outside.txt")).rejects.toThrow(/escapes/);
    await expect(runtime.writeFile("/tmp/outside.txt", "blocked")).rejects.toThrow(/escapes/);
    const result = await runtime.exec("cat /root/.ssh/id_ed25519");
    expect(result.exitCode).not.toBe(0);
    const hostSecret = await runtime.exec("cat /etc/shadow");
    expect(hostSecret.exitCode).not.toBe(0);
  });

  it("rejects symlink escapes", async () => {
    const root = makeRoot();
    const outside = makeRoot();
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    fs.symlinkSync(outside, path.join(root, "linked"));
    const runtime = new LocalExecutionRuntime(root);
    await expect(runtime.readFile("linked/secret.txt")).rejects.toThrow(/symlink/);
    await expect(runtime.writeFile("linked/new.txt", "blocked")).rejects.toThrow(/symlink/);
  });

  it("enforces timeout and output limits", async () => {
    const root = makeRoot();
    const runtime = new LocalExecutionRuntime(root);
    const timedOut = await runtime.exec("sleep 2", 25);
    expect(timedOut.stderr).toContain("timed out");
    const noisy = await runtime.exec("printf '%100000s' x");
    expect(noisy.stdout).toContain("output truncated");
    expect(noisy.stdout.length).toBeLessThan(70_000);
  });
});
