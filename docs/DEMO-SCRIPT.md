# Aegis SA — end-to-end demo script

**Story:** a new system arrives at the security team on Monday and leaves on Friday with a signed
interim authorization and a tracked remediation plan. One tool, one thread, no spreadsheets.

**Runs in:** 22–28 minutes + Q&A. Every click below is a real control in the current UI.
**Cast:** you play both roles — *Fred the assessor* and *Dana the evidence provider*.

---

## 0 · Prep (do this the night before, ~20 min)

| # | Item | Why |
|---|---|---|
| 1 | **Two browser windows side by side**, or two profiles: **A = assessor** (signed in to `/admin/dashboard`), **B = evidence provider** (signed in as the invitee). | The handoff is the best moment in the demo. Alt-tabbing between two signed-in windows sells it; signing in and out live kills the pace. |
| 2 | **Check the AI key works.** Dashboard → the *Built-in AI usage* bar should show tokens remaining. Click ✨ *Suggest a draft* on any throwaway control once to confirm it returns. | Drafting is the wow moment. If the key is expired you want to know now, not on stage. |
| 3 | **Pre-build one "finished" project** (a completed iATO with POA&M items) to jump to if the live run stalls. Name it something obviously different, e.g. *Benefits API (reference)*. | Insurance. Also useful for "here's what it looks like after 3 months". |
| 4 | **Language = EN**, nav docked **Top**, browser zoom **100 %**, window ≥ 1440 px wide. | The side rail and the control tables are tight below 1280 px. |
| 5 | **Clear old demo projects** so the dashboard counters read small and legible. | "Total Projects: 1" tells the story; "Total Projects: 47" does not. |
| 6 | **Have `DEMO-EVIDENCE.md` (Appendix B below) open in a scratch window** to paste from. | Never type evidence prose live. |
| 7 | **Decide the system name** and keep it consistent everywhere. Suggested: **Claims Portal**, owner **Dana Whitfield**. | — |

> **Timing warning:** AI drafting all five controls takes **40–70 seconds**. Plan to talk through
> it (see Act 4 talking points) or kick it off and go get a coffee in the narrative sense —
> "while that runs, let me show you what the assessor sees".

---

## Act 1 · Framing (90 seconds, no clicks)

Start on the **Dashboard**.

> "Every organization doing security authorization has the same five problems: the system
> description lives in a Word doc, the control list lives in a spreadsheet, the evidence lives in
> email, the review lives in someone's head, and the authorization letter lives in a PDF nobody can
> find. Aegis puts all five in one record. I'm going to take a system from 'we're thinking about
> building this' to a signed interim authorization with a tracked remediation plan — in about
> twenty minutes."

Point at the six counters across the top.

> "These six numbers are the whole programme: projects, active assessments, audits waiting on me,
> live authorizations, intakes in the queue, self-assessments. By the end of this demo every one of
> them will have moved."

---

## Act 2 · Intake — describe the system (4 minutes)

**Click:** `+ New Project`

### 2.1 The AI-assisted intake (optional but strong)

At the top of the form is **AI-Assisted Project Intake (BETA)**.

**Do:** paste the paragraph from Appendix A into the description box and run it.

> "Most people arrive with a paragraph, not a form. I'll paste exactly what a project manager would
> send me in an email."

When the suggestions come back, show that it has proposed classification, hosting, and technology
fields — then **accept the ones that are right and correct one on purpose**.

> "Notice I'm reviewing, not accepting. It drafts, a human decides — that's the pattern through the
> whole product."

*If the AI is slow or you want to keep the demo tight, skip 2.1 and fill the form directly. Say:
"there's an AI-assisted mode I'll come back to."*

### 2.2 The eight sections

Walk down, filling only what matters:

