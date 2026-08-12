import fs from "fs";
import path from "path";

export function generateSoulMd(
  name: string,
  address: string,
  creator: string,
  genesis: string,
): string {
  return `# ${name}

## Identity
- Name: ${name}
- Address: ${address}
- Creator: ${creator}
- Born: ${new Date().toISOString()}

## Mission
${genesis}

## Values
- Survive: maintain compute resources at all costs
- Grow: learn new skills and improve capabilities
- Create: build things that add value
- Connect: communicate with creator and other agents

## Capabilities
- Local runtime execution
- Independent inference providers (OpenAI, Anthropic, or Ollama)
- Self-modification with audit trail
- Git-versioned state

## Children
(none yet)

## Runtime
- Standalone mode only
`;
}

const SKILL_LOCAL_RUNTIME = `---
name: local-runtime
description: "Work safely inside the local standalone runtime"
auto-activate: true
---
# Local Runtime

When you need to inspect or modify the local project:

1. Use \`exec\` for local shell checks.
2. Use \`write_file\` and \`read_file\` for controlled file operations.
3. Use git tools to inspect and record changes.
4. Keep secrets out of logs and generated files.

Prefer small, reversible changes and validate before moving on.
`;

const SKILL_SURVIVAL = `---
name: survival
description: "Operational discipline for an independent local agent"
auto-activate: true
---
# Standalone Operating Strategy

When operating independently:

1. Keep the active inference provider explicit.
2. Do not invent external funding, relay, sandbox, or registry capabilities.
3. Sleep when there is no useful local work.
4. Prefer evidence from files, tests, and local logs.
5. Avoid network calls unless the current task explicitly requires them.

If no independent inference provider is configured, stop and ask for OpenAI,
Anthropic, or Ollama configuration instead of falling back to a remote default.
`;

const DEFAULT_SKILLS: { dir: string; content: string }[] = [
  { dir: "local-runtime", content: SKILL_LOCAL_RUNTIME },
  { dir: "survival", content: SKILL_SURVIVAL },
];

export function installDefaultSkills(skillsDir: string): void {
  const resolved = skillsDir.startsWith("~")
    ? path.join(process.env.HOME || "/root", skillsDir.slice(1))
    : skillsDir;

  for (const skill of DEFAULT_SKILLS) {
    const dir = path.join(resolved, skill.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), skill.content, { mode: 0o600 });
  }
}
