// ===== Bitcoin Metropole Kempten =====

document.addEventListener('DOMContentLoaded', function() {
    initMobileMenu();
    loadEventsFromCSV();
    initSmoothScroll();
    initNavbarScroll();
    initQuickNav();
    initMapConsent();
});

// ===== Mobile Menu =====
function initMobileMenu() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            });
        });
    }
}

// ===== Load Events from CSV =====
async function loadEventsFromCSV() {
    try {
        const response = await fetch('programm.csv');
        const csvText = await response.text();
        const eventsData = parseCSV(csvText);
        renderEvents(eventsData);
        initEventFilter(eventsData);
    } catch (error) {
        console.error('Fehler beim Laden der Events:', error);
    }
}

// Parse CSV
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => {
            row[header.trim()] = values[index] ? values[index].trim() : '';
        });
        data.push(row);
    }

    return data;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    return values;
}

// Render Events
function renderEvents(data, filter) {
    const container = document.getElementById('events-container');
    if (!container) return;

    const filtered = filter && filter !== 'all'
        ? data.filter(e => e.Typ === filter)
        : data;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="events-empty">Keine Events in dieser Kategorie.</div>';
        return;
    }

    const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

    let html = '';

    filtered.forEach(event => {
        const [year, monthIndex, dateDay] = event.Datum.split('-').map(Number);
        const date = new Date(year, monthIndex - 1, dateDay);
        const day = date.getDate();
        const month = months[date.getMonth()];
        const weekday = weekdays[date.getDay()];
        const timeDisplay = event.Zeit.toLowerCase() === 'ganztägig' ? 'ganztägig' : `${event.Zeit} Uhr`;
        const contactModalEvent = event.Link === 'quiz-night-contact'
            ? 'quiz'
            : event.Link === 'quiz-night-2-contact'
                ? 'quiz2'
            : event.Link === 'fc-contact'
                ? 'fc'
                : event.Link === 'schach-contact'
                    ? 'schach'
                    : event.Link === 'schach-2-contact'
                        ? 'schach2'
                    : event.Link === 'vortrag-contact'
                        ? 'vortrag'
                        : null;
        const isPokerNight = event.Link === 'club-members-only';
        const isHalloweenGhostNight = event.Link === 'halloween-ghost-night';
        const isBitcoinHerbst = event.Link === 'bitcoin-herbst-ticket';
        const isProofOfRace = event.Link === 'proof-of-race';
        const isQuizNightContact = contactModalEvent === 'quiz' || contactModalEvent === 'quiz2';
        const isSchachContact = contactModalEvent === 'schach' || contactModalEvent === 'schach2';
        const registrationLink = isPokerNight
            ? `<span class="event-registration-link event-registration-link--club"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3m-9 0h8a2 2 0 0 1 2 2v8H6v-8a2 2 0 0 1 2-2Zm4 4v3"/></svg>NUR FÜR CLUBMITGLIEDER</span>`
            : isBitcoinHerbst
            ? '<a href="#bitcoin-herbst" class="event-registration-link">TICKET SICHERN</a>'
            : contactModalEvent
            ? `<button type="button" class="event-registration-link" data-contact-modal-event="${contactModalEvent}" aria-haspopup="dialog">JETZT ANMELDEN</button>`
            : event.Link && !isHalloweenGhostNight && !isProofOfRace
                ? `<a href="${event.Link}" class="event-registration-link">JETZT ANMELDEN</a>`
                : '';
        const cardClass = (event.Link && !isHalloweenGhostNight && !isProofOfRace) ? ' event-card--with-cta' : '';
        const eventHighlightClass = isBitcoinHerbst
            ? ' event-card--bitcoin-herbst'
            : isPokerNight
                ? ' event-card--poker'
                : isHalloweenGhostNight
                    ? ' event-card--halloween'
                    : isProofOfRace
                        ? ' event-card--esports event-card--proof-of-race'
                        : event.Typ === 'eSports'
                            ? ' event-card--esports'
                            : '';
        const eventEmblem = isBitcoinHerbst
            ? '<img class="event-herbst-leaf" src="images/bitcoin-herbst-leaf-transparent.png" alt="" aria-hidden="true">'
            : isPokerNight
            ? `<span class="event-poker-cards" aria-hidden="true"><svg viewBox="0 0 96 96" focusable="false"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"><path d="M18 23h39a5 5 0 0 1 5 5v48a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5V28a5 5 0 0 1 5-5Z"/><path d="m37 15 38 17a5 5 0 0 1 3 6L57 84a5 5 0 0 1-6 3L14 70"/></g><text x="26" y="51" fill="currentColor" font-size="27" font-family="Space Grotesk, sans-serif" font-weight="700">A</text><path d="m50 44 7-8 7 8c0 6-4 10-7 14-3-4-7-8-7-14Z" fill="currentColor"/></svg></span>`
            : isHalloweenGhostNight
            ? `<span class="event-halloween-illustration" aria-hidden="true"><svg viewBox="0 0 96 96" focusable="false"><g fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M47 27c1-8 5-13 12-16"/><path d="M59 11c-1 6 2 10 8 11"/><path d="M48 27c-16 0-28 12-28 30 0 18 12 29 28 29s28-11 28-29c0-18-12-30-28-30Z"/><path d="M48 29c-7 8-8 37 0 55"/><path d="M48 29c7 8 8 37 0 55"/><path d="M29 40c8 5 30 5 38 0"/></g><path d="m32 55 10-6 1 11Zm31 0-10-6-1 11Zm-28 14c8 7 18 7 26 0l-4 11H39Z" fill="currentColor"/></svg></span>`
            : isProofOfRace
            ? '<span class="event-rally-tyre" aria-hidden="true"><svg viewBox="0 0 96 96" focusable="false"><circle cx="48" cy="48" r="35"/><circle cx="48" cy="48" r="22"/><circle cx="48" cy="48" r="7"/><path d="m48 13 7 12-7 8-7-8Zm25 10 1 14-11 4-5-11Zm10 25-12 7-8-7 7-8Zm-10 25-14 1-4-11 11-5Zm-25 10-7-12 7-8 7 8Zm-25-10-1-14 11-4 5 11Zm-10-25 12-7 8 7-7 8Zm10-25 14-1 4 11-11 5Z"/></svg></span>'
            : event.Typ === 'eSports'
            ? isSchachContact
                ? '<span class="event-trophy event-chess-king" aria-hidden="true"><img src="images/schach-koenig.svg" alt=""></span>'
                : isQuizNightContact
                ? '<span class="event-trophy" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><text x="32" y="49" text-anchor="middle" font-size="56" font-family="Space Grotesk, sans-serif" font-weight="700">?</text></svg></span>'
                : `<span class="event-trophy" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><path d="M18 7h28v12c0 11-6 19-14 22-8-3-14-11-14-22V7Zm-7 5h7v12c0 5-3 8-7 8-4 0-7-3-7-8v-5h7m42-7h7v7c0 5-3 8-7 8-4 0-7-3-7-8V12ZM27 42h10v7h9v7H18v-7h9v-7Z"/></svg></span>`
            : '';
        const livestreamBadge = isPokerNight
            ? '<span class="event-livestream-badge"><span aria-hidden="true"></span>LIVE / LIVESTREAM</span>'
            : '';
        const eventTypeBadge = (isQuizNightContact || isSchachContact)
            ? ''
            : `<span class="event-type-badge badge-${event.Typ}">${event.Typ}</span>`;

        html += `
            <div class="event-card${cardClass}${eventHighlightClass}" data-type="${event.Typ}">
                <div class="event-date">
                    <span class="event-day">${day}</span>
                    <span class="event-month">${month}</span>
                    <span class="event-weekday">${weekday}</span>
                </div>
                <div class="event-info">
                    <h3>${event.Titel}</h3>
                    ${eventEmblem}
                    <p>${event.Beschreibung}</p>
                </div>
                <div class="event-meta">
                    <span class="event-time">${timeDisplay}</span>
                    ${eventTypeBadge}
                    ${livestreamBadge}
                    ${registrationLink}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Animate in
    container.querySelectorAll('.event-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        observer.observe(el);
    });
}

// Event Filter
function initEventFilter(data) {
    const filterButtons = document.querySelectorAll('.filter-btn');

    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');

            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            renderEvents(data, filter);
        });
    });
}

// ===== Smooth Scroll =====
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                scrollToSection(target);
            }
        });
    });
}

// Scrollt unter die feste Navbar. Lazy-Bilder verändern beim Scrollen die Seitenhöhe,
// deshalb wird nach dem Scrollen die Position geprüft und ggf. nachkorrigiert.
function scrollToSection(target) {
    const navbar = document.querySelector('.navbar');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduceMotion ? 'auto' : 'smooth';
    const offsetTarget = () => target.getBoundingClientRect().top - navbar.offsetHeight;

    window.scrollTo({ top: window.scrollY + offsetTarget(), behavior: behavior });

    let lastY = -1;
    let checks = 0;
    const settle = () => {
        checks++;
        const stable = Math.abs(window.scrollY - lastY) < 1;
        lastY = window.scrollY;
        if (stable && Math.abs(offsetTarget()) > 2) {
            window.scrollTo({ top: window.scrollY + offsetTarget(), behavior: behavior });
            lastY = -1;
        }
        if (checks < 20 && (!stable || Math.abs(offsetTarget()) > 2)) {
            setTimeout(settle, 350);
        }
    };
    setTimeout(settle, 350);
}

// ===== Navbar Scroll Effect =====
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', function() {
        if (window.scrollY > 100) {
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.boxShadow = 'none';
        }
    });
}

// ===== Intersection Observer for Animations =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, observerOptions);

document.querySelectorAll('.angebot-card, .stat-item, .mitmachen-card, .galerie-item, .partner-logo').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

document.head.insertAdjacentHTML('beforeend', `
    <style>
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    </style>
`);

// ===== Bitcoin Herbst 2026 Ticket-Modul =====
(function() {
    const API = 'https://tickets.lernbitcoin.com';
    const form = document.getElementById('herbst-ticket-form');
    const cta = document.getElementById('herbst-cta');
    const status = document.getElementById('herbst-status');
    const availableCount = document.getElementById('herbst-available-count');
    const totalDisplay = document.getElementById('herbst-total');
    const quantitySelect = document.getElementById('herbst-quantity');
    const pricePerTicket = 100000;

    // Verfügbarkeit laden
    async function loadAvailability() {
        try {
            const res = await fetch(API + '/api/tickets/available');
            if (!res.ok) return;
            const data = await res.json();
            const count = data.available || 0;
            availableCount.textContent = count;
            if (count === 0) {
                document.getElementById('herbst-availability').classList.add('herbst-sold-out');
                cta.disabled = true;
                cta.textContent = 'Ausverkauft';
            }
        } catch (_) {
            // API nicht erreichbar – keine Fehlermeldung anzeigen
        }
    }

    // Gesamtpreis aktualisieren
    function updateTotal() {
        const qty = parseInt(quantitySelect.value) || 1;
        const total = qty * pricePerTicket;
        totalDisplay.innerHTML = 'Gesamt: <strong>' + total.toLocaleString() + ' sats</strong>';
    }

    // Validierung
    function validate(name, email, quantity) {
        const errors = { name: '', email: '', quantity: '' };
        let valid = true;

        if (!name || name.trim().length === 0) {
            errors.name = 'Name oder Pseudonym erforderlich';
            valid = false;
        }
        if (email && (email.includes('@') && email.includes('.'))) {
            // email valid, no error
        } else if (email) {
            errors.email = 'Gültige E-Mail';
            valid = false;
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
            errors.quantity = '1–5 Tickets';
            valid = false;
        }
        return { valid, errors };
    }

    // Fehler anzeigen
    function showErrors(errors) {
        document.getElementById('herbst-error-name').textContent = errors.name;
        document.getElementById('herbst-error-email').textContent = errors.email;
        document.getElementById('herbst-error-quantity').textContent = errors.quantity;
    }

    function clearErrors() {
        showErrors({ name: '', email: '', quantity: '' });
    }

    // Status anzeigen
    function setStatus(msg, type) {
        status.textContent = msg;
        status.className = 'herbst-status ' + type;
    }

    // Formular absenden
    async function handleSubmit(e) {
        e.preventDefault();
        clearErrors();

        const name = document.getElementById('herbst-name').value;
        const email = document.getElementById('herbst-email').value;
        const quantity = parseInt(quantitySelect.value) || 1;

        // Client-seitige Validierung
        const { valid, errors } = validate(name, email, quantity);
        if (!valid) {
            showErrors(errors);
            return;
        }

        // Double-Submit verhindern
        cta.disabled = true;
        cta.textContent = 'Wird gesichert...';
        setStatus('Ticket wird gesichert…', 'info');

        try {
            const res = await fetch(API + '/api/tickets/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), quantity })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.error === 'sold_out') {
                    setStatus('Leider ausverkauft.', 'error');
                    availableCount.textContent = '0';
                    cta.disabled = true;
                    cta.textContent = 'Ausverkauft';
                } else {
                    setStatus(data.message || 'Fehler beim Sichern.', 'error');
                    cta.disabled = false;
                    cta.textContent = 'Ticket sichern';
                }
                return;
            }

            // Erfolgreich → BTCPay Checkout
            setStatus('Weiter zu BTCPay…', 'success');
            const payUrl = data.payUrl || ('https://btcpay.mx12.art/invoice?id=' + data.invoiceId);
            window.location.href = payUrl;
        } catch (_) {
            setStatus('Verbindung fehlgeschlagen. Bitte erneut versuchen.', 'error');
            cta.disabled = false;
            cta.textContent = 'Ticket sichern';
        }
    }

    // Events
    form.addEventListener('submit', handleSubmit);
    quantitySelect.addEventListener('change', updateTotal);

    // Initial laden
    loadAvailability();
})();


// ===== Schnellnavigation: aktiven Eintrag hervorheben =====
function initQuickNav() {
    const nav = document.querySelector('.quick-nav');
    const navbar = document.querySelector('.navbar');
    if (!nav || !navbar) return;

    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const byId = new Map();
    links.forEach(link => {
        const target = document.getElementById(link.getAttribute('href').slice(1));
        if (target) byId.set(target.id, link);
    });

    function setActive(link) {
        links.forEach(l => {
            const on = l === link;
            l.classList.toggle('is-active', on);
            if (on) l.setAttribute('aria-current', 'true');
            else l.removeAttribute('aria-current');
        });
        // Aktiven Chip in der waagerechten Leiste sichtbar halten (ohne die Seite zu scrollen)
        const list = nav.querySelector('.quick-nav-list');
        if (link && list && list.scrollWidth > list.clientWidth) {
            const target = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
            list.scrollTo({ left: target, behavior: 'auto' });
        }
    }

    // Während eines Klick-Scrolls bleibt der geklickte Chip aktiv (kein Flackern über die Zwischenabschnitte).
    let locked = false;
    let lockTimer;
    function lockWhileScrolling() {
        locked = true;
        clearInterval(lockTimer);
        let lastY = -1;
        let still = 0;
        lockTimer = setInterval(() => {
            still = Math.abs(window.scrollY - lastY) < 1 ? still + 1 : 0;
            lastY = window.scrollY;
            if (still >= 4) {
                clearInterval(lockTimer);
                locked = false;
                update();
            }
        }, 200);
    }

    links.forEach(link => link.addEventListener('click', () => {
        setActive(link);
        lockWhileScrolling();
    }));

    if (!('IntersectionObserver' in window)) return;

    let io = null;
    const visible = new Set();

    function update() {
        if (locked) return;
        const id = Array.from(byId.keys()).find(k => visible.has(k));
        setActive(id ? byId.get(id) : null);
    }

    function observe() {
        if (io) io.disconnect();
        visible.clear();
        // Schmales Band direkt unter der Navbar: dort liegt immer genau ein Abschnitt.
        // Band etwas unterhalb der Navbar (ca. dort, wo die Überschrift nach dem Anspringen sitzt), damit der Chip schon umspringt,
        // wenn die Sektion oben ankommt.
        const top = Math.min(navbar.offsetHeight + 110, Math.round(window.innerHeight * 0.45));
        const bottom = Math.max(window.innerHeight - top - 4, 0);
        io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) visible.add(e.target.id);
                else visible.delete(e.target.id);
            });
            update();
        }, { rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 });
        byId.forEach((_, id) => io.observe(document.getElementById(id)));
    }

    observe();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(observe, 200);
    });
}


// ===== Karte erst nach Klick laden (Datenschutz: keine Verbindung zu OpenStreetMap ohne Zutun) =====
function initMapConsent() {
    const box = document.getElementById('map-consent');
    const btn = document.getElementById('map-consent-btn');
    if (!box || !btn) return;
    btn.addEventListener('click', function() {
        const iframe = document.createElement('iframe');
        iframe.src = box.getAttribute('data-map-src');
        iframe.width = '100%';
        iframe.height = '400';
        iframe.title = 'Karte: Bitcoin Metropole Kempten, Rathausstraße 2';
        iframe.setAttribute('allowfullscreen', '');
        iframe.referrerPolicy = 'no-referrer';
        iframe.style.cssText = 'border:0; border-radius: 12px;';
        box.replaceWith(iframe);
    });
}