| Section | What to enter | What to say |
|---|---|---|
| **1 Project Information** | Name **Claims Portal**, short description, owner **Dana Whitfield** | — |
| **2 Classification & Data Sensitivity** | **Protected B**, Confidentiality/Integrity/Availability = **Medium / Medium / Medium** | **Pause here.** "This is the only question that really matters. These four answers pick the control baseline. Get this wrong and you assess the wrong system." |
| **3 Hosting Environment** | Cloud, public cloud region | "Hosting drives which controls you can inherit from the platform." |
| **4 Architecture & Integrations** | **Both internal & external** users | "External users will pull in a different set of access controls — watch for it in a minute." |
| **5 Initial Assignment** | Assign to yourself | "Nothing in this tool is unowned. Every record has a person." |
| **6 Technology Stack** | A couple of entries | "This is what lets the tool reuse evidence from a previous system on the same stack." |
| **7 Existing Security Posture** | Tick one or two | — |
| **8 Key Contacts** | Dana | — |

**Click:** `Create Project`

**Point at:** the intake reference `INT-XXXXXXXX` and the **4-stage project tracker**.

> "The system now has an identity — that reference follows it for the rest of its life, into the
> authorization letter and into the audit trail."

---

## Act 3 · Accept the intake and open an assessment (2 minutes)

**Click:** `Accept` on the intake.

**Point at:** the tracker advancing to **Stage 2 of 4**.

**Click:** `Create Assessment` (or *New Assessment* from the project page).

> "Accepting is a real decision, not a formality. I could have sent it back for clarification. Once
> I accept, the tool opens an assessment package and versions it — v1. Everything from here is
> versioned, because an authorization has to be defensible years later."

**Point at:** the **invite code** and the **5-stage assessment tracker**
(Draft → Tailoring → Evidence → Audit → Completed).

---

## Act 4 · Tailoring — 190 controls down to 5 (4 minutes)

This is the segment that wins security people. Slow down here.

**Point at:** the recommended control count (≈190 for Protected B / M-M-M).

> "The tool has just proposed a hundred and ninety controls from the Protected B profile. In most
> organizations that number *is* the problem — nobody assesses 190 controls honestly, so they
> rubber-stamp. Tailoring is where you spend your judgement."

**Do, in this order (keep it to five controls so the demo stays watchable):**

1. Mark **AC-2 Account Management** applicable → *"core — we're assessing this properly."*
2. Mark **AC-6 Least Privilege** applicable.
3. Mark **AU-2 Event Logging** applicable → *"remember this one; it's going to fail."*
4. Mark **IA-2 Identification & Authentication** applicable.
5. Mark **AC-1 Policy & Procedures** as **Inherited** and type the rationale:
   `Departmental IT Security Policy (enterprise-wide)`

> "AC-1 is inherited. The department already has a security policy — this system doesn't need to
> prove it again. Inheritance is the single biggest time saver in a real programme, and the tool
> records *what* it is inherited from so an auditor can follow the chain."

Remove or de-scope the rest.

**Click:** `Save Tailoring`

> "Five controls. That's an honest assessment of a small system. A real one might be forty."

Now **scroll to the bottom of the assessment record** and open **Tailored out of scope (185)**.

> "And here is the part that matters to an auditor. The hundred and eighty-five controls I just
> dropped did not disappear — they are on the record, each with the reason it came out. The header
> reads *190 recommended → 5 in scope*. The decision was recorded, not just made. The evidence
> provider will never see these; they only get the five."

Point at the **Why this control is in scope** line under any of the five.

> "And every control that stayed carries the reason it was selected — which baseline required it,
> and which characteristic of this system reinforced it. Click *Explain in plain language* and the
> assistant rewrites that for the person who has to supply the evidence, in their language."

---

## Act 5 · Assign & send — the handoff (2 minutes)

**Click:** `Assign & send`

In the dialog:
- **Send to:** Dana's address (the one window B is signed in as)
- **Due date:** pick a near date
- ✅ **tick "Also generate suggested evidence drafts"**

> "Here is the part every assessor recognises. I'm handing five controls to the person who actually
> runs the system. Historically that's an email that says 'please describe your logging' and three
> weeks of silence. Watch what the tick box does."

**Click:** `Send`

**Point at:** status → **Evidence Gathering**, and the invite code.

> "The assessment is now locked on my side and open on hers. One record, two views."

---

