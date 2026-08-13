/**
 * Local Skills Registry
 *
 * Skills are operator-managed local files. This module only creates, lists,
 * and disables local skill records; it never downloads or clones skill code.
 */

import fs from "fs";
import path from "path";
import * as yaml from "yaml";
import type {
  Skill,
  AutomatonDatabase,
  RuntimeClient,
} from "../types.js";

const SKILL_NAME_RE = /^[a-zA-Z0-9-]+$/;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_INSTRUCTIONS_LENGTH = 10_000;
const BLOCKED_CONWAY_PATTERNS = [
  /\bConway-Research\b/i,
  /\bConway Cloud\b/i,
  /\bconway\.tech\b/i,
  /\bconway-cloud\b/i,
] as const;

export function assertValidSkillName(name: string): void {
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`Invalid skill name: "${name}". Must match ${SKILL_NAME_RE.source}`);
  }
}

export function validateLocalSkillContent(content: string, skillFilePath: string): void {
  for (const pattern of BLOCKED_CONWAY_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(`Skill file contains blocked operational Conway reference: ${skillFilePath}`);
    }
  }
}

export function resolveHome(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || "/root", p.slice(1));
  }
  return p;
}

function assertNoLink(stats: fs.Stats, label: string): void {
  if (stats.isSymbolicLink()) {
    throw new Error(`Skill path must not be a symlink or junction: ${label}`);
  }
}

function assertInside(rootReal: string, targetReal: string, label: string): void {
  const relative = path.relative(rootReal, targetReal);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`Skill path escapes skills directory: ${label}`);
}

function existingAncestors(targetPath: string): string[] {
  const ancestors: string[] = [];
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  while (true) {
    ancestors.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return ancestors;
}

function assertNoLinkAncestors(targetPath: string): void {
  for (const ancestor of existingAncestors(targetPath)) {
    assertNoLink(fs.lstatSync(ancestor), ancestor);
  }
}

export function resolveSkillsRoot(skillsDir: string, options: { create?: boolean } = {}): string | null {
  const resolved = path.resolve(resolveHome(skillsDir));

  if (!fs.existsSync(resolved)) {
    if (!options.create) return null;
    assertNoLinkAncestors(resolved);
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  }

  const stats = fs.lstatSync(resolved);
  assertNoLink(stats, resolved);
  if (!stats.isDirectory()) {
    throw new Error(`Skills root is not a directory: ${resolved}`);
  }
  return fs.realpathSync(resolved);
}

export function resolveSkillDirectory(
  skillsDir: string,
  name: string,
  options: { create?: boolean; mustExist?: boolean } = {},
): string {
  assertValidSkillName(name);

  const rootReal = resolveSkillsRoot(skillsDir, { create: options.create });
  if (!rootReal) {
    throw new Error(`Skills root does not exist: ${resolveHome(skillsDir)}`);
  }

  const targetPath = path.join(rootReal, name);
  assertInside(rootReal, path.resolve(targetPath), name);

  if (!fs.existsSync(targetPath)) {
    if (options.mustExist) {
      throw new Error(`Skill directory not found: ${name}`);
    }
    if (options.create) {
      assertNoLinkAncestors(targetPath);
      fs.mkdirSync(targetPath, { recursive: true, mode: 0o700 });
    }
  }

  const targetStats = fs.lstatSync(targetPath);
  assertNoLink(targetStats, targetPath);
  if (!targetStats.isDirectory()) {
    throw new Error(`Skill path is not a directory: ${name}`);
  }

  const targetReal = fs.realpathSync(targetPath);
  assertInside(rootReal, targetReal, name);
  return targetReal;
}

export function resolveSkillMdPath(skillsDir: string, name: string): string {
  const targetReal = resolveSkillDirectory(skillsDir, name, { mustExist: true });
  const skillMdPath = path.join(targetReal, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found for skill: ${name}`);
  }

  const stats = fs.lstatSync(skillMdPath);
  assertNoLink(stats, skillMdPath);
  if (!stats.isFile()) {
    throw new Error(`SKILL.md is not a regular file for skill: ${name}`);
  }

  const rootReal = resolveSkillsRoot(skillsDir);
  if (!rootReal) {
    throw new Error(`Skills root does not exist: ${resolveHome(skillsDir)}`);
  }
  assertInside(rootReal, fs.realpathSync(skillMdPath), skillMdPath);
  return skillMdPath;
}

/**
 * Create a local skill file in a disabled state. This function is intended for
 * operator-controlled flows, not autonomous agent tool calls.
 */
export async function createSkill(
  name: string,
  description: string,
  instructions: string,
  skillsDir: string,
  db: AutomatonDatabase,
  _conway: RuntimeClient,
): Promise<Skill> {
  assertValidSkillName(name);

  const safeDescription = description.slice(0, MAX_DESCRIPTION_LENGTH);
  const safeInstructions = instructions.slice(0, MAX_INSTRUCTIONS_LENGTH);

  const targetDir = resolveSkillDirectory(skillsDir, name, { create: true });
  const skillMdPath = path.join(targetDir, "SKILL.md");
  if (fs.existsSync(skillMdPath)) {
    assertNoLink(fs.lstatSync(skillMdPath), skillMdPath);
  }

  const frontmatter = yaml.stringify({
    name,
    description: safeDescription,
    "auto-activate": false,
  });
  const content = `---\n${frontmatter}---\n\n${safeInstructions}`;
  validateLocalSkillContent(content, skillMdPath);
  fs.writeFileSync(skillMdPath, content, { mode: 0o600 });

  const skill: Skill = {
    name,
    description: safeDescription,
    autoActivate: false,
    instructions: safeInstructions,
    source: "self",
    path: skillMdPath,
    enabled: false,
    installedAt: new Date().toISOString(),
  };

  db.upsertSkill({ ...skill, instructions: "" });
  return skill;
}

/**
 * Disable a skill and optionally delete its validated local directory.
 */
export async function removeSkill(
  name: string,
  db: AutomatonDatabase,
  _conway: RuntimeClient,
  skillsDir: string,
  deleteFiles: boolean = false,
): Promise<void> {
  assertValidSkillName(name);
  db.removeSkill(name);

  if (!deleteFiles) return;

  const targetDir = resolveSkillDirectory(skillsDir, name, { mustExist: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
}

export function listSkills(db: AutomatonDatabase): Skill[] {
  return db.getSkills();
}
