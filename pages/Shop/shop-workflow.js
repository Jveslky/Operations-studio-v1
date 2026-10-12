/* Shared dashboard scopes keep shortcut lists consistent with overview counts. */
window.shopWorkflow = {
    matchesOrder(order, scope) {
        if (order.archived === true) return false;
        if (scope === 'open') return !['Complete','Ready for Pickup','Ready for Payment','Awaiting Payment','Closed'].includes(order.status);
        if (scope === 'approval') return order.status === 'Waiting Approval';
        if (scope === 'pickup') return ['Ready for Pickup','Ready for Payment','Awaiting Payment'].includes(order.status);
        return true;
    },
    approvedStatus(status, approval) {
        return approval === 'Approved' && ['Open','Intake','Scheduled','Waiting Approval','Needs Info'].includes(status) ? 'In Progress' : status;
    }
};
