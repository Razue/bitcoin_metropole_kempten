(() => {
    'use strict';

    const openButton = document.getElementById('quiz-night-contact-open');
    const dialog = document.getElementById('quiz-night-contact-dialog');
    const closeButton = dialog?.querySelector('[data-quiz-night-contact-close]');

    if (!openButton || !dialog) return;

    const closeDialog = () => {
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    };

    openButton.addEventListener('click', () => {
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    });

    closeButton?.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog();
    });
})();