(() => {
    'use strict';

    const form = document.getElementById('sessions-form');
    if (!form) return;

    const MAIL_TO = 'bitcoinmetropole@proton.me';
    const FIRST_HOUR = 9;   // erster Start 09:00
    const LAST_HOUR = 20;   // letzter Start 20:00
    const EVENT_FALLBACK_END = 22 * 60; // Events ohne Ende: blockiert ab Startzeit bis 22:00
    const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    const $ = id => document.getElementById(id);
    const dateEl = $('sessions-date');
    const timeEl = $('sessions-time');
    const durEl = $('sessions-duration');
    const hintEl = $('sessions-slot-hint');

    // busy[date] = [{from, to (Minuten), source: 'event' | 'kalender'}]
    const busy = {};
    let loaded = false;

    const pad = n => String(n).padStart(2, '0');
    const toMin = str => {
        const m = /^(\d{1,2}):(\d{2})$/.exec((str || '').trim());
        return m ? Math.min(Number(m[1]) * 60 + Number(m[2]), 1440) : null;
    };
    const fmt = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    function addBusy(date, from, to, source) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || from === null || to === null || to <= from) return;
        (busy[date] = busy[date] || []).push({ from, to, source });
    }

    // Events aus programm.csv: "ganztägig" = ganzer Tag; "HH:MM" oder "HH:MM-HH:MM" = ab Start (bzw. bis Ende), sonst bis 22:00.
    function addEvent(row) {
        const date = (row.Datum || '').trim();
        const zeit = (row.Zeit || '').trim().toLowerCase();
        if (!zeit || zeit.indexOf('ganz') === 0) {
            addBusy(date, 0, 1440, 'event');
            return;
        }
        const range = zeit.match(/(\d{1,2}:\d{2})\s*(?:[-–—]|bis)\s*(\d{1,2}:\d{2})/);
        if (range) {
            addBusy(date, toMin(range[1]), toMin(range[2]), 'event');
            return;
        }
        const single = zeit.match(/(\d{1,2}:\d{2})/);
        if (single) {
            addBusy(date, toMin(single[1]), EVENT_FALLBACK_END, 'event');
            return;
        }
        addBusy(date, 0, 1440, 'event'); // unlesbare Zeit: lieber sperren
    }

    async function loadAvailability() {
        try {
            const res = await fetch('programm.csv', { cache: 'no-cache' });
            if (res.ok) {
                const text = await res.text();
                (typeof parseCSV === 'function' ? parseCSV(text) : []).forEach(addEvent);
            }
        } catch (e) { console.warn('Sessions: programm.csv nicht lesbar', e); }

        try {
            const res = await fetch('availability.json', { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data && Array.isArray(data.busy) ? data.busy : []);
                list.forEach(b => addBusy(b.date, toMin(b.from), toMin(b.to), 'kalender'));
                if (data && data.updated) {
                    const [y, m, d] = String(data.updated).split('-');
                    if (y && m && d) hintEl.textContent = `Slots sind „frei laut Kalender“ (Stand ${d}.${m}.${y}). Die endgültige Bestätigung kommt per E-Mail.`;
                }
            }
        } catch (e) { console.warn('Sessions: availability.json nicht lesbar', e); }

        loaded = true;
        renderSlots();
    }

    function busyReason(date, start, end) {
        const hit = (busy[date] || []).filter(b => start < b.to && end > b.from);
        if (!hit.length) return null;
        return hit.some(b => b.source === 'event') ? 'belegt (Event)' : 'belegt';
    }

    function renderSlots() {
        const date = dateEl.value;
        const dur = Number(durEl.value) || 1;
        const previous = timeEl.value;
        timeEl.innerHTML = '';

        if (!date) {
            timeEl.disabled = true;
            timeEl.innerHTML = '<option value="">Bitte zuerst einen Tag wählen</option>';
            return;
        }

        const now = new Date();
        const isToday = date === todayStr();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        let free = 0;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        timeEl.appendChild(placeholder);

        for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
            const start = h * 60;
            const end = start + dur * 60;
            const opt = document.createElement('option');
            opt.value = fmt(start);
            const reason = (isToday && start <= nowMin) ? 'vorbei' : busyReason(date, start, end);
            if (reason) {
                opt.textContent = `${fmt(start)} – ${fmt(end)} · ${reason}`;
                opt.disabled = true;
            } else {
                opt.textContent = `${fmt(start)} – ${fmt(end)} Uhr · frei`;
                free++;
            }
            timeEl.appendChild(opt);
        }

        placeholder.textContent = free ? 'Startzeit wählen' : 'An diesem Tag ist leider nichts frei';
        timeEl.disabled = false;
        const keep = Array.from(timeEl.options).find(o => o.value === previous && !o.disabled);
        timeEl.value = keep ? previous : '';
    }

    // Nur zukünftige Tage (ab heute, heutige Slots nur wenn noch nicht begonnen)
    dateEl.min = todayStr();
    dateEl.addEventListener('change', () => { setError('date', ''); renderSlots(); });
    durEl.addEventListener('change', renderSlots);
    timeEl.addEventListener('change', () => setError('time', ''));
    ['name', 'email', 'message'].forEach(f => $('sessions-' + f).addEventListener('input', () => setError(f, '')));

    function setError(field, msg) {
        const el = $('sessions-error-' + field);
        if (el) el.textContent = msg;
        const input = $('sessions-' + field);
        if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }

    function validate() {
        let first = null;
        const fail = (field, msg) => { setError(field, msg); if (!first) first = $('sessions-' + field); };
        ['date', 'time', 'name', 'email', 'message'].forEach(f => setError(f, ''));

        if (!dateEl.value) fail('date', 'Bitte einen Tag wählen.');
        else if (dateEl.value < todayStr()) fail('date', 'Bitte einen Tag in der Zukunft wählen.');
        if (!timeEl.value) fail('time', 'Bitte eine freie Startzeit wählen.');
        else if (busyReason(dateEl.value, toMin(timeEl.value), toMin(timeEl.value) + Number(durEl.value) * 60)) {
            fail('time', 'Dieser Slot ist leider belegt.');
        }
        if (!$('sessions-name').value.trim()) fail('name', 'Bitte deinen Namen angeben.');
        const email = $('sessions-email').value.trim();
        if (!email) fail('email', 'Bitte deine E-Mail-Adresse angeben.');
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('email', 'Bitte eine gültige E-Mail-Adresse angeben.');
        if (!$('sessions-message').value.trim()) fail('message', 'Bitte kurz beschreiben, worum es geht.');
        if (first) first.focus();
        return !first;
    }

    function formatDate(str) {
        const [y, m, d] = str.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return `${WEEKDAYS[dt.getDay()]}, ${pad(d)}.${pad(m)}.${y}`;
    }

    function buildRequest() {
        const dur = Number(durEl.value);
        const start = toMin(timeEl.value);
        const when = `${formatDate(dateEl.value)}, ${fmt(start)}–${fmt(start + dur * 60)} Uhr (${dur} ${dur === 1 ? 'Stunde' : 'Stunden'})`;
        const phone = $('sessions-phone').value.trim();
        const subject = `Terminanfrage 1:1 Session – ${formatDate(dateEl.value)} ${timeEl.value} Uhr`;
        const body = [
            'Terminanfrage 1:1 Session (Berater: Andreas Bäcker, 50 € pro Stunde)',
            '',
            `Wunschtermin: ${when}`,
            `Name: ${$('sessions-name').value.trim()}`,
            `E-Mail: ${$('sessions-email').value.trim()}`,
            `Telefon / Telegram: ${phone || '–'}`,
            '',
            'Worum geht es / welche Beratung:',
            $('sessions-message').value.trim(),
            '',
            'Hinweis: Das ist eine Terminanfrage, noch keine Buchung.'
        ].join('\n');
        return { subject, body };
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!validate()) return;
        const { subject, body } = buildRequest();
        const href = `mailto:${MAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        $('sessions-summary').value = `An: ${MAIL_TO}\nBetreff: ${subject}\n\n${body}`;
        $('sessions-mailto').href = href;
        $('sessions-copy-status').textContent = '';
        const result = $('sessions-result');
        result.hidden = false;
        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        window.location.href = href;
    });

    $('sessions-copy').addEventListener('click', async () => {
        const ta = $('sessions-summary');
        const status = $('sessions-copy-status');
        try {
            await navigator.clipboard.writeText(ta.value);
            status.textContent = 'Kopiert ✓';
        } catch (e) {
            ta.focus();
            ta.select();
            status.textContent = document.execCommand && document.execCommand('copy') ? 'Kopiert ✓' : 'Bitte Text markieren und manuell kopieren.';
        }
    });

    loadAvailability();
    renderSlots();
})();
