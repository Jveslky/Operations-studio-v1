(function () {
    "use strict";

    function hide(selector) {
        document.querySelectorAll(selector).forEach(function (element) {
            element.hidden = true;
        });
    }

    async function applyPermissions() {
        if (!window.trackRightAuthReady) return;
        const context = await window.trackRightAuthReady;
        if (!context || !window.trackRightCan) return;

        if (!window.trackRightCan("customers.write")) {
            hide("#newCustomerButton, #newAssetButton, #saveCustomerButton, #saveAssetButton, #addCustomerFromJobButton, .quick-actions a[href*='MobileCustomers']");
        }
        if (!window.trackRightCan("repair_orders.write")) {
            hide("#newJobButton, .quick-actions a[href*='MobileJobs']");
        }
        if (!window.trackRightCan("invoices.write")) {
            hide("#newInvoiceButton, #addInvoiceLineButton, #saveInvoiceButton, #sendInvoiceButton, #recordPaymentButton, #applyPaymentButton, .quick-actions a[href*='MobileInvoices']");
        }
        if (!window.trackRightCan("expenses.write")) {
            hide("#scanReceiptButton, #manualExpenseButton, #saveExpenseButton");
        }
        if (!["owner", "admin", "service_writer"].includes(context.role)) {
            hide("#openAppointmentFormButton, #saveAppointmentButton, .quick-actions a[href*='Appointments']");
        }
    }

    window.addEventListener("load", applyPermissions);
}());
