(function () {
    "use strict";
    const STORAGE_KEY = "trackRightMobileDataV2";

    function localDate(offsetDays) {
        const date = new Date();
        date.setDate(date.getDate() + offsetDays);
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    }

    // Fictional demonstration records only. Production records will come from
    // the authenticated shop data source when that migration is enabled.
    const seedData = {
        customers: [
            { id: "customer-1", name: "Demo Fleet", contact: "Fleet Contact", phone: "", email: "", address: "Demo Fleet Yard", notes: "Demonstration record.", assets: [
                { name: "Truck 12", year: "2021", make: "Freightliner", model: "Cascadia", vin: "", serial: "", mileage: "428615", hours: "", engine: "Detroit DD15", serviceStatus: "due-soon", serviceNote: "PM due in 18 days" },
                { name: "Trailer 8", year: "2018", make: "Great Dane", model: "", vin: "", serial: "", mileage: "", hours: "", engine: "", serviceStatus: "current", serviceNote: "Annual inspection current" }
            ]},
            { id: "customer-2", name: "Demo Earthworks", contact: "Site Contact", phone: "", email: "", address: "Demo Jobsite", notes: "Demonstration record.", assets: [
                { name: "Excavator 3", year: "2019", make: "CAT", model: "320", vin: "", serial: "", mileage: "", hours: "4211.6", engine: "", serviceStatus: "overdue", serviceNote: "500-hour service overdue" }
            ]},
            { id: "customer-3", name: "Demo Customer", contact: "Customer Contact", phone: "", email: "", address: "Customer Location", notes: "Demonstration record.", assets: [
                { name: "Equinox", year: "2020", make: "Chevrolet", model: "Equinox", vin: "", serial: "", mileage: "86214", hours: "", engine: "", serviceStatus: "current", serviceNote: "No service due" }
            ]}
        ],
        appointments: [
            { id: "appointment-1", date: localDate(0), time: "08:00", customer: "Demo Fleet", asset: "Truck 12 - Freightliner Cascadia", location: "Demo Fleet Yard", technician: "Jon", reason: "Air leak / brake inspection", notes: "", status: "Scheduled" },
            { id: "appointment-2", date: localDate(0), time: "13:00", customer: "Demo Earthworks", asset: "Excavator 3 - CAT 320", location: "Demo Jobsite", technician: "Jon", reason: "Hydraulic leak follow-up", notes: "Hose may be required.", status: "Scheduled" },
            { id: "appointment-3", date: localDate(1), time: "", customer: "Demo Customer", asset: "2020 Chevrolet Equinox", location: "Customer Location", technician: "Jon", reason: "No-start diagnosis", notes: "", status: "Scheduled" }
        ],
        jobs: [
            { id: "job-1001", customer: "Demo Fleet", asset: "Truck 12 - Freightliner Cascadia", status: "Working", technician: "Jon", location: "Demo Fleet Yard", complaint: "Air leak near rear brake chamber.", customerNotes: "", technicianNotes: "", serviceCall: 125, miles: 18, travelHours: 0.5, labor: [{ description: "Diagnose air leak", quantity: 1, rate: 150 }], parts: [], misc: [], updatedAt: new Date().toISOString() },
            { id: "job-1002", customer: "Demo Earthworks", asset: "Excavator 3 - CAT 320", status: "Waiting on Parts", technician: "Jon", location: "Demo Jobsite", complaint: "Hydraulic leak at boom cylinder.", customerNotes: "", technicianNotes: "Leak confirmed at hose fitting.", serviceCall: 150, miles: 31, travelHours: 1, labor: [{ description: "Hydraulic leak diagnosis", quantity: 1.5, rate: 150 }], parts: [], misc: [], updatedAt: new Date().toISOString() },
            { id: "job-1003", customer: "Demo Customer", asset: "2020 Chevrolet Equinox", status: "Ready to Invoice", technician: "Jon", location: "Customer Location", complaint: "Vehicle will not start.", customerNotes: "", technicianNotes: "Battery failed load test. Battery replaced and starting system retested.", serviceCall: 95, miles: 8, travelHours: 0.25, labor: [{ description: "No-start diagnosis", quantity: 1, rate: 125 }], parts: [{ description: "Battery", quantity: 1, rate: 189.95 }], misc: [], updatedAt: new Date().toISOString() }
        ],
        invoices: [
            { id: "invoice-1001", number: "INV-1001", jobId: "job-1003", customer: "Demo Customer", contact: "Customer Contact", address: "Customer Location", asset: "2020 Chevrolet Equinox", status: "Draft", invoiceDate: localDate(0), dueDate: localDate(0), notes: "Thank you for your business.", taxRate: 0, paidAmount: 0, lines: [{ description: "Service Call", quantity: 1, rate: 95 }, { description: "No-start diagnosis", quantity: 1, rate: 125 }, { description: "Battery", quantity: 1, rate: 189.95 }] },
            { id: "invoice-1002", number: "INV-1002", jobId: "job-1001", customer: "Demo Fleet", contact: "Fleet Contact", address: "Demo Fleet Yard", asset: "Truck 12 - Freightliner Cascadia", status: "Sent", invoiceDate: localDate(-5), dueDate: localDate(9), notes: "", taxRate: 0, paidAmount: 0, lines: [{ description: "Electrical diagnosis", quantity: 2.5, rate: 150 }, { description: "Harness repair", quantity: 1, rate: 225 }] }
        ],
        expenses: [
            { id: "expense-1", date: localDate(0), vendor: "Demo Parts Supplier", amount: 187.42, category: "Parts", customer: "Demo Fleet", job: "job-1001", notes: "Brake fittings and air line", receipt: true }
        ]
    };

    function normalize(data) {
        const normalized = {};
        ["customers", "appointments", "jobs", "invoices", "expenses"].forEach(function (key) {
            normalized[key] = Array.isArray(data && data[key]) ? data[key] : [];
        });
        return normalized;
    }

    function save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(data)));
        window.dispatchEvent(new CustomEvent("trackright:mobile-data"));
    }

    function load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return normalize(JSON.parse(stored));
        } catch (error) {
            console.error("Could not load Mobile Service data", error);
        }
        const initial = structuredClone(seedData);
        save(initial);
        return initial;
    }

    function id(prefix) {
        return prefix + "-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
    }

    function money(value) {
        return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
    }

    function invoiceTotal(invoice) {
        const subtotal = (invoice.lines || []).reduce(function (sum, line) { return sum + Number(line.quantity || 0) * Number(line.rate || 0); }, 0);
        return subtotal + subtotal * Number(invoice.taxRate || 0);
    }

    function jobTotal(job) {
        const lineTotal = ["labor", "parts", "misc"].reduce(function (sum, key) {
            return sum + (job[key] || []).reduce(function (lineSum, line) { return lineSum + Number(line.quantity || 0) * Number(line.rate || 0); }, 0);
        }, 0);
        return lineTotal + Number(job.serviceCall || 0);
    }

    window.TrackRightMobile = { load, save, id, money, invoiceTotal, jobTotal, localDate, storageKey: STORAGE_KEY };
}());
