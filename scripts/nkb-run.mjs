#!/usr/bin/env node
// nkb run — pattern sandbox runner.
// Locates a pattern under workflow-patterns/, extracts its embedded workflow
// JSON, and (in --sandbox mode) drives a docker-based n8n instance through
// import → start → POST sample payload → capture result → tear down.
//
// `--dry-run` is the default safety surface: prints the exact docker commands
// the runner WOULD execute and exits 0 without touching docker. The full e2e
// path is gated behind RUN_DOCKER=1 so CI and contributor laptops without
// docker stay green.
//
// Designed to be wired into the unified `scripts/nkb.mjs` dispatcher
// (round-1 PR #3) once that merges; until then, invokable directly via
// `node scripts/nkb-run.mjs <slug> --sandbox [--dry-run]`.

process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const PATTERN_ROOTS = ["workflow-patterns/_examples", "workflow-patterns/_inbox", "workflow-patterns"];

const DEFAULT_IMAGE = "n8nio/n8n:latest";
const DEFAULT_PORT = 5678;
const DEFAULT_CONTAINER = "nkb-sandbox";
const STARTUP_WAIT_SECONDS = 20;

function parseFlags(argv) {
  const flags = {
    sandbox: false,
    dryRun: false,
    help: false,
    slug: null,
    image: DEFAULT_IMAGE,
    port: DEFAULT_PORT,
    container: DEFAULT_CONTAINER,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sandbox") flags.sandbox = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--image") flags.image = argv[++i];
    else if (a.startsWith("--image=")) flags.image = a.slice(8);
    else if (a === "--port") flags.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) flags.port = Number(a.slice(7));
    else if (a === "--container") flags.container = argv[++i];
    else if (a.startsWith("--container=")) flags.container = a.slice(12);
    else if (!a.startsWith("-") && !flags.slug) flags.slug = a;
  }
  return flags;
}

function usage() {
  return [
    "usage: nkb run <slug> --sandbox [--dry-run] [--image n8nio/n8n:latest]",
    "                              [--port 5678] [--container nkb-sandbox]",
    "",
    "Drives an ephemeral n8n docker container against the pattern's embedded",
    "workflow JSON. `--dry-run` prints the docker plan and exits 0 without",
    "touching docker; full e2e is gated by RUN_DOCKER=1.",
  ].join("\n");
}

async function findPatternFile(slug) {
  for (const root of PATTERN_ROOTS) {
    const direct = join(REPO_ROOT, root, `${slug}.md`);
    try {
      await stat(direct);
      return direct;
    } catch {
      // continue
    }
  }
  // Fallback: walk PATTERN_ROOTS and match by frontmatter slug or filename.
  for (const root of PATTERN_ROOTS) {
    const abs = join(REPO_ROOT, root);
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const full = join(abs, entry.name);
      const text = await readFile(full, "utf8");
      const m = text.match(/^slug:\s*([^\s]+)/m);
      if (m && m[1] === slug) return full;
    }
  }
  return null;
}

function extractFenced(body, lang) {
  const fence = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)\\n```", "m");
  const m = body.match(fence);
  return m ? m[1] : null;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return {};
  const block = text.slice(4, end);
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

function shellQuote(s) {
  if (s === "" || /[^A-Za-z0-9_\-./:=,@%+]/.test(s)) {
    return `'${String(s).replace(/'/g, `'"'"'`)}'`;
  }
  return String(s);
}

