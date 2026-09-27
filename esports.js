(() => {
    'use strict';

    const drawnParticipants = Object.freeze({
        4: 'BitFit',
        7: 'FireOverFiat',
        25: 'MischaTurm'
    });
    const tournamentSlots = document.getElementById('tournament-slots');
    const emailForm = document.getElementById('email-registration-preview');
    const emailStatus = document.getElementById('email-preview-status');
    const nicknameInput = document.getElementById('esports-nickname');
    const emailInput = document.getElementById('esports-email');
    const emailSubmit = emailForm ? emailForm.querySelector('button[type="submit"]') : null;
    const nostrButton = document.getElementById('nostr-registration-preview');
    const nostrStatus = document.getElementById('nostr-preview-status');
    const apiBase = (document.documentElement.dataset.esportsApiBase || '').trim().replace(/\/$/, '');

    const populateBracket = (fields) => {
        fields.forEach((field, index) => {
            const participant = drawnParticipants[index + 1];
            if (participant) field.textContent = participant;
        });
    };

    populateBracket([
        ...document.querySelectorAll('.bracket-half--left .round-one span'),
        ...document.querySelectorAll('.bracket-half--right .round-one span')
    ]);
    populateBracket([
        ...document.querySelectorAll('.mobile-half--top .mobile-round--r1 span'),
        ...document.querySelectorAll('.mobile-half--bottom .mobile-round--r1 span')
    ]);

    if (tournamentSlots) {
        for (let index = 1; index <= 32; index += 1) {
            const slot = document.createElement('div');
            const participant = drawnParticipants[index];
            slot.className = participant ? 'player-slot player-slot--drawn' : 'player-slot';
            slot.innerHTML = `<span>POSITION ${String(index).padStart(2, '0')}</span><strong>${participant || 'WIRD AUSGELOST'}</strong>`;
            tournamentSlots.appendChild(slot);
        }
    }

    const setEmailStatus = (message) => {
        if (emailStatus) emailStatus.textContent = message;
    };

    if (emailForm && emailStatus && nicknameInput && emailInput && emailSubmit) {
        emailForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!nicknameInput.value.trim() || !emailInput.value.trim() || !emailInput.validity.valid) {
                setEmailStatus('Bitte gib einen Nickname und eine gültige E-Mail-Adresse ein.');
                return;
            }
            if (!apiBase) {
                setEmailStatus('Die Online-Anmeldung wird freigeschaltet, sobald der eSports-Service bereitsteht.');
                return;
            }

            emailSubmit.disabled = true;
            setEmailStatus('Anmeldung wird vorbereitet …');
            try {
                const response = await fetch(`${apiBase}/api/v1/registrations/email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nickname: nicknameInput.value.trim(),
                        email: emailInput.value.trim()
                    })
                });
                const data = await response.json();
                if (response.ok) {
                    emailForm.reset();
                    setEmailStatus('Prüfe dein E-Mail-Postfach und bestätige den Link innerhalb von 30 Minuten.');
                    return;
                }
                const message = {
                    invalid_nickname: 'Der Nickname ist ungültig.',
                    invalid_email: 'Die E-Mail-Adresse ist ungültig.',
                    nickname_registered: 'Dieser Nickname ist bereits registriert.',
                    email_registered: 'Diese E-Mail-Adresse ist bereits registriert.',
                    registration_closed: 'Die Anmeldung ist geschlossen.',
                    rate_limited: 'Zu viele Anfragen. Bitte versuche es später erneut.'
                }[data.error] || 'Die Anmeldung konnte nicht vorbereitet werden. Bitte versuche es später erneut.';
                setEmailStatus(message);
            } catch (_) {
                setEmailStatus('Verbindung fehlgeschlagen. Bitte versuche es später erneut.');
            } finally {
                emailSubmit.disabled = false;
            }
        });
    }

    if (nostrButton && nostrStatus) {
        nostrButton.addEventListener('click', () => {
            nostrStatus.textContent = 'Signer-/Bunker-Login folgt. Kein npub, nsec oder Private Key wird hier abgefragt.';
        });
    }
})();
