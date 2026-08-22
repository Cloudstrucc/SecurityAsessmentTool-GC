# Testing guide — Aegis SA

Everything automated lives in one end-to-end suite that exercises the real HTTP
surface: it boots the actual app against a throwaway database, signs in through
the real MFA flow, and drives features over HTTP rather than calling functions
directly. If a test passes, the feature genuinely works through the routes a user
hits.

---

## Running the tests

```bash
npm run test:e2e
```

That is the whole command — no environment variables are needed. The runner sets
`MFA_ENABLED=true` on the server it spawns, so the TOTP/passkey flows are
exercised even though MFA is off by default in the app.

Other entry points:

```bash
npm run test:e2e:raw     # run node --test directly (no Markdown report)
```

Run a single test by name:

```bash
node --test --test-name-pattern "decision package state machine" tests/e2e/*.test.js
```

### What a run does

1. Creates a temporary SQLite database under the OS temp directory.
2. Seeds dedicated users (MFA assessor, MFA client, non-MFA admin, break-glass).
3. Starts the app on a random free port.
4. Runs every check against that server.
5. Deletes the temporary database.

Your real `data/sa-tool.db` is never touched.

Each run writes a Markdown report to `tests/reports/e2e-<timestamp>.md`. These are
generated artifacts — they are not committed.

### Requirements
- Node.js 20 LTS (18+ works).
- No network access is required. Tests that touch integrations use reserved
  domains (`.invalid`, `.test`) or unconfigured settings so they fail fast and
  deterministically instead of calling the internet.

### Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `Server did not start in time` | Another process is on the port, or startup threw. The captured server output is printed with the failure. |
| Sandbox refuses to bind a port | Some sandboxes require approval to listen. Run on a normal shell. |
| A locale test fails on an apostrophe | Handlebars escapes `'` to `&#x27;`; assert on apostrophe-free copy. |

---

## The suite at a glance (71 checks)

### Authentication, MFA & accounts
| Check | What it proves |
|---|---|
| Admin without MFA signs in directly | MFA is genuinely optional when disabled for a user |
| Break-glass admin signs in with password only | Emergency access works without MFA |
| MFA assessor sees passkey setup, TOTP still available | Passkeys never remove the TOTP fallback |
| Passkey sign-in exposes usernameless WebAuthn options | WebAuthn discovery works |
| Passwordless registration creates a workspace | Sign-up without a password |
| Signed-in user views notifications / changes password | Self-service account actions |
| Root-admin console restricted to root admins | RBAC on the tenant console |
| Registration with an unknown comp code is rejected | Comp codes cannot be guessed |
| Redeeming an invalid invitation shows not-found | No information leak on bad codes |

### Projects, intakes & assessments
| Check | What it proves |
|---|---|
| Client creates an intake after TOTP login | The client intake path end to end |
| Admin creates a project + linked intake | Project creation wires up its intake |
| Project intake updates rather than duplicates | Re-submission does not fork records |
| Admin creates an assessment from the intake | Assessment creation and linkage |
| Admin uploads and re-downloads SADD documentation | Document round-trip |
| Admin tailors controls and persists rich fields | Tailoring survives a reload |
| Non-ITSG frameworks usable for projects/assessments | Multi-framework support is real |
| Admin browses the control catalog | Catalog renders |
| Catalog includes major non-ITSG frameworks | Catalog breadth (CIS, ISO, FedRAMP, NIST, ASD, ACSC) |
| Archive a project and restore it | Archiving hides without deleting |
| Archiving cascades to non-draft assessments | Related records follow the parent |
| Deleting a project requires the exact name | Destructive action is guarded |
| Pre-assessments require sign-in | No anonymous pre-assessments |
| Admin manages Team invitations and users | Invite/user management |
| Exports produce real PDFs | Assessment/controls/project/ATO exports are valid PDFs |
| AI evidence guidance previews and saves | AI guidance is previewed before it is stored |
| ATO records and linked POA&M items | POA&M management |

### Assessment versioning
| Check | What it proves |
|---|---|
| Creation captures a baseline version; checkpoints add versions | Every assessment starts revertable |
| Reverting restores the prior control set as a new active version | Revert is non-destructive and auditable |
| A version summary reports what changed since the previous version | The change diff is accurate |
| Viewing a past version renders read-only, without the assistant | Snapshots cannot be edited by accident |

### Business process flow (chevrons)
| Check | What it proves |
|---|---|
| A project shows four stages with a derived current stage | Stage position is computed, never stored |
| The project header no longer duplicates the create action | The duplicate button stayed removed |
| The flow is localized in every supported language | All 8 languages render, including the stage counter |

