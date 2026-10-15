# Implementation plan — demo seeding

**Status: for review. Nothing below is implemented.**

Two asks:

1. A terminal script that, given a project ID, creates an assessment with **one control per
   family**, generates the evidence drafts, then fills in the values and attachments.
2. A **document you upload during intake** that bypasses everything and produces a complete
   project + intake + 5-control assessment, owned by a user you nominate, so it shows up in that
   person's project list.

---

## 0 · The decision that shapes everything: how do we write?

We hit this three times today. The app holds the whole SQLite database **in memory** (sql.js) and
rewrites the entire file when it saves. So a script that opens the same file and writes to it will
have its changes **silently overwritten** by the next thing the running app saves. On Azure you
cannot stop the app and still SSH into it, so that window cannot be closed.

| | Direct DB writes | **Through the app's HTTP endpoints** |
|---|---|---|
| Works while the app is running | ✗ silently clobbered | ✓ |
| Works against dev / QA / prod without SSH | ✗ | ✓ |
| Needs auth | ✗ | ✓ (sign-in + TOTP) |
| Exercises real code paths | ✗ — can create states the app never would | ✓ |
| Speed | faster | a few seconds slower |

**Recommendation: drive the HTTP endpoints.** The repo already has a proven client for exactly this
— `tests/e2e/security-assessment.e2e.test.js` has a `CookieJar`, a `request()` helper and
`loginAdminWithTotp()`. The script extracts that into `scripts/lib/api-client.js` and both the test
suite and the script use it.

Direct DB mode stays available as `--db <path>` for a **local, stopped** app, with a loud warning
when it detects the port is in use.

---

## 1 · `scripts/demo-assessment.js`

One script, subcommands, same argument style as `manage-users.js` / `manage-org.js`.

```
node scripts/demo-assessment.js <command> [options]

  create   --project <id> [--per-family 1] [--families AC,AU,IA] [--label "..."]
  draft    --assessment <id> [--ai | --no-ai]
  fill     --assessment <id> [--attachments] [--mark-ready]
  submit   --assessment <id>
  audit    --assessment <id> [--mix 2met,1partial,1notmet] [--decision iato]
  package  --assessment <id> [--issue]
  all      --project <id> [--no-ai] [--stop-at evidence|audit|iato|issued]

Connection (pick one):
  --base-url https://vanguard-saa-dev.azurewebsites.net   (default: $AEGIS_BASE_URL)
  --db /path/to/sa-tool.db                                (local, app must be stopped)

Auth (HTTP mode):
  --email / --password / --totp-secret   (or $AEGIS_EMAIL / $AEGIS_PASSWORD / $AEGIS_TOTP)
```

### How "one control per family" works

Rather than re-deriving the baseline, the script **GETs the New Assessment page** for the project
and parses the hidden inputs the form already renders (`offered_ids`, `title_*`, `desc_*`,
`family_*`, `priority_*`, `risk_*`, `rationale_*`, `inherited[*]`). It then:

1. Groups the offered controls by `family_*`.
2. Picks one per family — highest priority first (P1 > P2 > P3), then lowest control ID, so the
   choice is deterministic and demo-stable.
3. POSTs the same form back with every `offered_ids` preserved and `control_ids` set to the chosen
   subset, so **the controls you did not pick are recorded as tailored-out with a reason** rather
   than vanishing — the behaviour shipped on this branch.

That gives roughly 15–20 controls for a Protected B profile (one per family). `--families AC,AU,IA`
narrows it to the 3–5 control demo you have been showing. `--per-family 2` widens it.

### `draft` — generating the evidence skeletons

- `--ai` (default): calls `POST /respond/:code/suggest-bulk`, polls `/suggest-status`. Realistic,
  but 40–70 s and it spends tokens.
- `--no-ai`: writes a canned narrative per control family from a template table in the script, with
  the same `[[VALUE: …]]` / `[[ATTACH: …]]` markers the model would emit. **Instant, free,
  deterministic** — which is what you want 20 minutes before a demo.

### `fill` — values and attachments

- Replaces every `[[VALUE: hint]]` with a plausible value chosen from the hint (dates → a recent
  date, "workspace name" → `claims-prod-law`, "policy reference" → `ITSP-004 v3.2`, and a sensible
  default otherwise).