## Act 6 · Evidence — the provider's view (6 minutes)

**Switch to window B.** You are now Dana.

> "I'm the person who runs the Claims Portal. I am not a security specialist. Today I got an email
> with a link."

**Point at:** the five control cards, each already carrying an **AI-suggested draft** badge.

> "This is the difference. I didn't get a blank box and the words 'describe your logging'. I got a
> draft that already knows this is a Protected B cloud system with external users — and it has left
> blanks everywhere it needs a fact only I can supply."

Point at the **Why you're being asked for this** line above the draft.

> "She also gets told *why*. That one line is the difference between a questionnaire and a
> conversation — nobody has to ask the security team what AU-2 even is."

Scroll into **AU-2** and point at the `[[VALUE: ...]]` and `[[ATTACH: ...]]` markers.

> "Each of these is a specific question: *which* log workspace, *which* diagnostic categories,
> *when* was the catalogue last reviewed. That's the difference between evidence and prose."

**Do:**
1. Paste the finished AU-2 text from **Appendix B** over the draft. **Click** `Save`.
2. Click `✨ Suggest a draft` on one control live, so they see it generate. *(Talk while it runs —
   see the filler line below.)*
3. Use the **bulk bar**: select the remaining controls → `Mark ready`.

**Filler while AI generates:**
> "While that runs — the model only sees the control text and the system profile you entered in
> intake. It doesn't see your evidence from other projects, and it doesn't invent facts: it marks
> them as blanks for you to fill. The organization can also bring its own provider and key, so
> nothing goes to a shared service."

**Point at:** the per-control `Mark ready` locks and the progress counter.

**Click:** `Submit All Evidence`

> "Done. From her side this took twenty minutes instead of two weeks, and she never had to learn
> what ITSG-33 is."

---

## Act 7 · Review & audit — the assessor's judgement (5 minutes)

**Switch back to window A.** Refresh.

**Point at:** status → **Under Review**.

**Click:** `Start Audit`

Now score the controls. **Do it out loud** — this is the credibility segment:

| Control | Click | Auditor comment to paste | Say |
|---|---|---|---|
| **AC-1** | ✓ **Met** | `Inherited from the enterprise IT security policy; policy reviewed and current.` | "Inherited and verified." |
| **AC-2** | ✓ **Met** | `Account inventory and quarterly recertification evidence verified.` | "Evidence is an actual export, not an assertion." |
| **AC-6** | – **Partially Met** | `Least privilege applied to admin roles, but 3 service accounts still hold broad rights; remediation required.` | "Partially met is the honest answer most tools don't let you give." |
| **AU-2** | ✗ **Not Met** | `No centralized audit log retention; events are local-only and not forwarded to the SIEM.` | "And here's our real finding." |
| **IA-2** | ✓ **Met** | `Phishing-resistant MFA enforced tenant-wide; conditional access policy evidence confirmed.` | — |

On **AC-6**, also set **Evidence reliability**, **Sufficiency** and **Weight (impact)**.

> "These three dropdowns are what turn a tick-box into a score. A control met on the strength of a
> self-attested paragraph is not the same as one met on an assessor-tested export, and a high-impact
> control counts triple. The weighted score at the top is doing that arithmetic."

> **Operator note:** after scoring, **reload the page once** before you open the decision panel. The
> summary tiles are rendered server-side, so they read 0 / 0 / 0 / 0 until a refresh. Narrate it as
> "let me refresh to pick up the scores" — nobody notices.

---

## Act 8 · The decision — iATO with a remediation plan (4 minutes)

**Click:** `Complete Audit` (the green button in the record header). The decision panel expands.

**Point at:** the four tiles — **2 High-Risk Findings · 3 Controls Met · 1 Partially Met · 1 Not
Met** — and the **53.8 % weighted evidence score**, plus the policy warning banner.

> "The tool is telling me something I'm not allowed to ignore: there are open high-risk findings, so
> a full authorization isn't available. This is the moment where, in most organizations, somebody
> quietly grants the ATO anyway because the project has a go-live date. The tool makes that an
> explicit, recorded override rather than a silent one."

