// ===== Bitcoin Metropole Kempten =====

document.addEventListener('DOMContentLoaded', function() {
    initMobileMenu();
    loadEventsFromCSV();
    initSmoothScroll();
    initNavbarScroll();
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
        const date = new Date(event.Datum);
        const day = date.getDate();
        const month = months[date.getMonth()];
        const weekday = weekdays[date.getDay()];

        html += `
            <div class="event-card" data-type="${event.Typ}">
                <div class="event-date">
                    <span class="event-day">${day}</span>
                    <span class="event-month">${month}</span>
                    <span class="event-weekday">${weekday}</span>
                </div>
                <div class="event-info">
                    <h3>${event.Titel}</h3>
                    <p>${event.Beschreibung}</p>
                </div>
                <div class="event-meta">
                    <span class="event-time">${event.Zeit} Uhr</span>
                    <span class="event-type-badge badge-${event.Typ}">${event.Typ}</span>
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
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
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

document.querySelectorAll('.angebot-card, .stat-item, .mitmachen-card, .galerie-item').forEach(el => {
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