### Assistant (single chat surface)
| Check | What it proves |
|---|---|
| The Assistant is on every major record | project · assessment · intake · decision package all offer it |
| Context-aware starter prompts per record type | Prompts differ per record and are localized |
| The legacy AI panel is no longer a chat entry point | Its floating trigger is gone/hidden; it survives only as a result viewer |
| The project page shows the active decision package flow | Stage-3 progress is visible without opening the package |
| The evidence portal requires an account | Anonymous read AND write are refused; signed-in users get through |

### Cross-cutting
| Check | What it proves |
|---|---|
| Status badges are localized, not hardcoded English | `statusBadge` renders per language and never falls back to English |
| A decision package exports a PDF from the pinned version | The document reflects what was authorized, not live data |
| The retired assessment ATO route no longer exists | Authorization lives only in decision packages (404) |

### Intake acceptance
| Check | What it proves |
|---|---|
| Accepting an intake that already has a project creates nothing new | No duplicate project or assessment; returns to the existing project |
| Accepting a standalone intake creates a project (no assessment) | Client-submitted intakes get a project, and only a project |
| Accepting advances the project flow to the assessment stage | Intake stage completes and the next action becomes "Assessment created" |

### Decision packages (authorization)
| Check | What it proves |
|---|---|
| Creating a package pins an immutable assessment version + snapshot | The authorization is tied to exactly what was assessed |
| The state machine rejects invalid jumps, allows the legal path | `draft → issued` is impossible; the step-by-step path works |
| An issued package cannot be deleted | Issued authorizations are protected (revoke instead) |
| An assessment is locked under review, released once issued | The package cannot shift under the approver, and work resumes after |
| Authorization has moved off the assessment | The old ATO UI is gone from the assessment page |

### Mention notifications
| Check | What it proves |
|---|---|
| A mention notifies in-app and never the author | Self-mentions produce nothing |
| Preferences can be changed and are respected | Per-user in-app / email toggles persist |
| Emails are link-only unless the tenant opts in | Discussion text stays out of inboxes by default |

### POA&M (conditions on a decision package)
| Check | What it proves |
|---|---|
| POA&M has moved off the assessment | The assessment no longer shows or manages conditions |
| A condition runs the evidence-then-review loop | Team submits evidence → assessor accepts → counted as met |
| A full ATO is blocked while conditions are outstanding or overdue | Promotion gate is enforced server-side, with the reason explained |
| Extending carries unfinished conditions into the successor | Originals are deferred and linked to where they went |
| Decision package edits are versioned; revert restores fields | Audit history is real, not just a baseline |
| Revert never touches POA&M verdicts; issued packages can't be reverted | An editorial revert cannot erase review decisions |

### Collaboration
| Check | What it proves |
|---|---|
| Threads roll up to the project and filter by record | Polymorphic threads with a project parent |
| Mentions resolve only project members and project records | A user cannot mention people/records outside the project |
| Collaboration can be turned off per project | The toggle really blocks posting (HTTP 403) |
| Decision packages + collaboration localized in all languages | New UI ships translated, not English-only |

### Organization settings & integrations
| Check | What it proves |
|---|---|
| Root admin can create, verify and delete org settings (CRUD) | Full lifecycle incl. delete |
| Org settings deletes restricted to root admins | RBAC on destructive settings |
| A custom domain is verified only when DNS really resolves | No self-attested verification |
| Each integration exposes a re-validate action with history | Real checks, logged for 24h |
| Integration validation restricted to root admins | RBAC on validation |

### Billing & public pages
| Check | What it proves |
|---|---|
| Public can view pricing and registration | Marketing pages render |
| Trial registration creates a workspace and signs in | Sign-up path works |
| Authenticated users can open the help guide | In-app help is reachable |
| `/sa-tool-overview.html` redirects to the live route | Stale static files cannot shadow a route |

---

## Conventions when adding tests

- **Drive the HTTP surface**, not internals — use the `request` / `getText`
  helpers and a `CookieJar`, the same way a browser would.
- **Use the seeded helpers**: `loginAdminWithTotp()`, `createAdminProject()`,
  `createSingleControlAssessment()`, `createDecisionPackage()`.
- **Assert behaviour, not markup detail** where possible. When you must assert on
  HTML, pick a stable hook (a class like `pf-chev`, or user-visible copy).
- **Keep tests offline and deterministic.** Use reserved TLDs (`.invalid`,
  `.test`) for anything that would otherwise hit DNS or a third party.
- **Localization:** every new user-facing feature needs a test asserting it
  renders in the non-English locales (see the two `localized in every supported
  language` tests for the pattern). Assert on apostrophe-free copy.
- **New feature ⇒ new checks.** A PR that adds behaviour should move the count in
  this document.

## Manual testing
Flows that are awkward to automate (Stripe checkout, real SMTP/SMS delivery,
passkey enrolment on a device) are covered in
[manual-testing-guide.md](manual-testing-guide.md).
