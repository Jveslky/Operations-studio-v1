# Commercial Fleet concept

An isolated, browser-local skeleton for fleet maintenance and metrics. Open `index.html` and add units and completed maintenance to see due PM, out-of-service counts, spend, downtime, and per-unit totals.

The module is separate from Personal Fleet, Shop, and Snow Desk. Records persist in localStorage under `trackRight.commercialFleet.concept.v1` only. The JSON export is a concept data copy, not a database backup. No authentication, team sync, storage policies, notifications, live telemetry, jobs, or tracking are connected yet. Do not use it for operational fleet records until backend tenancy and roles are implemented and tested.
