# Implementation plan — inferred values, document quality, contributors

Three features requested 14 Oct 2026. **C is implemented; A and B are planned and
awaiting the decisions in §4.**

| | Feature | Status |
|---|---|---|
| **A** | Values inferred from project documents, with citations | Planned — needs decisions |
| **B** | Documentation quality analysis and gap suggestions | Planned — needs decisions |
| **C** | Contributor audit trail + Contributors report | **Implemented** |

---

## A · Values inferred from project documents

**The ask.** When a project document already contains a fact a `[[VALUE:]]` slot
is asking for, pre-fill it — but show it in a *third* state, not "done": a
distinct colour meaning *inferred, review me*. Clicking the slot offers an icon
that opens the source document and the excerpt it came from. Accepting promotes
it to the ordinary filled state, as if typed. Citations are listed at the foot of
the control, each linking to its document with the same excerpt icon.

### Data model

`evidence_slots` gains:

```
inferred_at        DATETIME     -- set when the AI proposed the value
inferred_from      TEXT         -- JSON [{documentId, name, excerpt, page?}]
accepted_at        DATETIME     -- set when a human accepted it
accepted_by        TEXT
```

Three states, not two:

| State | Condition | Colour |
|---|---|---|
| Empty | no value | amber (today's unfilled chip) |
| **Inferred** | `value_text` set, `inferred_at` set, `accepted_at` null | **violet** — review me |
| Filled | `value_text` set, and either never inferred or `accepted_at` set | green |

`isFilled()` already drives completeness and **Mark ready**. The question in §4.1
is whether an un-accepted inferred value should count toward completeness.

### Flow

1. The provider presses **Suggest a draft** (or a new **Infer from documents**).
2. The existing document text extraction (`readDocumentText`, already used by
   `/assessments/:id/ai/document-guidance`) feeds the project's documents to the
   model along with the slot labels.
3. The model returns, per slot it can answer: the value, the document id, and a
   **verbatim excerpt** it relied on. An excerpt that is not found in the
   document's text is discarded — the citation must be checkable, not generated.
4. Inferred slots render violet. The value modal gains a **source** icon
   (`bi-quote`) opening a second modal: document name, the excerpt highlighted,
   and a link to download the document.
5. **Accept** sets `accepted_at` and the chip turns green. Editing the text also
   counts as acceptance — the human has taken ownership of it.
6. The control footer lists every citation: document name (link) + excerpt icon.

### Why the excerpt must be verified

An AI that cites a document is trusted more than one that does not, which makes
a fabricated citation worse than no citation. Step 3 above discards any excerpt
that does not appear verbatim in the extracted text, so a citation shown to an
assessor is always one they can open and find.

---

## B · Documentation quality analysis

**The ask.** Score each project document and list what a reader would still need
to ask. For a solution architecture document of a Node.js portal that would be:
CDN, firewall, hosting and deployment, RBAC, WCAG, testing, DevSecOps, ALM,
OWASP. Suggestions, not findings — the goal is to help a project write a fuller
document, not to grade them.

### Data model

```
document_reviews
  id, document_id → project_documents(id)
  version              INTEGER   -- re-analysis after a re-upload increments
  score                INTEGER   -- 0-100
  summary              TEXT
  gaps_json            TEXT      -- [{topic, why, suggestion, severity}]
  model, created_at, created_by
```

Keeping every version is the point: the score moving 48 → 71 after a re-upload is
the feedback loop the feature exists to create.

### UI

- The project Documentation table gains a column with a **lightbulb**
  (`bi-lightbulb`) — the industry-standard "suggestion", not a warning triangle,
  because these are not defects. Score shown as a small pill beside it.
- The modal lists each gap: topic, why it matters, and a concrete suggestion.
- **Share** — `mailto:` with the summary as the body, falling back to a PDF
  export when no mail client is registered (see §4.2).
- **Upload a new version** — re-runs the analysis, writes a new row, and shows
  the score delta against the previous version.

### Topic checklist

Generic across frameworks, with the model asked to add any the system's own
description implies: architecture & data flow, hosting & deployment, network &
boundary, identity & RBAC, data classification & retention, logging & monitoring,
backup & recovery, testing, DevSecOps & pipeline, ALM & change management,
accessibility (WCAG), OWASP/application security, third parties, privacy.

---

## C · Contributor audit trail — IMPLEMENTED

**The ask.** Every value, attachment and link must carry a solid record of who
provided it. A dedicated **Contributors report** covering all CRUD across a
project and its related records, and a **Contributors chapter** in the full
project report naming everyone who contributed.

### What was there before

`assessment_control_history` — control-scoped evidence snapshots, written on
save / AI draft / ready / review. It could not answer "who attached this file",
"who changed the authorizing official", or "who tailored this control out",
because nothing outside the evidence editor wrote to it.

### What was built

A project-wide `project_activity` log:

```
project_activity
  id, project_id, entity_type, entity_id, entity_ref,
  action, field, detail,
  actor_name, actor_email, actor_type,   -- assessor | provider | ai | system
  created_at
```

Written from every mutation that matters: slot values, slot add/remove,
attachments and references (added and removed), evidence saves, ready/reactivate,
review decisions, audit results, assessment creation and tailoring, intake
accept, project contact edits, and decision-package create/transition/issue.

Two surfaces:

- **Contributors report** (`/admin/reports/contributors/:projectId`) — the full
  detail: every action, who, when, against which record, in all four formats.
- **Full project report** — a final **Contributors** chapter: one row per person
  with their role, what they contributed (counts by kind), and their first and
  last activity. A summary, not the log.

### Attribution honesty

`actor_type` separates `ai` from a person. An AI-drafted value that nobody
accepted is attributed to the model, not to the last human who opened the page —
otherwise the report would credit a person with work they did not do.

---

## 4 · Decisions needed before A and B are built

### 4.1 Does an un-accepted inferred value count as complete?

My recommendation: **no**. If it counted, a provider could press one button and
have the control report 100% without a human having read a single inferred fact —
which is exactly the "0 of 5 · 0%" problem the slots work fixed, in reverse. The
header would show a third figure: `3 filled · 2 to review · 1 blank`.

### 4.2 Share: mailto or PDF?

`mailto:` cannot carry an attachment, and a long analysis makes an unusable URL.
Proposed: **Share** opens `mailto:` with a short summary and a link back to the
document review; **Export PDF** is a separate button for distribution. Tell me if
you would rather the one button fell back automatically.

### 4.3 Which documents feed inference?

All active project documents, or only those the assessor ticked for AI use (the
existing `?documents=` selection on the assessment screen)? I propose **the
assessor's selection when one exists, otherwise all** — the assessor already
curates that list and should not be overruled by the provider's page.

### 4.4 Re-analysis cost

Each document analysis is one model call over the whole document (truncated to
~90k characters, as the existing document-guidance route does). A project with
ten documents is ten calls. Should re-analysis be manual only (my proposal), or
automatic on every upload?

### 4.5 Does an inferred value need assessor visibility?

The assessor's Evidence record (shipped) shows who filled each slot. Should an
inferred-but-accepted value show as "Accepted from *document*" rather than just
the accepting person's name? I think **yes** — it is materially different
provenance, and the assessor should see it.
