# Long Shift Snow Desk concept

Standalone winter operations prototype. Open `index.html` to review the plow/salt estimator, route schedule, assignment and priority controls, and manual storm planning prompts.

All changes persist in this browser's localStorage under `snowDeskDraft.v1`; there is no account login, synchronization, live weather feed, push notification, billing, or Shop/PFleet integration. Do not use this page as a shared dispatch system yet. The National Weather Service link opens external official forecast information.

Use `index.html` for weather planning and estimates; `jobs.html` is the single place to create, schedule, and update stops. “Use estimate for new job” carries a snapshot of estimate inputs and projected visit revenue into a new ticket. The quoted price/terms and agreement status are saved with that ticket, but neither is a customer approval mechanism or an invoice. The proposed shared-data design and its isolation gates are in `../../docs/snow-data-foundation.md`.

Keep this module separate from Commercial Fleet. The rates in the estimator are examples, not recommendations.
