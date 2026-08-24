# Report design mockups

Hand-built HTML mockups used to review the reporting look-and-feel **before** the engine
was implemented. They are design references, not the live templates — the real renderers
live in `utils/report-render/` and are driven by `config/report-model.js`.

- `01-assessment-report.html` … `05-portfolio-summary.html` — the five report types in the
  default Vanguard / Aegis SA styling.
- `06-assessment-report-BRANDED.html` — the same assessment report re-skinned for a fictional
  org (Meridian Health Group) to show org/project branding (Phase B).
- `07-ai-cost-controls.html` — UI mockup for the deferred Phase D AI cost controls
  (per-report approval, standing threshold, per-user token caps). Not yet implemented.

Regenerate PDFs (needs Google Chrome) with the `build-*.js` scripts, e.g.
`node build-assessment.js`. The `pdf/` output and `.logo.b64` cache are gitignored.
