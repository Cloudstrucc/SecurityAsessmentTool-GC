# Demo runbook — end-to-end in ~15 minutes

A step-by-step script for running one project from intake to authorization on
**dev**, with every link and button named. Tested end to end on 14 October 2026.

- **Base URL:** https://vanguard-saa-dev.azurewebsites.net
- **Sign in:** https://vanguard-saa-dev.azurewebsites.net/admin/login
- Every link below is relative to the base URL.
- Replace `{projectId}`, `{assessmentId}`, `{packageId}`, `{CODE}` with the ids
  the app gives you as you go.

> **Before you start.** The AI calls take 10–20 seconds each. Click once and
> wait — clicking again queues a second call. Budget ~4 minutes of the 15 for
> AI responses.

---

## Stage 1 — Create the project (AI pre-fill) · ~3 min

1. Go to **`/admin/projects/new`**.
2. In the **Describe The Project** box (right-hand card), paste a couple of
   sentences — purpose, users, data, hosting, integrations. Example:

   > AegisDesk is an internal IT service-desk portal for a federal department.
   > Staff raise tickets through a web app, attach screenshots, and track
   > resolution. It runs on Azure App Service with Azure SQL, authenticates
   > staff through Entra ID with MFA, and stores employee contact details and
   > ticket history.

3. Press **Get Suggestions**. *(Alternatively press **Choose File** → **Analyze
   & Pre-Fill** to drive it from an architecture document — a PDF or .docx both
   work.)*
4. **Talking point:** the panel lists ~22 suggested fields *with its reasoning*,
   and nothing is saved until you accept. Press **Accept All**.
5. Fill in **Project Name**, and under **Key Contacts** the project owner and
   project authority.
6. Check the **Security Framework** — the AI often picks NIST SP 800-53. For a
   GC demo switch it to **ITSG-33**; the baseline dropdown re-populates with
   PBMM / CCCS_LOW / etc.
7. Press **Create Project**. You land on `/admin/projects/{projectId}` and the
   flash names the intake reference.

---

## Stage 2 — Review and accept the intake (AI review) · ~2 min

8. On the project page, under **Project Intake**, click the intake reference
   (or go to **`/admin/intakes/{intakeId}`**).
9. Press **AI Review** (top right).
10. **Talking point — this is a strong moment.** A panel slides in with a risk
    level, a readiness score out of 10, an executive summary, a profile
    assessment, **Suggested Overrides** each with its own **Apply** button, and
    a list of risk factors. It is advice the assessor accepts or ignores.
11. Close the panel. Optionally adjust the C/I/A overrides.
12. Press **Accept Intake** at the bottom. You return to the project.

---

## Stage 3 — Tailor the controls (AI drafting) · ~3 min

13. On the project page press **+ Create** in the **Assessments** card, or go to
    **`/admin/projects/{projectId}/assessments/new`**.
14. The header reads **"N of N controls in scope"**. Press **Deselect All**,
    then tick just **AC-2** and **AU-2** (use the family chips at the top to
    jump). The header updates to **"2 of N in scope · N-2 tailored out"**.

    > **Talking point:** nothing is deleted. The other controls stay on the
    > record as *tailored out* with a reason, and the evidence provider will
    > only ever see the 2 in scope.

15. On **AC-2**, press **Tailor** to expand the panel.
16. Type a one-line note in **Tailored Description**, e.g. *"Scoped to AegisDesk
    staff accounts in Entra ID and the ticket-system service principal."* Press
    **✨ Refine with AI**. A purple **AI-refined draft** box appears — press
    **Approve** to accept it.

    > It works from an empty box too: it will draft from the control itself.

17. Press **✨ Generate with AI** above **Evidence Guidance**. You get a bulleted
    list of exactly what the provider must supply, naming your project's own
    technologies. Press **Approve**.
18. Repeat 15–17 for **AU-2**.
19. Press **Create Assessment**. Flash: *"2 control(s) in scope, N tailored out."*

---

## Stage 4 — Provide the evidence (AI pre-fill + attachments) · ~4 min

20. On `/admin/assessments/{assessmentId}` press **Assign & Send** (or **Send
    invite**) to activate it. Then open **`/admin/assessments/{assessmentId}/evidence`**
    — it redirects to `/respond/{CODE}`, which is what the evidence provider sees.

    > **To show the provider persona properly:** copy the `/respond/{CODE}` link
    > into a private window. The invite code is shown on the assessment page.

21. On a control press **✨ Suggest a draft**.
22. **Talking point — the placeholder mechanic.** The draft comes back as a
    written narrative with the unknowns left as colour-coded slots:
    **`[[VALUE: review frequency]]`** in amber and
    **`[[ATTACH: Entra ID access review export]]`** in blue, with a counter
    underneath: *"15 placeholder(s) still to fill in."* The AI never invents a
    fact it was not given.
