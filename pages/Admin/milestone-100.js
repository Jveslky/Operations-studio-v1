(function () {
    'use strict';
    const status = document.getElementById('milestone-access');
    Promise.resolve(window.trackRightAuthReady).then(context => {
        if (!['platform_owner', 'platform_admin'].includes(context?.platformRole)) {
            status.textContent = 'This review is reserved for the Long Shift project owner. Open an operational workspace from your account menu.';
            return;
        }
        document.getElementById('milestone-review').hidden = false;
        status.hidden = true;
    }).catch(() => {
        status.textContent = 'Could not verify owner access. Reload to try again.';
    });
})();