- With `--attachments`, **generates** small valid files at runtime (a one-page PDF, a PNG, a CSV)
  and POSTs them to `/respond/:code/upload/:controlId`, then replaces each `[[ATTACH: desc]]` with
  the uploaded filename. No binaries committed to the repo.
- `--mark-ready` calls `/respond/:code/ready/:controlId` per control.

### `audit` and `package`

- `audit` scores each control per `--mix`, writes an auditor comment, then completes the audit with
  `--decision` (`iato` by default), a 90-day expiry and a risk-acceptance statement.
- `package` creates the decision package pinned to the assessment, generates the POA&M conditions
  from the failed controls, and with `--issue` walks the ladder Draft → In review → Recommended →
  Decided → Issued.

### `all`

Runs the chain with `--stop-at` so you can park the demo wherever you want it to start — e.g.
`--stop-at evidence` leaves it waiting for the provider, which is the best place to begin a live
demo.

---

## 2 · The seed document

### Format

A JSON file with a marker, named `*.aegis-seed.json`:

```jsonc
{
  "aegisSeed": 1,
  "owner": "fpearson+11@cloudstrucc.com",   // must be in the caller's own org
  "project": {
    "name": "Claims Portal",
    "description": "...",
    "data_classification": "protected-b",
    "confidentiality_level": "protected-b",
    "integrity_level": "medium",
    "availability_level": "medium",
    "app_type": "hybrid",
    "project_owner_name": "Dana Whitfield",
    "project_owner_email": "dana.whitfield@example.org",
    "technologies": ["entra-id", "azure", "waf", "mfa"]
  },
  "intake": { "accept": true },
  "assessment": {
    "controls": ["AC-1", "AC-2", "AC-6", "AU-2", "IA-2"],
    "inherited": { "AC-1": "Departmental IT Security Policy (enterprise-wide)" },
    "evidence": "filled",          // none | drafted | filled
    "attachments": true,
    "stopAt": "evidence"           // evidence | submitted | audited | iato | issued
  }
}
```

Everything except `aegisSeed` and `project.name` has a sensible default, so a three-line file works.

### Two ways to use it — and the one that needs a decision

**(a) CLI — `node scripts/seed-demo.js --file claims-portal.aegis-seed.json`.** No new attack
surface. This is the safe default and I would build it first.

**(b) Upload it on the New Project screen** (what you asked for). The server detects the marker in
the uploaded `reference_document`, skips the AI parse, and creates everything directly.

> **(b) is a privilege-escalation surface and needs gating.** A document that creates records and
> **sets their owner** is, by definition, a way to write data as somebody else. Minimum conditions
> before I would ship it:
>
> - **Admin routes only.** Never wired to the public `/intake` form.
> - **Off by default**, behind `ENABLE_SEED_IMPORT=true`. Set it on dev/QA, never in prod's env file.
> - **Owner constrained to the caller's own organization** — a seed file cannot drop a project into
>   another tenant's workspace. This is the condition I care about most; without it the feature
>   breaks the tenant isolation the rest of the app enforces.
> - **Audit-logged** with who uploaded it and what it created.
> - Size cap and a schema validation pass before anything is written.
>
> With those in place I am comfortable building it. Without them I am not, and I would ship (a) only.

### Related finding, while I was in there

`routes/api.js` mounts 32 routes and **20 have no authentication**. Most are legitimately
unauthenticated (login, WebAuthn, MFA). Two are not:

- **`POST /api/ai/parse-document`** — unauthenticated, accepts a file upload, and calls the model.
  Anyone who can reach the host can spend your AI token budget and get model output back.
- **`GET /api/comments/:controlId`** — unauthenticated read of control comments by numeric ID.

Neither is part of this work, but both are worth a ticket. I can raise them separately.

---

## 3 · What the seed writes, and in what order

Through the app's own endpoints, so the records are identical to hand-created ones:

1. `POST /admin/projects/new` → project + intake
2. Accept the intake
3. `POST /admin/projects/:id/assessments/new` → assessment, with the chosen controls in scope and
   the rest recorded as tailored-out
