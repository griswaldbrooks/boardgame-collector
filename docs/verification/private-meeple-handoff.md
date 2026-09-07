# Private Meeple handoff: implementation evidence

## Scope and truth boundary

Built from upstream `ed3ad6b74acf7021da388078ba729c1adb081514` in an isolated
`feat/meeple-private-handoff` worktree. No production deployment, Tailscale Serve
configuration change, Google action, version bump, signing-key change or release.
This proves phone-side logic → private receiver durability → local readable job →
honest gated outcomes. It does **not** prove live Google additions or phone VPN/TLS.

Spec: [ADR 0010](../adr/0010-private-meeple-handoff.md). Source/test traceability:

| Seam | Implementation | Evidence |
|---|---|---|
| Full-field explicit preview, selection, model-provider privacy | `src/handoff-screen.js` | `test/handoff-screen.test.js`, Chromium 390px screenshot |
| Immutable key/body/exact destination; lost ACK; storage failure; restored legacy identity | `src/handoff.js` | `test/handoff.test.js`, real restarted receiver integration |
| No phone data clearing; delegated/manual exclusion | `src/queue.js`, `src/screens.js` | queue + handoff + UI tests |
| Exact native origin pin, narrow routes, no redirects | `src-tauri/src/meeple.rs`, app command permissions | four Rust tests, real loopback redirect rejection, Android target check |
| Loopback auth, Origin/JSON/custom header, bounds, durable atomic intake | `receiver/meeple_receiver.py` | nine Python tests with real SQLite/ephemeral HTTP |
| Per-item local evidence, contact distinction, lock, interruption gate | same receiver CLI | Python tests + JS→HTTP→CLI→poll integration |

## RED → GREEN observed

Tests were written and run before implementation at the receiver, client outbox,
UI and native request seams. The initial RED runs returned:

- Receiver: seven failing tests, `private receiver is not implemented`.
- Client: seven failing tests, `handoff not implemented`.
- UI: four failing tests, `Meeple screen missing`.
- Native: three failing tests (`not implemented` origin/routes and an attempted
  redirect to the synthetic refused port); separate endpoint-pin test failed
  with `not implemented` before its implementation.
- Follow-up RED regressions: concurrent polling rolled `added` back to `received`;
  duplicate signup processor view contained two items instead of one; processor
  argv used `-q` rather than stdin; processor lock fd was not inherited.
- Real mobile browser inspection exposed a long-note text overflow that bounding
  boxes alone missed. Tightened test to inspect `scrollWidth`; it failed on the
  contact card, then passed after scoped `overflow-wrap: anywhere`.

The initial discovery assertions were removed during GREEN refactoring; final
tests assert behavior, not file existence. No retained production stub.

## Final local gates

- `npm ci`: zero reported vulnerabilities.
- `npm run lint`, `npm run format:check`, `npm run build`: pass.
- `npm test`: **126 passed, zero failed**. This includes the real loopback
  JS/HTTP/SQLite/CLI integration. Existing mocked-network warnings and Node's
  MockTimers experimental warning are expected test diagnostics, not live calls.
- `python3 -m unittest discover -s receiver -v`: **9 passed**.
- `cargo fmt --check`, `CARGO_BUILD_JOBS=2 cargo clippy --all-targets -- -D warnings`,
  `CARGO_BUILD_JOBS=2 cargo check`: pass on the Linux host.
- `CARGO_BUILD_JOBS=2 cargo test --lib`: **4 passed**.
- `cargo check --target aarch64-linux-android`: pass with NDK 27.2 and
  `CC_aarch64_linux_android=aarch64-linux-android24-clang` / corresponding CXX,
  NDK LLVM bin on PATH. Max two cargo jobs; isolated target directory.

A first clippy run caught an ignored read count in the synthetic redirect test;
fixed to assert nonempty input, then all-targets clippy passed. The file tool's
standalone Rust-2015 parser complained about async syntax, but authoritative cargo
commands use the manifest's edition and all pass.

## Reproduce synthetic integration

```sh
node --test test/handoff-integration.test.js
```

A completed run returned job `6cea987d45c54cc19a203f28e4008d06`, reused the same
receipt after a lost acknowledgement and receiver restart, and returned synthetic
outcomes `[added, already_member, invitation_required, blocked, stored_contact]`.
All four phone signups and the private contact remained stored. The default CLI
run first returned `blocked`; no Hermes/Google mutation ran. Outcomes above were
explicitly injected via the **local evidence CLI** with `SYNTHETIC test observation
only; no Google interaction`, not fabricated Google responses. Each rerun mints
its own receipt. Test output confirms receiver stopped and temporary DB removed.

## Browser evidence

With Vite bound to `127.0.0.1:5179`, run the optional harness (Playwright installed
outside the project; no new runtime dependencies):

```sh
PLAYWRIGHT_MODULE=/path/to/playwright \
CHROMIUM_EXECUTABLE=/path/to/chrome \
node tools/verify-meeple-browser.cjs
```

It blocks all non-loopback requests, seeds only synthetic data, exercises the
actual Home/preview/select/browser-refusal/retry path, checks 390px layout and
zero page errors, and closes its isolated browser. Screenshots on the verification
host: `/tmp/meeple-preview-mobile.png`, `/tmp/meeple-records-mobile.png`,
`/tmp/meeple-unknown-mobile.png`. The native sending capability is intentionally
unavailable in that browser, so the observed outcome is unknown/retry, never
false received/added. Actual sending/status is separately proven by integration.

## Remaining gates / limitations

- Independent parent review and upstream CI approval/state must be checked on the
  PR; local green is not remote CI or review approval.
- No live Serve identity/spoof stripping, native phone Tailscale, APK installation
  or signer-preserving update proof. Signing environment was not available;
  no replacement/debug signer was used and no APK was installed. Native host and
  Android target compilation are not an APK/physical-device claim.
- Owner Google login and working computer-use access are absent. No grant was
  enabled. `--owner-session-ready` is an explicit operator assertion; real jobs
  must stay gated until setup and review. Ambiguous Google actions must be verified
  against membership and pending invitations before any retry.
- The transfer ledger is not copied into Downloads backups in this slice. After
  reinstall/restore, explicit resend reconciles against durable server identity;
  manually draining before host reconciliation is unsafe. No automatic deletion.
- Editing protected `AGENTS.md` was denied by the environment, so it was left
  unchanged rather than bypassing the guard. Its old local-only/agent-stub/host
  library claims need a separately authorized maintenance edit; current behavior
  and actual prerequisites are documented in README and ADR 0010.

Exact production activation steps (new ports only, private config, signer and
owner session checks) remain in ADR 0010. No unattended real-record worker.