23. Click into the editor and replace the placeholders with real values.
24. Under **Attachments** press **Choose File** → **Upload**. Repeat for each
    file. They appear immediately as download chips and survive a reload.
25. Press **Mark ready** on each control, then **Submit All Evidence**.

---

## Stage 5 — Audit and score · ~3 min

26. Back on **`/admin/assessments/{assessmentId}`**, press **Start Audit**.
27. For each control set the **Audit** result (✓ met / — partially met / ✗ not
    met), then **Evidence reliability**, **Sufficiency** and **Weight (impact)**.
28. **Talking point — the scoring is transparent.** Under each control a line
    reads *"Weight high (×3) · 60% of the assessment score · of a possible 60% ·
    100% of its own ceiling"*. Press the **?** next to the big percentage at the
    top for the full formula.

    > Leave one control at **partially met** so the engine grants an **iATO**
    > rather than a full ATO — it makes a better story and generates POA&M items.

29. Press **Mark reviewed** on a control. It turns into a green **Reviewed**
    chip plus **Reopen**, and the whole control greys out — signed off and
    read-only until reopened.
30. *(Optional, shows the round trip:)* on the other control press **Requires
    re-submission**, tick its checkbox, press **Send for update** in the bottom
    bar, and add a note. The provider's `/respond/{CODE}` page now shows an amber
    *"Reactivated for re-submission"* banner, your note against the flagged
    control, and every other control as **Read-only — for reference**.
31. Press **Complete Audit**, fill the risk acceptance statement, submit.
    Result: **iATO Granted**.

---

## Stage 6 — Decision package and authorization · ~2 min

32. On the project page, in **Decision packages**, choose the assessment, set
    **Decision type** to *Interim Authority to Operate (iATO)*, press **Create
    decision package**.
33. Fill **Authorizing official**, **Executive summary**, **Residual risk
    statement**, **Conditions**, **Decision rationale**. Press **Save**.
34. Press **Generate POA&M** — conditions are created from the findings with
    risk-based due dates (30/60/90 days).
35. Advance the package with the state buttons: **In review** → **Recommended**
    → **Decided** → **Issued**. The tracker reads **Stage 5 of 5**.
36. Back on the project: **Stage 4 of 4**, *Authorization issued* ticked.
37. *(Optional)* press **Archive** to tick *Project closed* — the tracker then
    reads **All stages complete**. Note the project disappears from the project
    list once archived; reach it directly at `/admin/projects/{projectId}` and
    press **Restore** to bring it back.

---

## The report to show

**Full project report → `/admin/reports/project/{projectId}.pdf`**

From the project page, the **Reports** card offers **PDF · Word (DOCX) · HTML ·
Markdown · CSV**, plus **Open full report**.

This one document contains the whole story:

| Section | What it shows |
|---|---|
| Project information | Classification, framework, profile, contacts |
| Assessments | Every assessment with version, score and result |
| Decision packages | Reference, type, state, issued/expires |
| Outstanding conditions | The POA&M register with owners and due dates |
| **Authorization decision** | Authorizing official, assessor, dates, executive summary, residual risk statement, decision rationale, conditions |
| **Controls and evidence** | Every in-scope control with its result pill, tailoring rationale, the full evidence narrative, and the assessor's finding |
| **Tailoring register** | Every control tailored out, with its exclusion reason |
| **Evidence attachments** | Every file the provider filed, against its control |

**Use the PDF for the demo** — it is paginated, branded per project/org, and the
one artefact you can hand to an authorizer. Use **HTML** if you want to show it
on screen with live styling, or **DOCX** if someone needs to edit it.

> The last four sections were added on 14 Oct 2026. Before that the report was a
> summary only and did not contain controls or evidence.

Other reports, if you want to drill in: **Security assessment report**
(controls + findings only), **Authorization decision package**, **POA&M
register**, **Portfolio summary** (all systems in the org).

---

## If something goes wrong

| Symptom | Cause / fix |
|---|---|
| An AI button seems to do nothing | It takes 10–20 s. Check the spinner on the button before clicking again. |
| Audit stats read 0/0/0/0 | Server-rendered stats don't refresh after AJAX scoring — reload the page. |
| Control won't accept an audit result | It's probably marked **Reviewed** and locked. Press **Reopen**. |
| Project vanished from the list | It was archived (closed). Go to `/admin/projects/{projectId}` directly and press **Restore**. |
| "Your trial plan includes N projects" | Plan limit. The dev org is on a plan allowing 3 projects. |

---

## Known gap to avoid on stage

The percentage on the **audit screen** is weighted (impact weight × evidence
reliability × sufficiency). The score recorded on **Complete Audit** uses a
different, unweighted formula — `(met + ½ partially met) ÷ total`. The two
numbers can differ (in testing: 76.2% on screen, 75% recorded; and 92.4% vs
100%). Don't put both on screen in the same breath. See
[AUDIT-SCORING.md](AUDIT-SCORING.md) for the full detail and the open question.