4. `POST /admin/assessments/:id/send-invite` → activates, generates the invite code
5. Assign to `owner` so it lands in their list and their queue
6. Evidence per `evidence`: drafted (markers left in) or filled (+ attachments)
7. Optionally submit → audit → iATO → decision package → issued, per `stopAt`

---

## 3b · Deleting stale intakes

You cannot remove a stale intake today. The Actions menu offers Export, AI Review, Accept Intake and
View project — nothing else — and there is **no delete or archive route for an intake at all**
(`routes/admin.js` has only `get`, `assign`, `status`, `accept`, `create-project`).

The good news: **this is half-built already.**

- `intake_submissions` already has **`archived_at`** and **`status_before_archive`** columns.
- All seven intake list/count queries already filter `archived_at IS NULL` — dashboard, counters and
  the intakes list.
- Archiving a **project** already cascades to its intakes (`/admin/projects/:id/archive` sets both
  columns on the project's intakes).

So the only thing missing is the per-intake action. Proposed:

| Route | Behaviour |
|---|---|
| `POST /admin/intakes/:id/archive` | Mirrors the project pattern: stash `status_before_archive`, set `status='archived'` and `archived_at`. Reversible. Hides it from every list and counter immediately, because the filters already exist. |
| `POST /admin/intakes/:id/unarchive` | Restores the stashed status, clears `archived_at`. |
| `POST /admin/intakes/:id/delete` | Hard delete, for junk. **Guarded**: refuses if the intake is linked to a project or an assessment (`project_id` set, or any `assessments.intake_id` points at it) and tells you to archive instead. |

UI: three items in the intake Actions dropdown (`views/admin/intake-review.hbs`) and a row action on
the intakes list, with Archive as the prominent one and Delete tucked behind a confirm.

**Why archive is the default and delete is guarded.** Your current stale intakes are not junk —
`INT-61135369` is the intake behind project 2 and its assessment. Hard-deleting it would orphan
`assessments.intake_id` and break the project's intake reference and the audit trail. Archive hides
it everywhere with no data loss; delete is for intakes that never became anything.

Scope: one route file, one view, ~8 locale keys across 8 files, one e2e test. Small and independent
of the seeding work — **I can ship it on its own, ahead of everything else, if you want the stale
intakes gone now.**

---

## 4 · Sequencing

| Phase | Scope | Size |
|---|---|---|
| **A** | `scripts/lib/api-client.js` — extract the e2e client (cookie jar, TOTP login, request helper) | small |
| **B** | `demo-assessment.js`: `create` + `draft --no-ai` | small |
| **C** | `fill` (values, generated attachments) + `submit` | medium |
| **D** | `audit` + `package` + `all --stop-at` | medium |
| **E** | `seed-demo.js` CLI reading the manifest | small once B–D exist |
| **F** | Upload-detected seed import, gated as in §2 | medium, needs your decisions |

A–E is the useful 80% and touches **no application code** — pure tooling, no risk to the running
product. F is the only part that modifies the server.

---

## 5 · Dependency worth flagging

The `fill` step does regex replacement of `[[VALUE:]]` / `[[ATTACH:]]` markers, because that is what
the evidence is today. When the **evidence slots** work from `EVIDENCE-SLOTS-PLAN.md` lands, slots
become real rows and `fill` should switch to the slots API. Building `fill` now is still worth it —
it is ~40 lines and it is what makes the demo quick — but expect to revisit it.

---

## 6 · Decisions I need

1. **Transport** — HTTP by default, as recommended? Or do you specifically want direct DB writes
   (and accept they only work against a stopped local app)?
2. **Seed upload (§2b)** — build it with the gating above, or CLI-only for now?
3. **Owner constraint** — confirm a seed file may only assign ownership **within the uploader's own
   organization**. I will not build cross-tenant assignment.
4. **Default scale** — is "one control per family" (~15–20 controls) the right default for `create`,
   with `--families` to narrow to the 5-control demo? Or should the default be the 5-control set?
5. **Should I raise the two unauthenticated `/api` routes** as a separate ticket now?
6. **Intake deletion (§3b)** — ship it first as a standalone change? And confirm: archive as the
   default action, hard delete only for intakes not linked to a project or assessment?
