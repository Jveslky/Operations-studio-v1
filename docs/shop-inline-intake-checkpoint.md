# Inline repair-order intake — Test draft

Add customer and vehicle/unit without leaving New Repair Order. Name/description required; contact and vehicle identifiers optional. Customer and vehicle required before saving the repair order. Quick saves use current-shop Supabase tables and existing customer-write policies, with no browser cache writes or new migrations.

Local checks: intake selection, scoped payloads, role denial, failed-save input retention, missing customer prerequisite; existing floor interface and PostgreSQL role suites pass. Real signed-in browser and mobile layout verification remain pending.

Tomorrow: finish Foreman assignment/removal vs Tech refresh checks; restore the Writer test account to Service Writer before intake testing. Owner/Writer: type complaint, choose priority and technician, add customer, add vehicle, create RO, refresh and verify all fields. Test an existing customer with no vehicles; cancel quick forms; switch customer while a vehicle panel is open; check optional email validation and failed network response. A failed save confirmation may follow a completed write: check the list before retrying to avoid duplicates. Verify Tech/Foreman cannot create customers or repair orders and Test B cannot see Test A records.

Draft targets shop-test only. No Live merge or database records changed by this implementation.
