(() => {
    'use strict';

    // Presentation only: no fetch, storage, analytics or data submission in Phase 2.2.
    const playerSlots = document.getElementById('player-slots');
    const waitlistSlots = document.getElementById('waitlist-slots');

    if (playerSlots) {
        for (let index = 1; index <= 32; index += 1) {
            const slot = document.createElement('div');
            slot.className = 'player-slot';
            slot.innerHTML = `<span>${String(index).padStart(2, '0')}</span><strong>OPEN SLOT</strong>`;
            playerSlots.appendChild(slot);
        }
    }

    if (waitlistSlots) {
        for (let index = 1; index <= 4; index += 1) {
            const slot = document.createElement('span');
            slot.textContent = `WL-${String(index).padStart(2, '0')}`;
            waitlistSlots.appendChild(slot);
        }
    }
})();
