/**
 * Canned evidence narratives and value fillers for the demo seeder.
 *
 * Deliberately not AI-generated: a demo needs to be instant, free and identical
 * every time. The drafts carry the same [[VALUE: …]] / [[ATTACH: …]] markers the
 * model emits, so the `fill` step is exercising the real shape of the data.
 *
 * Written for the reference architecture: a public Power Pages site over a
 * Dataverse backend, with internal users in a model-driven app.
 */

/** The default five. Chosen for a public portal + Dataverse back end. */
const DEFAULT_CONTROLS = ['AC-2', 'AC-3', 'AC-12', 'AU-2', 'IA-8'];

/** Draft narratives, keyed by control. Falls back to a generic one. */
const DRAFTS = {
  'AC-2': `<p>Accounts for [[VALUE: system/project name]] are managed in two populations. Internal staff who use the model-driven application hold accounts in [[VALUE: identity provider tenant, e.g. contoso.onmicrosoft.com]], provisioned from the HR joiner process and assigned Dataverse security roles by job function. External users of the public portal are represented as contacts and are granted access through web roles rather than named licences.</p>
<p>Account creation, modification and removal follow [[VALUE: account management procedure reference]]. Internal accounts are disabled within [[VALUE: deprovisioning SLA, e.g. 24 hours]] of a departure being recorded. Portal contacts are deactivated on request or after [[VALUE: portal inactivity period]] of inactivity.</p>
<p>Privileged roles are held just-in-time through Privileged Identity Management; standing administrative access is not granted. Access is recertified [[VALUE: recertification frequency, e.g. quarterly]], most recently on [[VALUE: last recertification date]].</p>
<p>Supporting evidence: [[ATTACH: account management procedure]], [[ATTACH: export of internal users and their security roles]], [[ATTACH: most recent access recertification record]].</p>`,

  'AC-3': `<p>Access to data in [[VALUE: system/project name]] is enforced in the Dataverse layer rather than in application code, so the same rules apply to the portal, the model-driven app and the API.</p>
<p>Internal users are constrained by Dataverse security roles with privileges scoped at [[VALUE: scope level, e.g. business unit]]. Public portal users reach data only through table permissions attached to web roles; anonymous visitors hold [[VALUE: anonymous web role name, or "no table permissions"]]. Each table exposed to the portal has its permissions scoped to the signed-in contact or their account, never to the whole table.</p>
<p>The table permission set was reviewed on [[VALUE: last table permission review date]] to confirm no table is readable by an unauthenticated web role. Column-level security protects [[VALUE: columns under column security, e.g. financial and medical fields]].</p>
<p>Supporting evidence: [[ATTACH: export of Power Pages table permissions and web roles]], [[ATTACH: Dataverse security role matrix]], [[ATTACH: column security profile export]].</p>`,

  'AC-12': `<p>Sessions in [[VALUE: system/project name]] are terminated on both an idle and an absolute basis. Portal sessions end after [[VALUE: portal idle timeout, e.g. 20 minutes]] of inactivity and are terminated absolutely after [[VALUE: portal absolute timeout, e.g. 8 hours]], configured in the site settings rather than left at the platform default.</p>
<p>Internal model-driven app sessions inherit the identity provider's session lifetime, set through Conditional Access policy [[VALUE: conditional access policy name]] with a sign-in frequency of [[VALUE: sign-in frequency, e.g. 8 hours]]. Closing the browser does not persist a session for privileged roles.</p>
<p>Sign-out terminates the session server-side and invalidates the authentication cookie; it does not rely on the client discarding it. Behaviour was verified on [[VALUE: session termination test date]].</p>
<p>Supporting evidence: [[ATTACH: portal session timeout site settings export]], [[ATTACH: Conditional Access policy showing sign-in frequency]], [[ATTACH: test record showing a session refused after timeout]].</p>`,

  'AU-2': `<p>[[VALUE: system/project name]] defines its auditable events in line with the applicable event-logging guidance and the system's risk profile. Auditable events include authentication activity for both internal and portal users, authorization and role changes, account management actions, creation, modification and deletion of records in audited tables, and security-relevant configuration changes.</p>
<p>Dataverse auditing is enabled at the environment level and per table. Tables under audit are [[VALUE: audited tables, e.g. Contact, Case, Payment]], with column-level auditing on [[VALUE: audited columns]]. The authoritative list is maintained in [[VALUE: location of the audit event catalogue]] and was last reviewed on [[VALUE: last review date]].</p>
<p>Audit data is retained for [[VALUE: audit retention period]] and forwarded to [[VALUE: central logging destination, e.g. Log Analytics workspace name]] for correlation and alerting.</p>
<p>Supporting evidence: [[ATTACH: auditable events catalogue]], [[ATTACH: Dataverse audit settings export showing audited tables and columns]], [[ATTACH: sample audit log export]].</p>`,

  'IA-8': `<p>Public users of [[VALUE: system/project name]] are not organizational users and authenticate separately from staff. The portal uses [[VALUE: external identity provider, e.g. Entra External ID]] as its identity provider; staff credentials are never accepted on the public site and portal credentials grant no access to internal systems.</p>
<p>Registration requires [[VALUE: registration verification method, e.g. email confirmation]] before any data can be reached. Multi-factor authentication is [[VALUE: MFA posture for external users, e.g. available and required for accounts holding financial data]]. Password and lockout policy is set to [[VALUE: external account lockout policy]].</p>
<p>External identities are mapped to Dataverse contacts, and authorization is carried entirely by web roles and table permissions — authentication alone grants no data access.</p>
<p>Supporting evidence: [[ATTACH: external identity provider configuration export]], [[ATTACH: portal authentication settings]], [[ATTACH: screenshot of the registration and verification flow]].</p>`
};

