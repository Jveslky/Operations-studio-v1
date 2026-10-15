# Long Shift — first 100 pull request checkpoint

Draft prepared October 14, 2026, for Jon and Clyde. PR98 is merged and its Live SQL installation was confirmed true/true. PR99 is open; its setup QA remains pending. This document is the review proposed for PR100, not a declaration of pilot or launch readiness.

## Why this checkpoint exists

Long Shift began with a mechanic's need for connected shop and field work: customers, equipment, repair orders, costs, approvals and billing that follow the job. At this checkpoint the Shop has a connected, tested path from intake through payment, with multiple views of the same financial records. The next decision is what an external shop needs to use that path reliably.

The milestone number counts pull requests, including fixes, documentation and revisions. It is not a count of independent features or proof that every PR was merged. The history below uses retrieved PR titles and the master commit history; older PR descriptions can contain QA caveats that were resolved later.

## Four chapters, checked against the repository

| Range | What the record actually shows | Representative PRs |
| --- | --- | --- |
| 1–25 | Identity and membership, Mobile prototype, owner dashboard, Personal Fleet beta, Shop customer/unit persistence, profile/tax settings, inspection/media foundation and AP scanning. Core Shop work already appears here. | [1](https://github.com/Jveslky/Operations-studio-v1/pull/1), [4](https://github.com/Jveslky/Operations-studio-v1/pull/4), [7](https://github.com/Jveslky/Operations-studio-v1/pull/7), [17](https://github.com/Jveslky/Operations-studio-v1/pull/17), [20](https://github.com/Jveslky/Operations-studio-v1/pull/20), [24](https://github.com/Jveslky/Operations-studio-v1/pull/24) |
| 26–50 | Regional settings, documents/requests, behavior/themes, exports/recovery, granular permissions, readiness tracking, schedule persistence, RO fees and Supabase RO/invoice/dashboard truth. Permissions began well before PR51. | [27](https://github.com/Jveslky/Operations-studio-v1/pull/27), [31](https://github.com/Jveslky/Operations-studio-v1/pull/31), [32](https://github.com/Jveslky/Operations-studio-v1/pull/32), [39](https://github.com/Jveslky/Operations-studio-v1/pull/39), [44](https://github.com/Jveslky/Operations-studio-v1/pull/44), [45](https://github.com/Jveslky/Operations-studio-v1/pull/45) |
| 51–75 | Role-focused workspaces and QA repairs, navigation/account switching, invoice handoff, Long Shift rebrand, Commercial Fleet/Snow concepts, VIN review and proposed technician unit edits. This period includes both hardening and expansion. | [51](https://github.com/Jveslky/Operations-studio-v1/pull/51), [60](https://github.com/Jveslky/Operations-studio-v1/pull/60), [63](https://github.com/Jveslky/Operations-studio-v1/pull/63), [65](https://github.com/Jveslky/Operations-studio-v1/pull/65), [67](https://github.com/Jveslky/Operations-studio-v1/pull/67), [69](https://github.com/Jveslky/Operations-studio-v1/pull/69) |
| 76–100 | Capture/OCR and environment gates, foreman/assigned-tech boundaries, inline intake, recovery/security probes, private media cache protection, app icons, audited authorizations/supplements, customer desk, payments, billing/NET accounts, setup clarity and this checkpoint. Some work was first scoped to Test; a PR title alone does not establish Live rollout. | [77](https://github.com/Jveslky/Operations-studio-v1/pull/77), [78](https://github.com/Jveslky/Operations-studio-v1/pull/78), [79](https://github.com/Jveslky/Operations-studio-v1/pull/79), [86](https://github.com/Jveslky/Operations-studio-v1/pull/86), [89](https://github.com/Jveslky/Operations-studio-v1/pull/89), [94](https://github.com/Jveslky/Operations-studio-v1/pull/94), [98](https://github.com/Jveslky/Operations-studio-v1/pull/98) |

## Original vision versus current evidence

| Intent | Current position | Boundary still to respect |
| --- | --- | --- |
| Follow one job from customer to payment | Shop intake, vehicles, ROs, estimates, authorizations, supplements, invoices and recorded payments are connected. Jon completed guided persistence and role/isolation checks. | Recorded payment is bookkeeping; this build does not charge cards or perform processor refunds. |
| Give office and floor useful, controlled views | Owner/admin/writer workflows and assigned technician/foreman work have been implemented and tested in their applicable scopes. | Recheck role presets and assignment behavior in a newly provisioned pilot shop; do not infer every older Test-only migration is installed in Live. |
| Make customer history and money easy to find | Customer desk and NET Accounts link history and payment actions. Outstanding, overdue and paid figures use existing invoice/payment balances. | Credit limits are informational; statements, bulk payment allocation and automatic collection reminders are not delivered in the NET pass. |
| Preserve what the customer authorized | Immutable approval history, explicit replacement/amendment relationships, scoped amounts, supplement revisions and invoice snapshots. | Historical records without a recorded relationship remain visibly unclassified; newest must not silently replace earlier authorization. |
| Connect Shop, Mobile and fleets | Shop and PFleet have cloud foundations; Mobile has a connected local prototype; Commercial Fleet and Snow have separate concept workspaces. | A shared cross-module operational data layer, Mobile cloud persistence and production Commercial Fleet/Snow remain future work. |
| Give the owner useful progress visibility | Personal development dashboard and automatic repository source counter. Snapshot at PR98: 50,101 source lines across 244 source files, including database and test groups. | Line count measures physical source volume, not quality, readiness, or user value. |

## What the testing taught us

1. **Persistence is observable behavior.** Saving is only the first check. Close, reload, change session and reopen the record; compare the same values and audit history.
2. **Financial truth should have one source.** A customer directory, invoice, dashboard and NET workspace can present the same debt differently without maintaining separate balances. A completed RO can still have legitimate NET debt.
3. **Automation needs status boundaries.** Approval can advance pre-work ROs; payment can release finished work. Neither should regress a later-stage job. Reversing payment reopens money owed without silently reopening completed work.
4. **Historical settings are part of the record.** Customer defaults can change; issued terms, tax, PO and due dates must retain the agreement for that invoice.
5. **A hidden button is not an access boundary.** Direct URLs, RPCs, tenant scope and private Storage bytes require independent checks. The private-media cache investigation showed why a denied fresh request is insufficient if a reused SDK path still returns bytes.
6. **An accurate UI can still mislead.** Empty red aging buckets looked urgent. A suggested timezone looked configured. Compact sections, meaningful color and explicit saved state make the actual behavior easier to understand.
7. **Test environments and migrations need separate evidence.** Merging code does not install SQL. Test checks, Live installation checks and real workflow verification are distinct milestones.
8. **Keep deferred work deliberate.** Inventory needs coherent stock, reservations and closure behavior. It stays parked while the pilot path is evaluated.

## Verified checkpoint evidence

- PR94 payment QA: partial/split payments, refresh persistence, immutable history, reasoned reversals, duplicate-submit protection, safe pickup automation and A/R agreement. Test and Live SQL confirmed installed.
- PR95 billing QA: PO requirement, NET and hold behavior, tax/exemption, saved shop timezone, preserved issued invoice values, writer restrictions, private document persistence and cross-shop invoice denial. Live SQL confirmed true/true.
- PR98 NET QA: partial/full payment refresh, invoice count and remaining balance, writer direct payment access, cross-shop search/direct-link denial, and customer profile/vehicle/RO/invoice navigation. Live SQL confirmed true/true.
- Final PR98 customer screenshots show one remaining Sent invoice #1009 at $100 due; paid invoices #1010, #1011 and #1013 have zero due. Customer A/R and NET Accounts agree at $100.
- All 14 current SQL/UI regression suites passed again during PR99 preparation. Automated checks include aging boundaries and due-today handling, access denial, stale responses and financial history.
- These are guided human checks plus automated SQL/UI tests. A complete unattended signed-in browser suite has not been established.

## Remaining Shop pilot gates

| Gate | Status at this draft | Evidence needed to close |
| --- | --- | --- |
| PR99 setup clarity | Built; manual QA pending | Unsaved/saved/changed timezone, section links and separate tax save reviewed on Test. |
| Fresh-shop setup and first staff invitation | Code path reviewed; full fresh run pending | New isolated Test shop, role-specific invitation acceptance, correct membership and restricted access, then first synthetic RO/invoice. |
| Phone-width workflow | Complete page-set review pending | Recorded pass for intake, RO, approval/supplement, invoice/payment, customer and NET pages; repair any functional overflow. |
| Signed-in smoke coverage | Partial/manual evidence | Repeatable owner/writer/tech navigation and critical workflow checks, with browser timeouts documented. |
| Pilot provisioning and configuration | Pending | Verify the pilot database migration baseline, saved timezone/rates/tax, auth redirects and required role policies. |
| Recovery and operational support | Existing foundations; pilot rehearsal pending | Rehearse a scoped backup/recovery path in Test, document excluded data and identify where pilot issues are reported. |
| External shop trial | Pending | Named pilot participant, agreed bounded workflow, observed first run and feedback triage. |

Reminders, prebuilt/fixed-price jobs and remaining reports need a scope decision with Jon: required for this pilot, or deliberately later. Inventory remains deferred. Production payment processing is separate future work. None should be silently treated as finished because this checkpoint exists.

## Decisions for the milestone conversation

- What work must the first pilot shop be able to complete on day one?
- Which remaining gates must close before sending that invitation?
- Which known limitations will the pilot participant explicitly accept?
- What should we stop adding until that shop has used the current workflow?
- What evidence will mark a successful pilot and justify the next development phase?

## Review status

PR99 is open and awaiting setup QA/merge. PR100 should remain draft while Jon reviews this checkpoint and agrees the pilot scope. No new migrations, financial behavior, invitations or automatic reminders are introduced by this document.

## PR index

Retrieved repository PR titles 1–98, followed by the current setup and checkpoint proposals. This index records history; it is not a merge-status or QA-status checklist.

- [#1](https://github.com/Jveslky/Operations-studio-v1/pull/1) — Add complete Supabase login and shop access system
- [#2](https://github.com/Jveslky/Operations-studio-v1/pull/2) — Repair legacy shop owner roles
- [#3](https://github.com/Jveslky/Operations-studio-v1/pull/3) — Fix legacy invitation membership conflict
- [#4](https://github.com/Jveslky/Operations-studio-v1/pull/4) — Build connected Mobile Service operation
- [#5](https://github.com/Jveslky/Operations-studio-v1/pull/5) — Add owner development home
- [#6](https://github.com/Jveslky/Operations-studio-v1/pull/6) — Make Track Right landing page public
- [#7](https://github.com/Jveslky/Operations-studio-v1/pull/7) — Build Personal Fleet beta and complimentary invitations
- [#8](https://github.com/Jveslky/Operations-studio-v1/pull/8) — Fix incomplete Personal Fleet invitation state
- [#9](https://github.com/Jveslky/Operations-studio-v1/pull/9) — Complete Personal Fleet archive and unit cleanup
- [#10](https://github.com/Jveslky/Operations-studio-v1/pull/10) — Finish PFleet reporting and standardize account menus
- [#11](https://github.com/Jveslky/Operations-studio-v1/pull/11) — Add Personal Fleet technician management
- [#12](https://github.com/Jveslky/Operations-studio-v1/pull/12) — Fix PFleet technician selection on repair orders
- [#13](https://github.com/Jveslky/Operations-studio-v1/pull/13) — Fix Personal Fleet cached asset mismatch
- [#14](https://github.com/Jveslky/Operations-studio-v1/pull/14) — Fix Shop customer form and immediate directory refresh
- [#15](https://github.com/Jveslky/Operations-studio-v1/pull/15) — Fix Shop customer unit saving and immediate display
- [#16](https://github.com/Jveslky/Operations-studio-v1/pull/16) — Add Project Services hub to development dashboard
- [#17](https://github.com/Jveslky/Operations-studio-v1/pull/17) — Load New Repair Order customers and units from Supabase
- [#18](https://github.com/Jveslky/Operations-studio-v1/pull/18) — Add Shop Profile settings foundation
- [#19](https://github.com/Jveslky/Operations-studio-v1/pull/19) — Add customer tax and exemption settings
- [#20](https://github.com/Jveslky/Operations-studio-v1/pull/20) — Add private inspection photo and video foundation
- [#21](https://github.com/Jveslky/Operations-studio-v1/pull/21) — Add inspection templates and workflow rules
- [#22](https://github.com/Jveslky/Operations-studio-v1/pull/22) — Add inspection completion notifications
- [#23](https://github.com/Jveslky/Operations-studio-v1/pull/23) — Add custom inspection response sets
- [#24](https://github.com/Jveslky/Operations-studio-v1/pull/24) — Add reviewed AP invoice scanning workflow
- [#25](https://github.com/Jveslky/Operations-studio-v1/pull/25) — Fix password recovery callback session
- [#26](https://github.com/Jveslky/Operations-studio-v1/pull/26) — Add Personal Fleet regional settings
- [#27](https://github.com/Jveslky/Operations-studio-v1/pull/27) — Add private Shop team documents
- [#28](https://github.com/Jveslky/Operations-studio-v1/pull/28) — Add Shop team requests and calendar approvals
- [#29](https://github.com/Jveslky/Operations-studio-v1/pull/29) — Add operational Shop behavior settings
- [#30](https://github.com/Jveslky/Operations-studio-v1/pull/30) — Add Shop themes and personal dashboard layouts
- [#31](https://github.com/Jveslky/Operations-studio-v1/pull/31) — Add Shop data management exports and recovery
- [#32](https://github.com/Jveslky/Operations-studio-v1/pull/32) — Add granular Shop user permissions
- [#33](https://github.com/Jveslky/Operations-studio-v1/pull/33) — Make the Shop settings menu available everywhere
- [#34](https://github.com/Jveslky/Operations-studio-v1/pull/34) — Add deployment readiness tracker to development dashboard
- [#35](https://github.com/Jveslky/Operations-studio-v1/pull/35) — Add Commercial Fleet to deployment roadmap
- [#36](https://github.com/Jveslky/Operations-studio-v1/pull/36) — Add launch gates and Next Move guidance
- [#37](https://github.com/Jveslky/Operations-studio-v1/pull/37) — Add active upcoming agenda to Shop schedule
- [#38](https://github.com/Jveslky/Operations-studio-v1/pull/38) — Split Personal Fleet invitations into status columns
- [#39](https://github.com/Jveslky/Operations-studio-v1/pull/39) — Persist Shop schedule appointments in Supabase
- [#40](https://github.com/Jveslky/Operations-studio-v1/pull/40) — Clean up Shop repair order detail flow
- [#41](https://github.com/Jveslky/Operations-studio-v1/pull/41) — Add one-off Shop invoices
- [#42](https://github.com/Jveslky/Operations-studio-v1/pull/42) — Add itemized repair order fees
- [#43](https://github.com/Jveslky/Operations-studio-v1/pull/43) — Use placeholders for zero estimate values
- [#44](https://github.com/Jveslky/Operations-studio-v1/pull/44) — Move Shop repair orders to Supabase
- [#45](https://github.com/Jveslky/Operations-studio-v1/pull/45) — Move Shop invoices to Supabase
- [#46](https://github.com/Jveslky/Operations-studio-v1/pull/46) — Use authoritative Shop dashboard totals
- [#47](https://github.com/Jveslky/Operations-studio-v1/pull/47) — Add invitation-only Shop beta onboarding
- [#48](https://github.com/Jveslky/Operations-studio-v1/pull/48) — QA: harden customer directory cloud data
- [#49](https://github.com/Jveslky/Operations-studio-v1/pull/49) — QA: enforce repair-order detail permissions
- [#50](https://github.com/Jveslky/Operations-studio-v1/pull/50) — QA: fix Shop Settings website and zero inputs
- [#51](https://github.com/Jveslky/Operations-studio-v1/pull/51) — Add role-focused Shop workspaces and access
- [#52](https://github.com/Jveslky/Operations-studio-v1/pull/52) — Fix Shop appointments crossing midnight
- [#53](https://github.com/Jveslky/Operations-studio-v1/pull/53) — Fix repair-order technician dropdowns
- [#54](https://github.com/Jveslky/Operations-studio-v1/pull/54) — Polish invoice filters and form typography
- [#55](https://github.com/Jveslky/Operations-studio-v1/pull/55) — Polish repair order inspection controls
- [#56](https://github.com/Jveslky/Operations-studio-v1/pull/56) — Add PFleet phone home-screen shortcut branding
- [#57](https://github.com/Jveslky/Operations-studio-v1/pull/57) — Make Shop settings menu open focused sections
- [#58](https://github.com/Jveslky/Operations-studio-v1/pull/58) — Restore permissions sidebar and isolate legacy browser imports
- [#59](https://github.com/Jveslky/Operations-studio-v1/pull/59) — Fix customer RO shortcut, invoice due date, and vehicle summary refresh
- [#60](https://github.com/Jveslky/Operations-studio-v1/pull/60) — Route account switches to the signed-in workspace
- [#61](https://github.com/Jveslky/Operations-studio-v1/pull/61) — Clarify Shop finance totals and polish QA detail screens
- [#62](https://github.com/Jveslky/Operations-studio-v1/pull/62) — Keep Dashboard in technician top navigation
- [#63](https://github.com/Jveslky/Operations-studio-v1/pull/63) — Complete Shop backups and correct invoice and customer access
- [#64](https://github.com/Jveslky/Operations-studio-v1/pull/64) — Draft visitor landing page
- [#65](https://github.com/Jveslky/Operations-studio-v1/pull/65) — Draft Commercial Fleet metrics-first six-page skeleton
- [#66](https://github.com/Jveslky/Operations-studio-v1/pull/66) — Draft standalone Snow Desk module
- [#67](https://github.com/Jveslky/Operations-studio-v1/pull/67) — Rebrand workspaces to Long Shift
- [#68](https://github.com/Jveslky/Operations-studio-v1/pull/68) — Track Snow Desk and Commercial Fleet concepts on project dashboard
- [#69](https://github.com/Jveslky/Operations-studio-v1/pull/69) — Add review-first NHTSA VIN lookup to Shop Add Unit
- [#70](https://github.com/Jveslky/Operations-studio-v1/pull/70) — Snow Service Desk: fast intake and service ticket concept
- [#71](https://github.com/Jveslky/Operations-studio-v1/pull/71) — Snow: one run sheet, saved ticket quotes, isolated data design
- [#72](https://github.com/Jveslky/Operations-studio-v1/pull/72) — Snow backend foundation: isolated workspaces, events, quotes and RLS
- [#73](https://github.com/Jveslky/Operations-studio-v1/pull/73) — Add isolated Snow QA landing and sign-in
- [#74](https://github.com/Jveslky/Operations-studio-v1/pull/74) — Add Shop VIN details and manufacturer lookup menu
- [#75](https://github.com/Jveslky/Operations-studio-v1/pull/75) — Add assigned tech VIN and mileage edits; scope Shop time clock
- [#76](https://github.com/Jveslky/Operations-studio-v1/pull/76) — Add Shop mobile capture and Team Document OCR review
- [#77](https://github.com/Jveslky/Operations-studio-v1/pull/77) — Define dev/test/live release gates and add PR static checks
- [#78](https://github.com/Jveslky/Operations-studio-v1/pull/78) — Test: Foreman role and assigned-only technician repair orders
- [#79](https://github.com/Jveslky/Operations-studio-v1/pull/79) — Test: add customer and vehicle from New Repair Order
- [#80](https://github.com/Jveslky/Operations-studio-v1/pull/80) — Fix Shop Test repair-order creation read-policy failure
- [#81](https://github.com/Jveslky/Operations-studio-v1/pull/81) — Add Shop Test inspection and photo/video recovery
- [#82](https://github.com/Jveslky/Operations-studio-v1/pull/82) — Add signed-in Shop Test API and photo security checks
- [#83](https://github.com/Jveslky/Operations-studio-v1/pull/83) — Clarify Shop Test storage failures and automatically check expiry
- [#84](https://github.com/Jveslky/Operations-studio-v1/pull/84) — Diagnose SDK photo bytes and uncached authorization in Shop Test
- [#85](https://github.com/Jveslky/Operations-studio-v1/pull/85) — Prevent private-photo cache reuse across Shop Test accounts
- [#86](https://github.com/Jveslky/Operations-studio-v1/pull/86) — Prevent private media cache reuse across Live accounts
- [#87](https://github.com/Jveslky/Operations-studio-v1/pull/87) — Fix assignment revocation in Live QA without changing other shops
- [#88](https://github.com/Jveslky/Operations-studio-v1/pull/88) — Add Long Shift shortcut icons for all five modules
- [#89](https://github.com/Jveslky/Operations-studio-v1/pull/89) — Shop intake shortcuts, audited authorizations and supplemental estimates
- [#90](https://github.com/Jveslky/Operations-studio-v1/pull/90) — Remove starting zeros from supplemental estimate inputs
- [#91](https://github.com/Jveslky/Operations-studio-v1/pull/91) — Build customer desk with paginated search and invoice history
- [#92](https://github.com/Jveslky/Operations-studio-v1/pull/92) — Add rolling source line counter to owner dashboard
- [#93](https://github.com/Jveslky/Operations-studio-v1/pull/93) — Fix source counter waiting on remote refresh
- [#94](https://github.com/Jveslky/Operations-studio-v1/pull/94) — Shop: audited partial payments and safe pickup automation
- [#95](https://github.com/Jveslky/Operations-studio-v1/pull/95) — Shop: customer billing preferences, NET workflow and four-column RO board
- [#96](https://github.com/Jveslky/Operations-studio-v1/pull/96) — Update owner dashboard with verified Shop progress and remaining work
- [#97](https://github.com/Jveslky/Operations-studio-v1/pull/97) — Update dashboard after verified customer billing rollout
- [#98](https://github.com/Jveslky/Operations-studio-v1/pull/98) — Add dedicated NET Accounts balance and aging workspace
- [#99](https://github.com/Jveslky/Operations-studio-v1/pull/99) — Clarify Shop timezone, tax setup and pilot preparation (open).
- #100 — This milestone checkpoint (draft proposal).
