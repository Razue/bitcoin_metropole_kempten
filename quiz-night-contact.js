(() => {
    'use strict';

    const dialog = document.getElementById('quiz-night-contact-dialog');

    if (!dialog) return;

    const modalContent = Object.freeze({
        quiz: {
            kicker: '21 eSPORTS · QUIZ NIGHT #01',
            title: 'Zur Quiz Night #01 anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du bei Quiz Night #01 am Sa 24.10.2026 um 18:30 Uhr dabei bist. Gespielt wird einzeln. Startgeld 5 €, in Euro oder sats, alles geht in den Pot.',
            whatsappMessage: 'Hallo, ich möchte mich für die 21 eSports Quiz Night #01 anmelden.',
            emailSubject: 'Anmeldung Quiz Night #01'
        },
        quiz2: {
            kicker: '21 eSPORTS · QUIZ NIGHT #02',
            title: 'Zur Quiz Night #02 anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du bei Quiz Night #02 am Sa 12.12.2026 um 18:30 Uhr dabei bist. Gespielt wird einzeln. Startgeld 5 €, in Euro oder sats, der ganze Pot geht an die Gewinner. Du möchtest den Pot sponsern? Melde dich bei uns.',
            whatsappMessage: 'Hallo, ich möchte mich für die 21 eSports Quiz Night #02 am 12.12.2026 anmelden.',
            emailSubject: 'Anmeldung Quiz Night #02'
        },
        schach: {
            kicker: '21 SCHACH · SCHACHTURNIER NR. 1',
            title: 'Zum Schachturnier Nr. 1 anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du beim Schachturnier Nr. 1 am So 25.10.2026 ab 14:00 Uhr dabei bist. Startgeld 10 €, in Euro oder sats, alles geht in den Pot.',
            whatsappMessage: 'Hallo, ich möchte mich für das 21 Schach – Schachturnier Nr. 1 am 25.10.2026 anmelden.',
            emailSubject: 'Anmeldung Schachturnier Nr. 1'
        },
        schach2: {
            kicker: '21 SCHACH · SCHACHTURNIER NR. 2',
            title: 'Zum Schachturnier Nr. 2 anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du beim Schachturnier Nr. 2 am Sa 05.12.2026 ab 14:00 Uhr dabei bist. 5 Runden, niemand fliegt raus. Startgeld 5 €, in Euro oder sats, der ganze Pot geht an die Gewinner. Du möchtest den Pot sponsern? Melde dich bei uns.',
            whatsappMessage: 'Hallo, ich möchte mich für das 21 Schach – Schachturnier Nr. 2 am 05.12.2026 anmelden.',
            emailSubject: 'Anmeldung Schachturnier Nr. 2'
        },
        vortrag: {
            kicker: 'VORTRAG · FR 30.10.2026 · 19:00',
            title: 'Zum Vortrag anmelden',
            intro: 'Schreib uns kurz deinen Namen und dass du beim Vortrag „Copyright-Sicherung & Ewige ID auf Bitcoin“ mit Gabriele Peters am Fr 30.10.2026 um 19:00 Uhr dabei bist.',
            whatsappMessage: 'Hallo, ich möchte mich für den Vortrag „Copyright-Sicherung & Ewige ID auf Bitcoin“ mit Gabriele Peters am 30.10.2026 anmelden.',
            emailSubject: 'Anmeldung Vortrag 30.10.2026'
        },
        fc: {
            kicker: '',
            title: 'Zur 21 eSports FC – Season 2 anmelden',
            intro: 'Schreib uns kurz deinen Namen/Nickname und dass du bei der 21 eSports FC – Season 2 dabei sein möchtest.',
            whatsappMessage: 'Hallo, ich möchte mich für die 21 eSports FC – Season 2 anmelden.',
            emailSubject: 'Anmeldung 21 eSports FC – Season 2'
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