const GENERIC_DRAFT = `<p>[[VALUE: system/project name]] addresses this control through [[VALUE: how the control is implemented]], owned by [[VALUE: responsible team]]. The implementation covers both the public portal and the internal model-driven application.</p>
<p>The configuration is recorded in [[VALUE: configuration or design reference]] and was last reviewed on [[VALUE: last review date]]. Deviations are tracked in [[VALUE: exception register reference]].</p>
<p>Supporting evidence: [[ATTACH: configuration export or screenshot]], [[ATTACH: supporting procedure or design document]].</p>`;

/**
 * Fill a [[VALUE: hint]] marker. Matches on the hint so the result reads as if a
 * person answered, rather than "TBD" everywhere — which is what makes the demo
 * look real rather than half-finished.
 */
function fillValue(hint) {
  const h = String(hint).toLowerCase();
  const today = new Date();
  const daysAgo = n => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);

  if (/\bdate\b/.test(h)) {
    if (/next|scheduled/.test(h)) return daysAgo(-180);
    return daysAgo(45);
  }
  if (/system\/project name|project name/.test(h)) return 'the Claims Portal';
  if (/tenant|identity provider tenant/.test(h)) return 'contoso.onmicrosoft.com';
  if (/external identity provider/.test(h)) return 'Microsoft Entra External ID';
  if (/log analytics|logging destination/.test(h)) return 'claims-prod-law';
  if (/audited tables/.test(h)) return 'Contact, Case, Payment and Document';
  if (/audited columns|column security|columns under/.test(h)) return 'financial and medical detail columns';
  if (/anonymous web role/.test(h)) return 'no table permissions (anonymous access is not granted)';
  if (/conditional access policy/.test(h)) return 'CA-017 — Claims Portal session controls';
  if (/sign-in frequency/.test(h)) return '8 hours';
  if (/idle timeout/.test(h)) return '20 minutes';
  if (/absolute timeout/.test(h)) return '8 hours';
  if (/retention period/.test(h)) return '24 months';
  if (/recertification frequency|frequency/.test(h)) return 'quarterly';
  if (/deprovisioning sla|sla/.test(h)) return '24 hours';
  if (/inactivity period/.test(h)) return '18 months';
  if (/scope level/.test(h)) return 'business unit';
  if (/lockout policy/.test(h)) return 'lockout after 10 failed attempts for 30 minutes';
  if (/mfa posture/.test(h)) return 'available to all users and required for accounts holding financial data';
  if (/registration verification/.test(h)) return 'email address confirmation';
  if (/catalogue|repository location|location of/.test(h)) return 'SharePoint > Security > Claims Portal';
  if (/procedure reference|configuration or design reference|design/.test(h)) return 'SOP-SEC-014 v2.1';
  if (/exception register/.test(h)) return 'the departmental security exception register';
  if (/responsible team|owned by/.test(h)) return 'the Platform Engineering team';
  if (/how the control is implemented/.test(h)) return 'platform configuration enforced centrally and reviewed on a defined cycle';
  if (/policy document title|reference number/.test(h)) return 'ITSP-004 v3.2';
  return 'recorded in the system design documentation';
}

/** Draft for a control, or the generic one. */
function draftFor(controlId) {
  return DRAFTS[controlId] || GENERIC_DRAFT;
}

/**
 * Replace every marker in a draft. Attachments resolve to the filename that was
 * uploaded for them, when one was; otherwise the description is kept as prose so
 * the narrative still reads correctly.
 */
function fillMarkers(html, { attachmentNames = [] } = {}) {
  let i = 0;
  return String(html)
    .replace(/\[\[VALUE:\s*([^\]]+?)\s*\]\]/g, (_m, hint) => fillValue(hint))
    .replace(/\[\[ATTACH:\s*([^\]]+?)\s*\]\]/g, (_m, desc) => {
      const name = attachmentNames[i++];
      return name ? `<em>${name}</em>` : String(desc).trim();
    });
}

/** How many markers remain — used to report completeness honestly. */
function countMarkers(html) {
  const s = String(html || '');
  return {
    values: (s.match(/\[\[VALUE:/g) || []).length,
    attachments: (s.match(/\[\[ATTACH:/g) || []).length
  };
}

module.exports = { DEFAULT_CONTROLS, DRAFTS, draftFor, fillValue, fillMarkers, countMarkers };
