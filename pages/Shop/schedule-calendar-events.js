(function () {
    "use strict";
    const client = window.trackRightSupabase;

    window.trackRightAuthReady.then(async function (context) {
        const [eventsResult, membersResult] = await Promise.all([
            client.from("shop_calendar_events").select("*").eq("shop_id", context.shopId).order("starts_on"),
            client.rpc("list_shop_request_members")
        ]);
        if (eventsResult.error) {
            console.error("Approved team requests could not load on the calendar:", eventsResult.error);
            return;
        }
        const members = new Map((membersResult.data || []).map((item) => [String(item.user_id), item]));
        calendarEvents.splice(0, calendarEvents.length, ...(eventsResult.data || []).map(function (event) {
            const subject = members.get(String(event.subject_user_id));
            return {
                id: event.id,
                customer: event.title,
                unit: subject?.display_name || subject?.email || "Team member",
                date: event.starts_on,
                endDate: event.ends_on,
                startTime: "00:00",
                endTime: "23:59",
                technician: subject?.display_name || subject?.email || "Team member",
                type: "Team request",
                status: "Approved",
                location: "Shop calendar",
                description: event.notes || "Approved team request",
                allDay: true,
                readOnly: true
            };
        }));
        renderSchedule();
        updateCounts();
    }).catch(function (error) {
        console.error("Calendar request events could not initialize:", error);
    });
})();
