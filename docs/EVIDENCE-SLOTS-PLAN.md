# Implementation plan — evidence slots + file attachments

**Status: for review. Nothing below is implemented yet.**

Mockup: [`docs/ui-mockups/workflow-d-evidence-slots.html`](ui-mockups/workflow-d-evidence-slots.html)
— updated to show the real upload → scan → verdict lifecycle and the per-slot file limits.

---

## 0 · What I found in the code first

| | Today |
|---|---|
| Placeholders | `[[VALUE: …]]` / `[[ATTACH: …]]` are **plain text** inside `evidence_html`. Nothing knows how many there are or whether they're filled. |
| Progress | `evidence_status = 'provided'` is a per-control boolean. That's why a control holding 14 unfilled placeholders reads as 0 % — the only thing counted is "did they press save". |
| Attachments | `attachments` table + `POST /respond/:code/upload/:controlId`. They attach to a **control**, not to a specific `[[ATTACH:]]` slot. |
| Upload validation | **None.** `multer({ dest, limits: { fileSize: 25MB } })` — no `fileFilter`, no extension allow-list, no MIME check, no content sniffing. |
| Malware scanning | **None.** |
| Download | Served back without `Content-Disposition: attachment` / `nosniff` hardening (to confirm per route). |
| Storage | `UPLOAD_DIR=/home/site/uploads` with `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` — persistent, shared across instances. Good. |
| Deployment | `az webapp deploy` onto the **built-in** `NODE:22` Linux runtime — *not* a custom container. This is the single biggest constraint on scanning (see §3). |

The missing validation and scanning are worth treating as a security finding in their own right,
independent of this feature: the tool currently accepts any file of any type from an external
evidence provider and stores it.

---

## 1 · Remove "Refine with AI"

Straightforward deletion. Five touch points:

| File | What goes |
|---|---|
| `views/public/respond.hbs` | the button (~line 216), `aiRefineEvidence()`, `aiEvidencePreview()`, and the assistant greeting that references it (~line 733) |
| `views/admin/assessment-new.hbs` | the per-control button (~line 183) and `aiRefineControl()` (~line 397) |
| `routes/public.js` | `POST /respond/:code/ai-refine` |
| `routes/api.js` | `POST /ai/refine-answer` |
| `config/ai-service.js` | `refineControlAnswer()` + its export |

`locales/*.json`: leave `ui.refineWithAi` in place (harmless; removing a key from 8 files to save
nothing adds risk). **"Suggest a draft" stays** — that's the one that generates the slotted draft.

One thing to confirm: the admin **tailoring** page also has a "Refine with AI" on the *tailored
description* field, which is a different thing from evidence refinement. Say the word if you want
that one gone too; my assumption is **yes, remove both** since you asked for the functionality
removed, not just the evidence button.

---

## 2 · Evidence slots

### 2.1 Data model

New table — slots are first-class, not text:

```
evidence_slots
  id                INTEGER PK
  assessment_control_id INTEGER NOT NULL  → assessment_controls(id) ON DELETE CASCADE
  slot_key          TEXT NOT NULL      -- stable id, e.g. "s3"; survives re-renders
  slot_type         TEXT NOT NULL      -- 'value' | 'attach'
  label             TEXT NOT NULL      -- the AI's prompt: "last review date"
  position          INTEGER            -- document order, for the "next blank" jump
  value_html        TEXT               -- rich text, for slot_type='value'
  value_text        TEXT               -- stripped, for search/export/reports
  filled_at         DATETIME
  filled_by         TEXT
  removed_at        DATETIME           -- soft delete, so history stays honest
  UNIQUE(assessment_control_id, slot_key)
```

`attachments` gains `slot_id INTEGER NULL` so a file belongs to a *specific* `[[ATTACH:]]` slot
(existing control-level attachments keep `slot_id = NULL` and keep working).

`assessment_controls` gains two cached counters so list pages don't have to aggregate:
`slots_total INTEGER`, `slots_filled INTEGER`.

