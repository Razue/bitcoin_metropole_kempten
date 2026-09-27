(() => {
    'use strict';

    // Presentation only: no fetch, storage, analytics or data submission in Phase 2.2.
    const drawnParticipants = Object.freeze({
        4: 'BitFit',
        7: 'FireOverFiat',
        25: 'MischaTurm'
    });
    const tournamentSlots = document.getElementById('tournament-slots');
    const emailForm = document.getElementById('email-registration-preview');
    const emailStatus = document.getElementById('email-preview-status');
    const nostrButton = document.getElementById('nostr-registration-preview');
    const nostrStatus = document.getElementById('nostr-preview-status');

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

    if (emailForm && emailStatus) {
        emailForm.addEventListener('submit', (event) => {
            event.preventDefault();
            emailStatus.textContent = 'Vorschau: Die Anmeldung ist noch nicht aktiviert. Es wurden keine Daten übertragen oder gespeichert.';
        });
    }

    if (nostrButton && nostrStatus) {
        nostrButton.addEventListener('click', () => {
            nostrStatus.textContent = 'Signer-/Bunker-Login folgt. Kein npub, nsec oder Private Key wird hier abgefragt.';
        });
    }
})();
