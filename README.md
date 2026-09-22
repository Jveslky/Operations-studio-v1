# Operations Platform

*** CURRENT VERSION ONLY ACCESSIBLE AS PERSONAL FLEET MANAGEMENT. YARD EQUIPMENT, PERSONAL CARS AND TRUCKS ECT...
WILL UPDATE AS LATER VERSIONS GO LIVE. EXPECTED SHOP MANAGEMENT, COMMERCIAL FLEET MANAGEMENT, MOBILE MECHANIC, PARTS, 
COST ANALYSIS, PREDICTION LOGIC, MILEAGE/AGE BASED SUGGESTED SERVICE, MODULES TO COME. ***

## Overview

A modular service operations platform designed for:

* Fleet management
* Mobile equipment service
* Third-party repair shops

The platform focuses on:

* Asset tracking
* Repair order workflow
* Service history
* Operational analytics
* Modular business workflows

---

## Core Philosophy

One shared operational platform with modular workflow emphasis.

The goal is to create a recognizable and consistent operating environment across:

* Fleet operations
* Mobile service operations
* Shop service environments

---

## Current Modules

* Fleet
* Repair Orders
* Customers
* Alerts
* Service Tracking

---

## Planned Modules

* Estimates
* Dispatching
* Analytics
* Inventory
* Permissions / Roles
* Telematics Integrations

---

## Folder Structure

/css

* Shared styling files

/js

* Modular application logic

/pages

* Feature-specific pages

/components

* Reusable HTML components

/assets

* Images/icons/logos

---
## Development Goals

1. Maintain modular architecture
2. Avoid feature bloat
3. Keep workflows intuitive
4. Prioritize operational usability
5. Build for real-world service environments

---

## Current Stage

Prototype platform architecture and workflow validation.

---

## Authentication setup

Track Right uses Supabase Auth with shop-scoped membership and roles.

1. Run `supabase/auth-and-membership.sql` in the Supabase SQL editor.
2. In Supabase Authentication URL Configuration, set the production Site URL.
3. Add the exact production URLs for `login.html`, `reset-password.html`, and
   `accept-invite.html` to the allowed redirect URLs. For GitHub Pages, the
   password-recovery redirect is
   `https://jveslky.github.io/Operations-studio-v1/reset-password.html`.
4. Keep the publishable/anon key in `js/supabase-client.js`. Never put a
   service-role key or a user password in browser code.

The first signup creates a shop owner. Owners and admins can open **Users** in
the header, create an invitation link, and assign an employee role. All app
pages require a valid session and an active `shop_members` record.

For private employee licenses, certifications, insurance, and employment
records, run `supabase/team-documents.sql`. Team-document files use a private
bucket; owners and admins manage them, and employees can read only records
explicitly shared with their own account.

For PTO, medical absence, and general team requests, run
`supabase/shop-requests.sql`. Members can see their own submissions; owners,
admins, and service writers can review the shop queue. Approvals can create a
shop-scoped calendar entry with an office reminder in the same database
transaction.

## Personal Fleet beta setup

1. Run `supabase/personal-fleet-beta.sql` after the shop authentication migration.
2. Run `supabase/personal-fleet-regional-settings.sql` to add account-level
   region, currency, date-format, and measurement preferences.
3. Add the production `personal-fleet-invite.html` URL to Supabase Auth's allowed redirect URLs.
4. Open **Development Home → Fleet beta invites** to create an email-specific,
   single-use complimentary invitation.
5. Test acceptance in a private browser window before sending the link.

The migration creates separate Personal Fleet accounts, memberships, feature
entitlements, a 20-unit beta limit, account-scoped unit and repair-order data,
and row-level security. If the database has exactly one verified shop creator/
owner, that user is promoted to `platform_owner` during the first migration.