In `evidence_html` a slot becomes a marker element the editor can't accidentally mangle:
`<span data-slot="s3" contenteditable="false">…</span>`.

### 2.2 Migration of existing drafts

A one-time pass over every control whose `evidence_html` contains `[[VALUE:` / `[[ATTACH:`:
parse the markers in order, create `evidence_slots` rows, replace each marker with its span.
Idempotent, guarded by a `slots_migrated_at` column. **Non-destructive:** the original
`evidence_text` is preserved, so a bad parse can be rolled back.

Controls whose drafts were already hand-filled (no markers left) get `slots_total = 0` and are
treated as complete — they must not regress to "0 %".

### 2.3 Parsing on generation

`utils/evidence-suggest.js` already turns the model's output into HTML. It becomes the single place
that creates slots: parse markers → insert rows → emit spans. One parser, used by both the AI path
and the migration.

### 2.4 API

```
GET    /respond/:code/slots/:controlId          → slots + fill state (for re-render)
PUT    /respond/:code/slots/:slotId             → { value_html }      (value slots)
DELETE /respond/:code/slots/:slotId             → soft-remove the slot, keep the text
POST   /respond/:code/slots                     → insert a slot from selected text
POST   /respond/:code/slots/:slotId/files       → upload (see §3)
DELETE /respond/:code/slots/:slotId/files/:id   → detach
```

All behind `ensureEvidenceUser` + the existing `evidenceAccess()` edit gate, and all refused once
the assessment is `submitted` / `audit` / `completed` — same rules as `save/:controlId` today.

### 2.5 UI

As in the mockup: click a chip → modal. Value slots get a small rich-text box (bold, italic, lists,
pasted tables survive). Attachment slots get the drop zone. Filled = green with a ✓ and a preview;
click again to read or edit. The **Evidence view** toggle renders values inline as prose and
attachments as links, with anything still empty in red. Select text → *+ Value slot*; hover a chip →
× to drop it back to plain text.

### 2.6 Progress becomes real

`slots_filled / slots_total` replaces the boolean everywhere it currently lies: the provider's
header, the per-control card, the assessor's dashboard ("49 of 60 values, 8 of 14 files"), and
`Mark ready`, which stays disabled until a control hits 100 %.

This is the fix for the "0 of 5 · 0 %" bug from the walkthrough.

---

## 3 · Attachments: limits, validation, scanning

### 3.1 Limits (proposed — tell me if these are wrong)

- **5 files per attachment slot**, **25 MB each** (matches the current cap), **100 MB per control**.
- Allow-list, by extension **and** sniffed magic bytes, which must agree:
  `pdf, docx, xlsx, pptx, csv, txt, md, json, xml, png, jpg/jpeg, gif, svg*, zip*`
- `svg` only after sanitisation (it can carry script) — or drop it; say which you prefer.
- `zip` is the one I'd **exclude**: archives are the standard way to smuggle past a scanner, and
  evidence rarely needs one. Current plan: **reject archives**.
- Reject anything executable or macro-enabled: `exe, dll, js, vbs, ps1, sh, jar, docm, xlsm, pptm`.
- Filenames sanitised; stored under a generated name; original kept only as metadata.

### 3.2 Serving files back safely

