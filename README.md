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
3. Add the production URLs for `login.html`, `reset-password.html`, and
   `accept-invite.html` to the allowed redirect URLs.
4. Keep the publishable/anon key in `js/supabase-client.js`. Never put a
   service-role key or a user password in browser code.

The first signup creates a shop owner. Owners and admins can open **Users** in
the header, create an invitation link, and assign an employee role. All app
pages require a valid session and an active `shop_members` record.