function buildDockerPlan({ slug, patternPath, image, port, container, workflowJson }) {
  const workflowFile = `/tmp/${container}-${slug}.json`;
  const importCmd = `cat <<'NKB_EOF' > ${workflowFile}\n${workflowJson}\nNKB_EOF`;
  return [
    { step: "remove-stale-container", cmd: ["docker", "rm", "-f", container] },
    { step: "write-workflow-json", cmd: ["bash", "-c", importCmd] },
    {
      step: "run-n8n",
      cmd: [
        "docker", "run", "-d",
        "--name", container,
        "-p", `${port}:5678`,
        "-e", "N8N_BASIC_AUTH_ACTIVE=false",
        "-e", "N8N_DIAGNOSTICS_ENABLED=false",
        "-v", `${workflowFile}:/workflow.json:ro`,
        image,
      ],
    },
    {
      step: "wait-for-ready",
      cmd: [
        "bash", "-c",
        `for i in $(seq 1 ${STARTUP_WAIT_SECONDS}); do curl -fsS http://localhost:${port}/healthz >/dev/null 2>&1 && exit 0 || sleep 1; done; echo "n8n did not become ready" >&2; exit 1`,
      ],
    },
    {
      step: "import-workflow",
      cmd: ["docker", "exec", container, "n8n", "import:workflow", "--input=/workflow.json"],
    },
    {
      step: "post-sample-payload",
      cmd: [
        "curl", "-fsS", "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", `@${workflowFile}.payload.json`,
        `http://localhost:${port}/webhook/echo`,
      ],
    },
    { step: "teardown", cmd: ["docker", "rm", "-f", container] },
  ];
}

function printDryRun(plan, { slug, patternPath, port }) {
  console.log(`# nkb sandbox plan for slug='${slug}'`);
  console.log(`# pattern: ${patternPath}`);
  console.log(`# expected webhook: http://localhost:${port}/webhook/echo`);
  console.log("# This is a dry run — no docker commands will be executed.");
  console.log("");
  for (const { step, cmd } of plan) {
    console.log(`## ${step}`);
    console.log(cmd.map(shellQuote).join(" "));
    console.log("");
  }
  console.log(`# To execute for real, re-run with RUN_DOCKER=1 (and docker installed).`);
}

function runStep(cmd) {
  return new Promise((resolveStep, rejectStep) => {
    const proc = spawn(cmd[0], cmd.slice(1), { stdio: "inherit" });
    proc.on("error", rejectStep);
    proc.on("exit", (code) => {
      if (code === 0) resolveStep();
      else rejectStep(new Error(`${cmd[0]} exited ${code}`));
    });
  });
}

async function executePlan(plan) {
  for (const { step, cmd } of plan) {
    console.error(`==> ${step}`);
    try {
      await runStep(cmd);
    } catch (err) {
      // teardown is best-effort: never fail the run because cleanup failed.
      if (step === "teardown" || step === "remove-stale-container") {
        console.error(`(non-fatal) ${step}: ${err.message}`);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(usage());
    return 0;
  }
  if (!flags.slug) {
    console.error("error: missing <slug>\n");
    console.error(usage());
    return 2;
  }
  if (!flags.sandbox) {
    console.error("error: --sandbox is required (only mode currently supported)\n");
    console.error(usage());
    return 2;
  }
  const patternPath = await findPatternFile(flags.slug);
  if (!patternPath) {
    console.error(`error: no pattern found for slug '${flags.slug}' under workflow-patterns/`);
    return 3;
  }
  const body = await readFile(patternPath, "utf8");
  const frontmatter = parseFrontmatter(body);
  const workflowJson = extractFenced(body, "json");
  if (!workflowJson) {
    console.error(`error: pattern ${patternPath} has no fenced \`\`\`json workflow block`);
    return 4;
  }
  try {
    JSON.parse(workflowJson);
  } catch (e) {
    console.error(`error: embedded workflow JSON in ${patternPath} is invalid: ${e.message}`);
    return 4;
  }
  const plan = buildDockerPlan({
    slug: flags.slug,
    patternPath,
    image: flags.image,
    port: flags.port,
    container: flags.container,
    workflowJson,
  });

  if (flags.dryRun || process.env.RUN_DOCKER !== "1") {
    if (!flags.dryRun && process.env.RUN_DOCKER !== "1") {
      console.error("note: RUN_DOCKER!=1, falling back to dry-run preview");
    }
    printDryRun(plan, { slug: flags.slug, patternPath, port: flags.port });
    return 0;
  }
  await executePlan(plan);
  console.error(`==> done (sandbox slug=${flags.slug})`);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