`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, an explicit `Content-Type`
from the allow-list (never the client's), and no inline rendering of user HTML/SVG. Downloads stay
behind the same access check as the record.

### 3.3 Scanning — and the Azure constraint

**You cannot run ClamAV in-process today.** The app is deployed to the *built-in* Linux Node runtime
(`--runtime NODE:22`, `az webapp deploy`), where you have no root, no `apt-get`, and a reset
filesystem. [Sidecar containers](https://learn.microsoft.com/en-us/azure/app-service/overview-sidecar)
require a **custom container** app, which this is not. So scanning needs an infrastructure decision.

I propose shipping the code in two phases:

**Phase 1 — no new infrastructure (safe to ship now)**

A `utils/malware-scan.js` with a pluggable backend chosen by `MALWARE_SCANNER` env var, defaulting
to `none`. Files land in a **quarantine** directory and a `scan_status` column
(`pending | clean | infected | skipped | error`) gates everything:

- a file is not downloadable, not listed as evidence, and not counted toward slot completeness until
  it is `clean` or `skipped`;
- with `MALWARE_SCANNER=none`, files are marked **`skipped`** and the UI says *"not scanned"* —
  it never claims a file is clean when nothing checked it;
- the strict type/magic-byte/size validation of §3.1 applies regardless, which is already a large
  improvement over today's "accept anything".

**Phase 2 — pick one backend.** My recommendation is **(a)** for this product.

| | How | Trade-off |
|---|---|---|
| **(a) clamd over TCP** | ClamAV in an Azure Container Instance; app talks to it with the [`clamscan`](https://www.npmjs.com/package/clamscan) npm package over TCP, reached via VNet integration. | **Synchronous — infected files are rejected before they're stored.** Needs an ACI + VNet + a `freshclam` schedule for signature updates. Modest cost, no change to how you deploy the app. |
| **(b) Defender for Storage** | Move evidence files to Blob Storage; [on-upload malware scanning](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-storage-malware-scan) tags each blob. App releases a file only when the tag reads *No threats found*. | Fully managed, no scanner to run. But **asynchronous** — the quarantine state from Phase 1 becomes permanent architecture, not a stopgap. Also the right long-term answer for durability and scale. Enabled per storage account, and priced per GB scanned. |
| **(c) Custom container** | Switch App Service to a custom container with ClamAV baked in (or as a sidecar). | Most control; also unlocks sidecars generally. But it changes your whole deploy pipeline — `deploy-azure.sh` would be rewritten. Not something to do the week of a demo. |

**What I would not do:** send evidence files to a public multi-scanner API such as VirusTotal.
Samples submitted there are shared with third parties, which is indefensible for a tool holding
other organizations' security evidence and personal information.

Note on (a) and (c): ClamAV is good at known malware and weak at targeted/novel files. It is a
baseline control, not a guarantee — worth stating plainly in the help text so assessors don't
over-trust the green tick.

---

## 4 · Cross-cutting work (required by the repo's own rules)

- **Localization.** Every new string — modal titles, scan states, limit messages, error text — gets a
  key in **all 8 locales** before this ships. Estimated ~35 new keys (`es.*` prefix), added with a
  script like the existing `scripts/add-*-locales.js` and parity-checked.
- **Reports.** Per `CLAUDE.md`, a user-facing field that belongs on the printed record goes into the
  report model **and** the HTML, PDF and DOCX renderers. Filled slot values become part of the
  rendered evidence; attachments are listed with filename, size and scan status. CSV stays untouched.
- **Tests.** e2e coverage for: slot creation from a generated draft; fill → counters move; remove a
  slot → text survives; upload rejected by type; upload rejected by size; a file stays invisible
  while `pending`; `Mark ready` blocked until 100 %; migration of a legacy `[[VALUE:]]` draft.

---

## 5 · Sequencing and effort

| Phase | Scope | Rough size |
|---|---|---|
| **A** | Remove "Refine with AI" | small — can go out on its own today |
| **B** | Slot model + parser + migration + API | the bulk of the work |
| **C** | Slot UI (modals, evidence view, add/remove) + progress rework | medium |
| **D** | Upload hardening: type/magic-byte/size, quarantine, safe download headers, `scan_status` | medium — **ship this even if scanning waits** |
| **E** | Scanner backend (your choice from §3.3) | infra-led; app side is small once the backend exists |
| **F** | Localization, report renderers, tests | runs alongside B–D, not after |

**I would not start B–D before your demo.** A is safe; the rest changes the evidence flow you're
about to present. My recommendation: ship **A** now, demo on what's there, start **B** after.

---

## 6 · Decisions — answered 2026-10-08

| # | Decision | Status |
|---|---|---|
| 1 | Remove "Refine with AI" | **Evidence page: done** (shipped). Tailoring page: **left in place** — see below. |
| 2 | Scanner backend | **Phase 1 only**, in-process Node, files stay in `UPLOAD_DIR` as today. See the correction below. |
| 3 | File types | **Reject standalone archives. Drop SVG entirely.** |
| 4 | Pending-scan behaviour | **Do not hide the file.** Anyone with access to the record can download it. |
| 5 | Timing | **B–D start after the demo.** |

### On #1 — the tailoring page has no "Suggest a draft"

Your condition was "provided both have the suggested draft feature". The evidence page does, so its
Refine button is gone. The **tailoring** page's Refine sits on the *tailored description* field and
has **no per-control suggest counterpart** — removing it would leave that field with no assistance
at all. It is still there. Two ways forward, your call:

- **(a)** Leave it. The AI assistant panel on that page can already propose tailoring text via its
  `tailor` action, so there is a path, just not a per-control button.
- **(b)** Build a per-control "Suggest tailoring" to match the evidence page, then remove Refine.

### On #2 — there is no Node library that does this

This is the one place I have to push back on the brief. **No pure-Node or WebAssembly antivirus
exists.** Every Node "antivirus" package — [`clamscan`](https://www.npmjs.com/package/clamscan),
`pompelmi`, `h5p-clamav-scanner` — is a wrapper that shells out to the native ClamAV binary or talks
to a `clamd` daemon over TCP. On the built-in App Service Node runtime there is no binary to shell
out to and no daemon to reach, so none of them will work at runtime without the infrastructure from
§3.3. I could not find a WASM build of ClamAV.

So Phase 1 cannot honestly be called virus scanning. What it **can** do, in-process, with no new
infrastructure, is **content-safety validation** — which catches the realistic document-borne
threats for this product and is a large improvement over today's "accept anything":

1. **Magic-byte verification** (`file-type`, pure JS): the real content must match the claimed
   extension. `payload.exe` renamed `evidence.pdf` is rejected.
2. **Allow-list by extension AND sniffed type**, both of which must agree:
   `pdf, docx, xlsx, pptx, csv, txt, md, json, xml, png, jpg/jpeg, gif`.
3. **Reject standalone archives** (`zip, rar, 7z, tar, gz`) and everything executable or
   macro-enabled (`exe, dll, js, vbs, ps1, sh, jar, docm, xlsm, pptm`). **SVG dropped** per #3.
   Note: `docx/xlsx/pptx` are themselves ZIP containers — the archive rule targets *standalone*
   archives, not OOXML.
4. **Active-content inspection**, the part that earns its keep:
   - **PDF** — reject on `/JavaScript`, `/JS`, `/OpenAction`, `/AA`, `/Launch`, `/EmbeddedFile`.
   - **OOXML** — unzip and reject on `vbaProject.bin` (macros) or external/remote relationship
     targets.
5. **EICAR detection**, so the control is demonstrably testable in a demo.
6. **Filename sanitisation**, generated storage names, per-slot (5) and per-control (100 MB) caps.
7. **Safe serving**: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, an
   explicit `Content-Type` from the allow-list — never the client's.

**The UI must not lie about this.** A file that passes shows **"Checked"**, not "Clean", with help
text saying files are validated for type and active content but **not scanned for malware** unless
an AV backend is configured. The `MALWARE_SCANNER` hook from §3.3 stays in the code so clamd can be
switched on later without touching the UI, at which point the badge becomes a real "Clean".

Because this validation is **synchronous**, there is no pending state in Phase 1 — a file is either
accepted or rejected at upload. Your answer to #4 only starts to matter if you later add a real
asynchronous scanner.

### Revised §3.1 limits, per your answers

- 5 files per attachment slot, 25 MB each, 100 MB per control.
- Allow: `pdf, docx, xlsx, pptx, csv, txt, md, json, xml, png, jpg/jpeg, gif`.
- Reject: standalone archives, executables, macro-enabled Office, **SVG**.
- Storage: unchanged — `UPLOAD_DIR` (`/home/site/uploads` on Azure, already persistent).
