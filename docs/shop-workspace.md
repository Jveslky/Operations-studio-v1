# Shop workspace header and utilities

Office navigation groups existing permitted page links into Workflow, Inventory and Finance. Group selection only changes visible links; it does not navigate away from unsaved work. Detail pages highlight their parent board. Technicians retain their simple Dashboard/Repair Orders row and cyan page indicator. Existing authentication, route guards and database permissions remain authoritative.

The floating utility bar contains real personal alerts and the existing office request notifications. Parts/labor providers are not connected and are not shown as working tools. Existing alert preferences and owner rules remain available. New visible, unread, unresolved alert IDs observed on a later poll show a 4.5-second ticker; the initial load is quiet. Polling remains 60 seconds, not realtime. Counts/read state are server-confirmed.

Phone utility bars default off, with Alerts and Utilities controls in the header. The phone toggle is saved per user on the device. Existing office requests stay in the bar; enable it on phone to access that legacy feed. This presentation adds no SQL migration.

Validation: workspace navigation VM checks cover groups, detail markers, retained current-page state, technician navigation and permission filtering. Existing alert UI, invoice alert-link and team document tests pass. Browser/manual Test checks remain pending for the integrated screens, particularly page-specific header styles, keyboard behavior, phone toggling and account transitions. The approved standalone preview is separate from this integrated branch.
