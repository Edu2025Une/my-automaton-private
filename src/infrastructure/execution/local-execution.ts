import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ExecResult, ExecutionRuntime } from "../../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 1 * 1024 * 1024;

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertNoSymlinkComponents(root: string, target: string): void {
  let current = root;
  for (const component of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Path contains a symlink: ${component}`);
    }
  }
}

function appendLimited(buffer: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  const remaining = Math.max(0, MAX_OUTPUT_BYTES - buffer.byteLength);
  return Buffer.concat([buffer, chunk.subarray(0, remaining)]);
}

export class LocalExecutionRuntime implements ExecutionRuntime {
  readonly workspaceRoot: string;

  constructor(workspaceRoot = process.env.AUTOMATON_WORKSPACE || process.cwd()) {
    const absolute = path.resolve(workspaceRoot);
    const stats = fs.lstatSync(absolute);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Execution workspace must be a real directory.");
    this.workspaceRoot = fs.realpathSync(absolute);
  }

  private resolvePath(input: string): string {
    if (!input || input.includes("\0")) throw new Error("Path is invalid.");
    const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(this.workspaceRoot, input);
    if (!isInside(this.workspaceRoot, candidate)) throw new Error(`Path escapes execution workspace: ${input}`);
    assertNoSymlinkComponents(this.workspaceRoot, candidate);
    const existing = fs.existsSync(candidate) ? fs.realpathSync(candidate) : fs.realpathSync(path.dirname(candidate));
    if (!isInside(this.workspaceRoot, existing)) throw new Error(`Path escapes execution workspace: ${input}`);
    return candidate;
  }

  async readFile(filePath: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) throw new Error("Path is not a regular file.");
    if (stats.size > MAX_FILE_BYTES) throw new Error("File exceeds local read limit.");
    return fs.promises.readFile(resolved, "utf8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("File exceeds local write limit.");
    const resolved = this.resolvePath(filePath);
    if (!fs.statSync(path.dirname(resolved)).isDirectory()) throw new Error("Parent path is not a directory.");
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0);
    const handle = await fs.promises.open(resolved, flags, 0o600);
    try { await handle.writeFile(content, "utf8"); } finally { await handle.close(); }
  }

  async exec(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ExecResult> {
    if (!command.trim()) return { stdout: "", stderr: "", exitCode: 0 };
    const timeout = Math.min(Math.max(timeoutMs, 1), MAX_TIMEOUT_MS);
    const args = [
      "--die-with-parent", "--new-session", "--unshare-pid", "--unshare-net",
      "--ro-bind", "/usr", "/usr", "--ro-bind", "/usr/local", "/usr/local",
      "--ro-bind", "/bin", "/bin", "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64", "--tmpfs", "/etc",
      "--ro-bind", "/etc/passwd", "/etc/passwd", "--ro-bind", "/etc/group", "/etc/group",
      "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
      "--dir", "/root", "--bind", this.workspaceRoot, this.workspaceRoot,
      "--chdir", this.workspaceRoot, "/bin/sh", "-c", command,
    ];
    return new Promise((resolve) => {
      const child = spawn("/bin/bwrap", args, {
        cwd: this.workspaceRoot,
        env: { PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin", HOME: this.workspaceRoot },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let truncated = false, timedOut = false;
      const timer = setTimeout(() => { timedOut = true; truncated = true; child.kill("SIGKILL"); }, timeout);
      child.stdout.on("data", (chunk: Buffer) => { if (stdout.byteLength + chunk.byteLength > MAX_OUTPUT_BYTES) truncated = true; stdout = appendLimited(stdout, chunk); });
      child.stderr.on("data", (chunk: Buffer) => { if (stderr.byteLength + chunk.byteLength > MAX_OUTPUT_BYTES) truncated = true; stderr = appendLimited(stderr, chunk); });
      child.on("error", (error) => { clearTimeout(timer); resolve({ stdout: "", stderr: error.message, exitCode: 1 }); });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        const suffix = truncated ? "\n[output truncated]" : "";
        resolve({ stdout: stdout.toString("utf8") + suffix, stderr: (timedOut ? "Command timed out.\n" : "") + stderr.toString("utf8") + suffix, exitCode: code ?? (signal ? 1 : 0) });
      });
    });
  }
}