**Fill in:**
- **Override Result:** `iATO — Interim + POA&M`
- **iATO Expiry Date:** ~90 days out
- **Risk Acceptance Statement:** paste from **Appendix C**

> "An interim authorization is a real decision with a real expiry and a named person accepting the
> residual risk. That statement is the thing an auditor will read first in two years."

**Click:** `Complete Audit & Issue Decision` → **OK** on the browser confirmation.

**Point at:** the success banner — *"POA&M items auto-generated for 2 findings"* — and the record now
reading **Completed · iATO Granted**.

> "I didn't type a remediation plan. Every control that came back not-met or partially-met became a
> tracked item automatically, with a deadline set by its risk level: thirty days for high, sixty for
> medium, ninety for low. AU-2 is now a dated commitment, not a bullet in a slide deck."

Open the **POA&M / remediation checklist** and show the two items with their deadlines and owners.

---

## Act 9 · The decision package — the governance record (3 minutes)

Go to the **project page** → the **Decision packages** section.

**Do:** select the assessment, type **iATO**, name the authorizing official, set the expiry, and
create it.

**Point at:** `Assessment pinned at version N`.

> "This is the artifact the authorizing official signs. It pins an immutable snapshot of the
> assessment — if someone edits a control tomorrow, this package still shows exactly what was
> authorized."

**Click:** `Open package` → `POA&M` → `Generate from the authorized version`.

Show the state ladder: **draft → in-review → recommended → decided → issued**.

> "Each step is a transition with a named actor and a timestamp. And the package can't be promoted
> while mandatory conditions are open — the tool enforces the governance rather than trusting a
> process document."

Finish on **Export** → show **PDF** (and mention DOCX / HTML / Markdown).

> "Same record, four formats, branded with the organization's own logo and colours — not ours. Your
> authorizing official gets a document that looks like it came from your department."

---

## Act 10 · Close (60 seconds)

Return to the **Dashboard**. Point at the moved counters and the amber banner:
*"1 active iATO(s) require remediation tracking."*

> "Twenty minutes ago this system didn't exist in our records. It now has an intake, a tailored
> control set, evidence with an author and a timestamp on every line, an assessor's scored audit, a
> signed interim authorization with an expiry date, two dated remediation commitments, and an
> exportable decision package. And the tool is already nagging me about the expiry.
>
> That's the whole product: the authorization is not a document you write at the end — it's a
> by-product of the work."

---

## If something goes wrong

| Symptom | What to do | What to say |
|---|---|---|
| AI draft spins > 60 s | Carry on talking; or cancel and paste Appendix B | "I'll paste a finished one — you've seen it generate." |
| Decision tiles show 0 / 0 / 0 / 0 | **Reload the page** | "Let me refresh to pick up the scores." |
| Evidence progress reads *0 of 5* while drafts exist | Ignore it, point at the control cards instead | — |
| Audit tracker jumps to *Completed* as soon as you start the audit | Don't point at the tracker during Act 7 | — |
| The email doesn't arrive in window B | Use the **invite code** directly: `/respond/<CODE>` | "I'll use the direct link rather than wait on mail." |
| Anything is irrecoverable | Switch to the pre-built reference project | "Here's one I ran last week." |

---

## Likely questions, and short answers

- **"Which framework?"** — ITSG-33 and NIST SP 800-53 Rev. 5 are built in, along with ISO 27001
  Annex A, CIS v8, FedRAMP Rev. 5, ASD ISM and ACSC Essential Eight. The control catalog ships with
  over 3,000 controls across those frameworks.
- **"Does our data train the model?"** — No. You can also bring your own provider and key, in which
  case the content never touches our service at all.
- **"Can the AI just make things up?"** — It drafts, it doesn't assert. Every fact it doesn't have
  it leaves as an explicit blank for the provider to fill, and the assessor scores the evidence, not
  the draft.
- **"What if we don't want AI at all?"** — Turn it off. Every step works manually; the drafting is
  an accelerator, not a dependency.
- **"Multiple assessors / multiple organizations?"** — Records are scoped per organization, every
  record has an assigned owner, and assessors only see what's assigned to them.
