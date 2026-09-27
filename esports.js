(() => {
    'use strict';

    // Presentation only: no fetch, storage, analytics or data submission in Phase 2.2.
    const tournamentSlots = document.getElementById('tournament-slots');
    const emailForm = document.getElementById('email-registration-preview');
    const emailStatus = document.getElementById('email-preview-status');
    const nostrButton = document.getElementById('nostr-registration-preview');
    const nostrStatus = document.getElementById('nostr-preview-status');

    if (tournamentSlots) {
        for (let index = 1; index <= 32; index += 1) {
            const slot = document.createElement('div');
            slot.className = 'player-slot';
            slot.innerHTML = `<span>POSITION ${String(index).padStart(2, '0')}</span><strong>WIRD AUSGELOST</strong>`;
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
