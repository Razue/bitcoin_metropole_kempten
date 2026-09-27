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
    const confirmedCount = document.getElementById('confirmed-count');
    const availableCount = document.getElementById('available-count');
    const confirmedPlayerList = document.getElementById('confirmed-player-list');
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

    const renderPublicState = (state) => {
        if (!state || !state.tournament || !Array.isArray(state.participants)) return;
        if (confirmedCount) {
            confirmedCount.textContent = `${state.confirmedParticipantCount} / ${state.tournament.capacity} angemeldet`;
        }
        if (availableCount) {
            const places = state.availableParticipantPlaces;
            availableCount.textContent = `${places} ${places === 1 ? 'Platz' : 'Plätze'} frei`;
        }
        if (confirmedPlayerList) {
            confirmedPlayerList.replaceChildren(...state.participants.map((participant) => {
                const item = document.createElement('li');
                item.textContent = participant.nickname;
                return item;
            }));
        }
    };

    const refreshPublicState = async () => {
        if (!apiBase) return;
        const response = await fetch(`${apiBase}/api/v1/tournament/public`);
        if (!response.ok) throw new Error('public_state_unavailable');
        renderPublicState(await response.json());
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
            setEmailStatus('Anmeldung wird gesichert …');
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
                    setEmailStatus('Du bist dabei! Dein Platz beim 21 eSports Pokal – FC Season 1 ist gesichert.');
                    try {
                        await refreshPublicState();
                    } catch (_) {
                        // The registration remains confirmed even if the optional display refresh is temporarily unavailable.
                    }
                    return;
                }
                const message = {
                    invalid_nickname: 'Der Nickname ist ungültig.',
                    invalid_email: 'Die E-Mail-Adresse ist ungültig.',
                    nickname_registered: 'Dieser Nickname ist bereits registriert.',
                    email_registered: 'Diese E-Mail-Adresse ist bereits registriert.',
                    capacity_reached: 'Alle 32 Plätze sind bereits vergeben.',
                    registration_closed: 'Die Anmeldung ist geschlossen.',
                    rate_limited: 'Zu viele Anfragen. Bitte versuche es später erneut.'
                }[data.error] || 'Die Anmeldung konnte nicht gesichert werden. Bitte versuche es später erneut.';
                setEmailStatus(message);
            } catch (_) {
                setEmailStatus('Verbindung fehlgeschlagen. Bitte versuche es später erneut.');
            } finally {
                emailSubmit.disabled = false;
            }
        });
    }
})();