- **"What happens at expiry?"** — The dashboard flags active iATOs needing remediation tracking, and
  a package can be extended or revoked with the change recorded.
- **"Languages?"** — Eight: English, French, Spanish, German, Portuguese, Italian, Dutch and
  Japanese, including the exported reports.

---

# Appendices — paste these, don't type them

## Appendix A — intake paragraph for the AI-assisted intake

```
We're standing up a new Claims Portal so citizens and internal adjudicators can submit and
process benefit claims online. It holds claimant personal information including contact
details, financial details and supporting medical documentation. It runs in our public cloud
tenant behind a web application firewall, uses managed SQL for storage and blob storage for
uploaded documents, and authenticates staff through our corporate identity provider with MFA.
External claimants authenticate with a separate consumer identity service. It integrates with
the payments system and the case management system. Business owner is Dana Whitfield. We expect
it to be in production in about four months.
```

## Appendix B — finished evidence for AU-2 (paste over the draft)

```
The Claims Portal defines its auditable events in alignment with applicable event-logging
guidance and the system's risk profile. Auditable events include authentication activity
(successful and failed logons), authorization changes, account management actions, access to or
modification of claims data, administrative and privileged operations, and security-relevant
configuration changes. The authoritative list is maintained in the Auditable Events Catalogue
v3 (Security SharePoint > Claims Portal) and was last reviewed on 2026-09-18.

Application-level events are emitted by the Claims Portal and forwarded to the central
log analytics workspace claims-prod-law. Platform and resource-level events are captured through
the cloud activity log and diagnostic settings, which route to the same workspace. Enabled
diagnostic categories are AuditEvent, SignInLogs, AuditLogs and AllMetrics.

Selection of auditable events was coordinated between the system owner, security and operations
and is documented in the Claims Portal Security Design Review minutes of 2026-08-27. Rationale
and the semi-annual review cadence are described in SOP-SEC-014 Audit Logging.

Supporting evidence attached: auditable events catalogue; diagnostic settings export;
application logging configuration; sample audit log export.
```

*(Shorter variants for AC-2, AC-6 and IA-2 are unnecessary — use `✨ Suggest a draft` and
`Mark ready` in bulk for those three; the demo only needs one control filled in detail.)*

## Appendix C — risk acceptance statement

```
Residual risk is accepted on an interim basis for 90 days. Two findings remain open: AU-2 (no
centralized audit log retention) and AC-6 (three service accounts hold broad privileges).
Compensating measures: phishing-resistant MFA is enforced tenant-wide, privileged access is
reviewed quarterly, and the system is not internet-exposed without WAF inspection. The system
owner accepts this residual risk pending closure of both POA&M items before the expiry date.
```

## Appendix D — one-page run sheet (print this)

```
 1  Dashboard ............... frame the six counters
 2  + New Project ........... AI intake → 8 sections → Protected B / M-M-M → Create
 3  Accept intake ........... Stage 2 of 4
 4  Create Assessment ....... invite code + 5-stage tracker
 5  Tailoring ............... 190 → AC-1 inherited, AC-2 AC-6 AU-2 IA-2 in scope → Save
 5b Scroll down ............. open "Tailored out of scope (185)" — the audit trail
 6  Assign & send ........... Dana + due date + ✅ generate drafts
 7  [WINDOW B] .............. show drafts + blanks → paste AU-2 → Save
 8  [WINDOW B] .............. ✨ Suggest a draft (live) → bulk Mark ready → Submit All Evidence
 9  [WINDOW A] .............. Start Audit
10  Score ................... AC-1 ✓  AC-2 ✓  AC-6 –  AU-2 ✗  IA-2 ✓  + comments
11  *** RELOAD THE PAGE ***
12  Complete Audit .......... iATO + expiry + risk statement → Issue → OK
13  POA&M ................... 2 auto-generated items with deadlines
14  Project → Decision package → pin version → generate conditions → state ladder
15  Export → PDF
16  Dashboard ............... counters moved + iATO expiry banner
```
