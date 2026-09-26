(() => {
    'use strict';

    const playerSlots = document.getElementById('player-slots');
    const waitlistSlots = document.getElementById('waitlist-slots');
    const previewForm = document.getElementById('registration-preview');
    const contactField = document.getElementById('contact');
    const contactLabel = document.getElementById('contact-label');
    const contactHint = document.getElementById('contact-hint');
    const previewStatus = document.getElementById('preview-status');

    // Presentation only: no fetch, storage, analytics or data submission in Phase 2.
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

    document.querySelectorAll('input[name="contact-method"]').forEach((choice) => {
        choice.addEventListener('change', () => {
            const isNostr = choice.value === 'nostr' && choice.checked;
            contactLabel.textContent = isNostr ? 'Nostr-Adresse' : 'E-Mail-Adresse';
            contactField.type = isNostr ? 'text' : 'email';
            contactField.placeholder = isNostr ? 'npub… oder name@domain.tld' : 'name@beispiel.de';
            contactHint.textContent = isNostr
                ? 'Nur öffentliche Nostr-Adresse. Niemals nsec oder Private Key eingeben.'
                : 'Kontakt nur für organisatorische Informationen.';
        });
    });

    if (previewForm) {
        previewForm.addEventListener('submit', (event) => {
            event.preventDefault();
            previewStatus.textContent = 'Vorschau aktiv: In Phase 2 werden keine Daten übertragen oder gespeichert.';
        });
    }
})();
