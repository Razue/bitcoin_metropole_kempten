(() => {
    'use strict';

    const dialog = document.getElementById('quiz-night-contact-dialog');

    if (!dialog) return;

    const modalContent = Object.freeze({
        quiz: {
            kicker: '21 eSPORTS · QUIZ NIGHT #01',
            title: 'Zur Quiz Night #01 anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du bei Quiz Night #01 dabei bist.',
            whatsappMessage: 'Hallo, ich möchte mich für die 21 eSports Quiz Night #01 anmelden.',
            emailSubject: 'Anmeldung Quiz Night #01'
        },
        fc: {
            kicker: '',
            title: 'Zum 21 eSports Pokal – FC anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du beim FC-Turnier am 18. Oktober dabei sein möchtest.',
            whatsappMessage: 'Hallo, ich möchte mich für den 21 eSports Pokal – FC am 18. Oktober anmelden.',
            emailSubject: 'Anmeldung 21 eSports Pokal – FC'
        }
    });
    const kicker = dialog.querySelector('[data-contact-modal-kicker]');
    const title = dialog.querySelector('[data-contact-modal-title]');
    const intro = dialog.querySelector('[data-contact-modal-intro]');
    const whatsappLink = dialog.querySelector('[data-contact-modal-whatsapp]');
    const emailLink = dialog.querySelector('[data-contact-modal-email]');

    const setModalContent = (eventType) => {
        const content = modalContent[eventType];
        if (!content) return false;

        dialog.dataset.contactModalEvent = eventType;
        if (kicker) {
            kicker.textContent = content.kicker;
            kicker.hidden = !content.kicker;
        }
        if (title) title.textContent = content.title;
        if (intro) intro.textContent = content.intro;
        if (whatsappLink) {
            whatsappLink.href = `https://wa.me/4917660901497?text=${encodeURIComponent(content.whatsappMessage)}`;
        }
        if (emailLink) {
            emailLink.href = `mailto:bitcoinmetropole@proton.me?subject=${encodeURIComponent(content.emailSubject)}`;
        }

        return true;
    };

    const closeDialog = () => {
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    };

    const openDialog = (eventType) => {
        if (!setModalContent(eventType) || dialog.open) return;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    };

    document.addEventListener('click', (event) => {
        if (event.target.closest('[data-quiz-night-contact-close]')) {
            closeDialog();
            return;
        }

        const openButton = event.target.closest('[data-contact-modal-event]');
        if (openButton) openDialog(openButton.dataset.contactModalEvent);
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog();
    });
})();