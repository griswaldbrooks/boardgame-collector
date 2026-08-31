// Exercises the release workflow's "Decide release tag" step (the guard that
// decides whether a push to main cuts a release) by running its shell script
// against stubbed `gh` / `git`, in a scratch dir with a fabricated
// tauri.conf.json. Fake repo, fake versions — nothing here touches GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKFLOW = new URL("../.github/workflows/release.yml", import.meta.url);

/** Pull the `run:` block scalar of the step whose id is `decide`. */
function decideScript() {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const start = lines.findIndex((l) => l.trim() === "id: decide");
  assert.notEqual(start, -1, "release.yml has no step with id: decide");
  const runAt = lines.findIndex((l, i) => i > start && l.trim() === "run: |");
  assert.notEqual(runAt, -1, "the decide step has no `run: |` block");
  const indent = lines[runAt + 1].match(/^ */)[0];
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== "" && !line.startsWith(indent)) break;
    body.push(line.slice(indent.length));
  }
  return body.join("\n");
}

/**
 * Run the decide step the way Actions would: expressions rendered, stub `gh`
 * and `git` on PATH, GITHUB_OUTPUT collected.
 */
function runDecide({
  version,
  latestRelease,
  latestStatus = 0,
  tagExists,
  lsRemoteStatus,
  force = false,
}) {
  const dir = mkdtempSync(join(tmpdir(), "release-gate-"));
  mkdirSync(join(dir, "src-tauri"));
  writeFileSync(
    join(dir, "src-tauri/tauri.conf.json"),
    JSON.stringify({
      productName: "fake-app",
      version,
      identifier: "fake.example.app",
    }),
  );

  const bin = join(dir, "bin");
  mkdirSync(bin);
  const stub = (name, script) => {
    const p = join(bin, name);
    writeFileSync(p, `#!/usr/bin/env bash\n${script}\n`);
    chmodSync(p, 0o755);
  };
  // `gh api .../releases/latest --jq .tag_name`
  stub(
    "gh",
    latestStatus === 0
      ? `echo "${latestRelease ?? ""}"`
      : latestStatus === 404
        ? 'echo "gh: Not Found (HTTP 404)" >&2; exit 1'
        : 'echo "gh: Bad gateway (HTTP 502)" >&2; exit 1',
  );
  // `git ls-remote --exit-code --tags origin refs/tags/vX.Y.Z`: 0 found, 2 absent.
  stub("git", `exit ${lsRemoteStatus ?? (tagExists ? 0 : 2)}`);
  stub("sleep", "exit 0"); // don't actually wait out the ls-remote backoff

  const outputs = join(dir, "outputs.txt");
  writeFileSync(outputs, "");
  const script = decideScript().replaceAll(
    "${{ inputs.force }}",
    String(force),
  );

  let status = 0;
  let stdout;
  try {
    stdout = execFileSync("bash", ["-c", script], {
      cwd: dir,
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputs,
        GITHUB_REPOSITORY: "fake-owner/fake-repo",
        RUNNER_TEMP: dir,
        GH_TOKEN: "fake-token",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    status = err.status;
    stdout = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }

  const out = Object.fromEntries(
    readFileSync(outputs, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("=")),
  );
  return { status, stdout, out };
}

test("a version bump past the latest release cuts a new tag", () => {
  const { status, out } = runDecide({
    version: "0.9.0",
    latestRelease: "v0.4.2",
    tagExists: false,
  });
  assert.equal(status, 0);
  assert.deepEqual(out, { version: "0.9.0", tag: "v0.9.0", needed: "true" });
});

test("first release (no releases yet) still builds", () => {
  const { status, out } = runDecide({
    version: "0.1.0",
    latestStatus: 404,
    tagExists: false,
  });
  assert.equal(status, 0);
  assert.equal(out.needed, "true");
  assert.equal(out.tag, "v0.1.0");
});

test("a merge without a version bump skips the release, green", () => {
  const { status, out, stdout } = runDecide({
    version: "0.4.2",
    latestRelease: "v0.4.2",
    tagExists: true,
  });
  assert.equal(status, 0);
  assert.equal(out.needed, "false");
  assert.match(stdout, /^::notice::/m);
});

test("workflow_dispatch force re-releases onto an existing tag", () => {
  const { status, out } = runDecide({
    version: "0.4.2",
    latestRelease: "v0.4.2",
    tagExists: true,
    force: true,
  });
  assert.equal(status, 0);
  assert.equal(out.needed, "true");
});

test("a version below the latest release fails instead of downgrading", () => {
  const { status, stdout } = runDecide({
    version: "0.4.1",
    latestRelease: "v0.4.2",
    tagExists: false,
  });
  assert.equal(status, 1);
  assert.match(stdout, /^::error::/m);
});

test("a non-semver version fails before anything is tagged", () => {
  const { status, stdout, out } = runDecide({
    version: "0.4.2-beta.1",
    latestRelease: "v0.4.1",
    tagExists: false,
  });
  assert.equal(status, 1);
  assert.match(stdout, /^::error::/m);
  assert.deepEqual(out, {});
});

test("an unreadable latest release fails closed rather than guessing", () => {
  const { status, stdout } = runDecide({
    version: "0.4.2",
    latestStatus: 502,
    tagExists: false,
  });
  assert.equal(status, 1);
  assert.match(stdout, /^::error::/m);
});

test("an unreadable tag list fails closed rather than overwriting a release", () => {
  const { status, stdout, out } = runDecide({
    version: "0.4.2",
    latestRelease: "v0.4.1",
    lsRemoteStatus: 128,
  });
  assert.equal(status, 1);
  assert.match(stdout, /^::error::/m);
  assert.equal(out.needed, undefined);
});
