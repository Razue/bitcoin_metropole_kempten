(() => {
    'use strict';

    const dialog = document.getElementById('quiz-night-contact-dialog');
    const closeButton = dialog?.querySelector('[data-quiz-night-contact-close]');

    if (!dialog) return;

    const closeDialog = () => {
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    };

    const openDialog = () => {
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    };

    document.addEventListener('click', (event) => {
        const openButton = event.target.closest('[data-quiz-night-contact-open]');
        if (openButton) openDialog();
    });

    closeButton?.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog();
    });
})();