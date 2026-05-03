/* =============================================
   VOYAGE AIRLINES — FULL APP LOGIC
   Backend: Flask at http://localhost:5000
   ============================================= */

const API = '';   // same-origin: Flask serves the HTML too
const GOOGLE_CLIENT_ID = '';  // paste your Google OAuth Client ID here

// ── Global state ────────────────────────────────────────────────
const state = {
  from: '', to: '', fromCode: '', toCode: '',
  depDate: '', retDate: '', adults: 1, children: 0, infants: 0,
  cabin: 'Economy', trip: 'oneway',
  selectedFlight: null, selectedSeat: null,
  wishlisted: [], currentUser: null,
  allAirports: []
};

// ── Flight data (mock – real booking saved to DB) ───────────────
const flightDB = [
  { id:1, airline:'IndiGo',   code:'6E 201', color:'#2563eb', dep:'06:45', arr:'09:15', dur:'2h 30m', stops:0, price:8499,  baggage:'15kg', refund:'Refundable' },
  { id:2, airline:'Air India',code:'AI 410', color:'#dc2626', dep:'09:30', arr:'13:10', dur:'3h 40m', stops:1, price:7299,  baggage:'25kg', refund:'Refundable' },
  { id:3, airline:'Emirates', code:'EK 512', color:'#b45309', dep:'14:15', arr:'18:00', dur:'3h 45m', stops:0, price:12800, baggage:'30kg', refund:'Refundable' },
  { id:4, airline:'Vistara',  code:'UK 830', color:'#7c3aed', dep:'21:00', arr:'00:10+1',dur:'3h 10m',stops:0, price:9999,  baggage:'20kg', refund:'Non-refundable' },
  { id:5, airline:'SpiceJet', code:'SG 128', color:'#e25c1a', dep:'11:55', arr:'16:30', dur:'4h 35m', stops:2, price:5999,  baggage:'15kg', refund:'Non-refundable' },
];

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const dep = new Date(today); dep.setDate(dep.getDate() + 7);
  const ret = new Date(today); ret.setDate(ret.getDate() + 14);
  document.getElementById('depDate').value = fmt(dep);
  document.getElementById('retDate').value  = fmt(ret);

  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.passenger-field'))
      document.getElementById('passengerDropdown').classList.remove('open');
    if (!e.target.closest('.airport-field'))
      document.querySelectorAll('.airport-dropdown').forEach(d => d.classList.remove('open'));
  });

  await loadAirports();
  initAirportAutocomplete('fromCity', 'fromDropdown', 'fromCode');
  initAirportAutocomplete('toCity',   'toDropdown',   'toCode');

  await checkAuthState();
  generateSeatMap();

  // Google Sign-In — wait for GSI script to load then initialise
  if (GOOGLE_CLIENT_ID) {
    const waitForGoogle = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(waitForGoogle);
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
        renderGoogleButtons();
      }
    }, 200);
  } else {
    renderGoogleFallback();
  }
});

// ── Airports autocomplete ────────────────────────────────────────
async function loadAirports() {
  try {
    const res = await fetch('/airports.json');
    state.allAirports = await res.json();
  } catch (e) {
    console.warn('Could not load airports.json', e);
  }
}

function initAirportAutocomplete(inputId, dropdownId, codeField) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.remove('open'); return; }
    const matches = state.allAirports.filter(a =>
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q)
    ).slice(0, 8);

    if (!matches.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = matches.map(a => `
      <div class="airport-option" onclick="selectAirport('${inputId}','${dropdownId}','${codeField}','${a.city.replace(/'/g,"\\'")}','${a.iata}','${a.name.replace(/'/g,"\\'")}','${a.country.replace(/'/g,"\\'")}')">
        <span class="ao-code">${a.iata}</span>
        <span class="ao-info"><strong>${a.city}</strong><small>${a.name}, ${a.country}</small></span>
      </div>
    `).join('');
    dropdown.classList.add('open');
  });

  input.addEventListener('focus', () => { if (input.value.length > 0) input.dispatchEvent(new Event('input')); });
}

function selectAirport(inputId, dropdownId, codeField, city, iata, name, country) {
  const input = document.getElementById(inputId);
  input.value = `${city} (${iata})`;
  document.getElementById(dropdownId).classList.remove('open');
  // store in state
  if (inputId === 'fromCity') { state.from = city; state.fromCode = iata; }
  else                         { state.to   = city; state.toCode   = iata; }
}

// ── Auth state ───────────────────────────────────────────────────
async function checkAuthState() {
  try {
    const res  = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user;
      updateNavForUser(data.user);
    } else {
      updateNavForGuest();
    }
  } catch {
    updateNavForGuest();
  }
}

function updateNavForUser(user) {
  const nav = document.getElementById('navLinks');
  const loginLi  = nav.querySelector('li:nth-last-child(2)');
  const signupLi = nav.querySelector('li:last-child');
  if (loginLi)  loginLi.innerHTML  = `<a href="#" onclick="showPage('dashboard')"><i class="fas fa-user-circle"></i> ${user.first_name}</a>`;
  if (signupLi) signupLi.innerHTML = `<a href="#" class="btn-nav-signup" onclick="doLogout()">Logout</a>`;
}

function updateNavForGuest() {
  const nav = document.getElementById('navLinks');
  const loginLi  = nav.querySelector('li:nth-last-child(2)');
  const signupLi = nav.querySelector('li:last-child');
  if (loginLi)  loginLi.innerHTML  = `<a href="#" onclick="showPage('login')" class="btn-nav-login">Login</a>`;
  if (signupLi) signupLi.innerHTML = `<a href="#" onclick="showPage('login')" class="btn-nav-signup">Sign Up</a>`;
}

async function doLogout() {
  try { await fetch(`${API}/api/auth/logout`, { method:'POST', credentials:'include' }); } catch {}
  state.currentUser = null;
  updateNavForGuest();
  showPage('home');
  showToast('You have been logged out.', 'success');
}

// ── Page routing ─────────────────────────────────────────────────
function showPage(name) {
  if (name === 'dashboard' && !state.currentUser) {
    showToast('Please login to view your dashboard.', 'error');
    showPage('login');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'dashboard') loadDashboard();
  if (name === 'login' && GOOGLE_CLIENT_ID && window.google?.accounts?.id)
    setTimeout(renderGoogleButtons, 100);
}

// ── Google OAuth ─────────────────────────────────────────────────
function renderGoogleButtons() {
  ['googleLoginBtn', 'googleSignupBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '';
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', width: el.offsetWidth || 320, text: id.includes('Login') ? 'signin_with' : 'signup_with' });
    }
  });
}

function renderGoogleFallback() {
  const logo = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZmlsbD0iI0ZGQzEwNyIgZD0iTTQzLjYxMSwyMC4wODNIMjRWMjguMDgzSDM1LjMwNkMzNC4wMjcsMzMuMjcsMjkuNDkzLDM2LjgzMywyNCwzNi44MzNjLTYuNjI3LDAtMTItNS4zNzMtMTItMTJzNS4zNzMtMTIsMTItMTJjMy4wNTksMCw1LjgzNiwxLjA5MSw3Ljk3MywyLjg4N2w1LjY1Ny01LjY1N0MzNC4wNDYsNi4wNTMsMjkuMjY4LDQsMjQsNEMxMi45NTQsNCw0LDEyLjk1NCw0LDI0czguOTU0LDIwLDIwLDIwYzExLjA0NSwwLDE5Ljk5OS04Ljk1NSwxOS45OTktMjBDMjMuOTk5LDIyLjY5NywyMy44NzEsMjEuMzYzLDQzLjYxMSwyMC4wODN6Ii8+PHBhdGggZmlsbD0iI0ZGM0QwMCIgZD0iTTYuMzA2LDE0LjY5MWw2LjU3MSw0LjgxOUMxNC42NTUsMTUuMTA4LDE4Ljk2MSwxMiwyNCwxMmMzLjA1OSwwLDUuODM2LDEuMDkxLDcuOTczLDIuODg3bDUuNjU3LTUuNjU3QzM0LjA0Niw2LjA1MywyOS4yNjgsNCwyNCw0QzE2LjMxOCw0LDkuNjU2LDguMzM3LDYuMzA2LDE0LjY5MXoiLz48cGF0aCBmaWxsPSIjNENBRjUwIiBkPSJNMjQsNDRjNS4xNjYsMCw5Ljg2LTEuOTc3LDEzLjQwOS01LjE5MmwtNi4xOS01LjIzOEMyOS4yMTEsMzUuMDkxLDI2LjcxNSwzNiwyNCwzNmMtNS40OTIsMC0xMC4wMjctMy41NjMtMTEuMzA3LTguNzVsLTYuNTIyLDUuMDI1QzkuNTA1LDM5LjU1NiwxNi4yMjcsNDQsMjQsNDR6Ii8+PHBhdGggZmlsbD0iIzE1NjVDMCIgZD0iTTQzLjYxMSwyMC4wODNIMjRWMjguMDgzSDM1LjMwNmMtMC41NzksMi4yMzYtMS44NjQsNC4xMjMtMy41OTQsNS41MDhsNi4xOSw1LjIzOEMzOS4xNDgsMzUuMzM4LDQ0LDMwLjI5Miw0NCwyNEM0NCwyMi42OTcsMjMuODcxLDIxLjM2Myw0My42MTEsMjAuMDgzeiIvPjwvc3ZnPg==';
  ['googleLoginBtn', 'googleSignupBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<button class="google-unconfigured" onclick="alert('Google Sign-In is not configured yet.\\n\\nTo enable it:\\n1. Go to console.cloud.google.com\\n2. Create OAuth 2.0 credentials\\n3. Add your Client ID to app.js')"><img src="${logo}"/> Continue with Google</button>`;
  });
}

async function handleGoogleCredential(response) {
  try {
    const res  = await fetch(`${API}/api/auth/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Google sign-in failed.', 'error'); return; }
    state.currentUser = data.user;
    updateNavForUser(data.user);
    showToast(`Welcome, ${data.user.first_name}! 🎉`, 'success');
    setTimeout(() => showPage('dashboard'), 800);
  } catch {
    showToast('Cannot connect to server. Is it running?', 'error');
  }
}

function toggleMenu() {
  document.getElementById('navLinks').classList.toggle('open');
}

// ── Trip type ────────────────────────────────────────────────────
function setTrip(type) {
  state.trip = type;
  ['oneway','roundtrip','multicity'].forEach(t => {
    document.getElementById('btn-' + t).classList.toggle('active', t === type);
  });
  document.getElementById('retDateField').style.display    = type === 'roundtrip' ? '' : 'none';
  document.getElementById('multiCityRows').style.display   = type === 'multicity'  ? '' : 'none';
}

// ── Swap cities ──────────────────────────────────────────────────
function swapCities() {
  const f = document.getElementById('fromCity');
  const t = document.getElementById('toCity');
  [f.value, t.value] = [t.value, f.value];
  [state.from, state.to]         = [state.to, state.from];
  [state.fromCode, state.toCode] = [state.toCode, state.fromCode];
}

// ── Passenger dropdown ───────────────────────────────────────────
function togglePassengerDropdown() {
  document.getElementById('passengerDropdown').classList.toggle('open');
}

function changePax(type, delta, e) {
  e.stopPropagation();
  if (type === 'adult')  state.adults   = Math.max(1, Math.min(9, state.adults   + delta));
  if (type === 'child')  state.children = Math.max(0, Math.min(6, state.children + delta));
  if (type === 'infant') state.infants  = Math.max(0, Math.min(state.adults, state.infants + delta));
  document.getElementById('adultCount').textContent  = state.adults;
  document.getElementById('childCount').textContent  = state.children;
  document.getElementById('infantCount').textContent = state.infants;
}

function applyPax(e) {
  e.stopPropagation();
  state.cabin = document.getElementById('cabinClass').value;
  const paxStr = `${state.adults} Adult${state.adults > 1 ? 's' : ''}` +
    (state.children ? `, ${state.children} Child${state.children > 1 ? 'ren' : ''}` : '') +
    (state.infants  ? `, ${state.infants} Infant${state.infants > 1 ? 's' : ''}` : '') +
    ` · ${state.cabin}`;
  document.getElementById('paxDisplay').textContent = paxStr;
  document.getElementById('passengerDropdown').classList.remove('open');
}

// ── Search flights ───────────────────────────────────────────────
function searchFlights() {
  const fromVal = document.getElementById('fromCity').value.trim();
  const toVal   = document.getElementById('toCity').value.trim();
  if (!fromVal || !toVal) { showToast('Please enter both departure and destination.', 'error'); return; }

  // Extract city + code from "City (CODE)" format or plain text
  const extract = (val) => {
    const m = val.match(/^(.+?)\s*\(([A-Z]{3})\)$/);
    return m ? { city: m[1].trim(), code: m[2] } : { city: val, code: val.toUpperCase().slice(0,3) };
  };
  const from = extract(fromVal), to = extract(toVal);
  state.from = from.city; state.fromCode = from.code;
  state.to   = to.city;   state.toCode   = to.code;
  state.depDate = document.getElementById('depDate').value;

  renderResults([...flightDB]);
  showPage('results');
}

function quickSearch(from, to) {
  document.getElementById('fromCity').value = from;
  document.getElementById('toCity').value   = to;
  state.from = from; state.to = to;
  const fa = state.allAirports.find(a => a.city === from);
  const ta = state.allAirports.find(a => a.city === to);
  state.fromCode = fa ? fa.iata : from.slice(0,3).toUpperCase();
  state.toCode   = ta ? ta.iata : to.slice(0,3).toUpperCase();
  renderResults([...flightDB]);
  showPage('results');
}

// ── Results ──────────────────────────────────────────────────────
function renderResults(flights) {
  const container = document.getElementById('flightCards');
  document.getElementById('rFrom').textContent = state.fromCode;
  document.getElementById('rTo').textContent   = state.toCode;
  document.getElementById('resultCount').textContent = `${flights.length} flight${flights.length !== 1 ? 's' : ''} found`;
  const depDate = state.depDate
    ? new Date(state.depDate).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })
    : 'Flexible';
  document.getElementById('dateSummary').textContent = `${depDate} · ${state.adults} Adult · ${state.cabin}`;

  container.innerHTML = flights.map(f => {
    const stopsLabel = f.stops === 0 ? 'Non-stop' : f.stops === 1 ? '1 Stop' : `${f.stops} Stops`;
    const stopsClass = f.stops === 0 ? 'nonstop' : 'one-stop';
    const initials   = f.airline.split(' ').map(w => w[0]).join('').slice(0,2);
    const saved      = state.wishlisted.includes(f.id);
    return `
    <div class="flight-card" id="fc-${f.id}">
      <div class="flight-card-top">
        <div class="airline-info">
          <div class="airline-logo" style="background:${f.color}">${initials}</div>
          <div><span>${f.airline}</span><small>${f.code}</small></div>
        </div>
        <div class="flight-times">
          <div class="flight-time"><div class="time">${f.dep}</div><div class="city">${state.fromCode}</div></div>
          <div class="flight-timeline">
            <div class="timeline-line">
              <span class="dot"></span><span class="line"></span>
              <i class="fas fa-plane plane-icon"></i>
              <span class="line"></span><span class="dot"></span>
            </div>
            <div class="flight-dur">${f.dur}</div>
            <span class="stops-tag ${stopsClass}">${stopsLabel}</span>
          </div>
          <div class="flight-time"><div class="time">${f.arr}</div><div class="city">${state.toCode}</div></div>
        </div>
        <div class="flight-price">
          <div class="price">₹${f.price.toLocaleString('en-IN')}</div>
          <div class="per-person">per person</div>
          <button class="btn-book" onclick="selectFlight(${f.id})">Book Now</button>
        </div>
      </div>
      <div class="flight-card-bottom">
        <span><i class="fas fa-suitcase"></i> ${f.baggage}</span>
        <span><i class="fas fa-undo"></i> ${f.refund}</span>
        <span><i class="fas fa-couch"></i> ${state.cabin}</span>
        <span class="wish-toggle ${saved ? 'saved' : ''}" onclick="toggleWish(${f.id},this)">
          <i class="fa${saved ? 's' : 'r'} fa-heart"></i> ${saved ? 'Saved' : 'Save'}
        </span>
      </div>
    </div>`;
  }).join('');
}

function toggleWish(id, el) {
  const idx = state.wishlisted.indexOf(id);
  if (idx === -1) {
    state.wishlisted.push(id);
    el.classList.add('saved');
    el.innerHTML = '<i class="fas fa-heart"></i> Saved';
    showToast('Flight saved to wishlist!', 'success');
  } else {
    state.wishlisted.splice(idx, 1);
    el.classList.remove('saved');
    el.innerHTML = '<i class="far fa-heart"></i> Save';
    showToast('Removed from wishlist.');
  }
}

function sortFlights(by, el) {
  document.querySelectorAll('.radio-option').forEach(r => r.classList.remove('active-sort'));
  el.classList.add('active-sort');
  const sorted = [...flightDB].sort((a, b) => {
    if (by === 'price')    return a.price - b.price;
    if (by === 'duration') return a.dur.localeCompare(b.dur);
    if (by === 'depart')   return a.dep.localeCompare(b.dep);
    return 0;
  });
  renderResults(sorted);
}

function filterFlights() { renderResults([...flightDB]); }
function updatePriceFilter(val) { document.getElementById('priceMax').textContent = '₹' + parseInt(val).toLocaleString('en-IN'); }
function toggleTimeSlot(el) { el.classList.toggle('active-slot'); }

// ── Select flight → booking ──────────────────────────────────────
function selectFlight(id) {
  if (!state.currentUser) {
    showToast('Please login to book a flight.', 'error');
    showPage('login');
    return;
  }
  state.selectedFlight = flightDB.find(f => f.id === id);
  const f = state.selectedFlight;
  document.getElementById('summRoute').textContent    = `${state.fromCode} → ${state.toCode}`;
  document.getElementById('summDuration').textContent = f.dur;
  document.getElementById('summClass').textContent    = state.cabin;
  const depDate = state.depDate
    ? new Date(state.depDate).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric' })
    : '—';
  document.getElementById('summDate').textContent = depDate;
  const tax = Math.round(f.price * 0.16);
  document.getElementById('sumBaseFare').textContent = '₹' + f.price.toLocaleString('en-IN');
  document.getElementById('sumTax').textContent      = '₹' + tax.toLocaleString('en-IN');
  document.getElementById('sumTotal').textContent    = '₹' + (f.price + tax).toLocaleString('en-IN');
  showPage('booking');
  showStep('traveller');

  // Pre-fill traveller form with user info
  if (state.currentUser) {
    const u = state.currentUser;
    document.querySelector('#stepTraveller .form-grid input[placeholder="As on passport"]')
      && (document.querySelectorAll('#stepTraveller .form-grid input')[1].value = u.first_name || '');
    document.querySelectorAll('#stepTraveller .form-grid input')[2] &&
      (document.querySelectorAll('#stepTraveller .form-grid input')[2].value = u.last_name || '');
    const emailInput = document.querySelector('#stepTraveller input[type="email"]');
    if (emailInput) emailInput.value = u.email || '';
    const phoneInput = document.querySelector('#stepTraveller input[type="tel"]');
    if (phoneInput) phoneInput.value = u.phone || '';
  }
}

// ── Booking steps ────────────────────────────────────────────────
function showStep(step) {
  document.getElementById('stepTraveller').style.display = step === 'traveller' ? '' : 'none';
  document.getElementById('stepSeat').style.display      = step === 'seat'      ? '' : 'none';
}
function goToSeatSelection() { showStep('seat'); window.scrollTo({ top: 0 }); }
function goToTraveller()     { showStep('traveller'); }
function goToReview() {
  if (!state.selectedSeat) { showToast('Please select a seat first.', 'error'); return; }
  showPage('payment');
}
function goToPayment() { showPage('payment'); }

// ── Seat map ─────────────────────────────────────────────────────
function generateSeatMap() {
  const map = document.getElementById('seatMap');
  if (!map) return;
  const cols    = ['A','B','C','','D','E','F'];
  const rows    = 30;
  const occupied = [2,5,8,11,14,17,20,23,26,3,7,12,18,24];
  const extraLeg = [12,13];

  const header = document.createElement('div');
  header.className = 'seat-cols';
  header.style.marginBottom = '0.3rem';
  header.innerHTML = '<div style="width:30px"></div>' +
    cols.map(c => c
      ? `<div class="seat" style="background:var(--navy);color:white;border-color:var(--navy);font-size:0.7rem">${c}</div>`
      : '<div class="aisle"></div>'
    ).join('');
  map.appendChild(header);

  for (let r = 1; r <= rows; r++) {
    const row = document.createElement('div');
    row.className = 'seat-cols';
    row.innerHTML = `<div style="width:30px;font-size:0.72rem;color:var(--muted);display:flex;align-items:center;justify-content:center">${r}</div>`;
    cols.forEach(c => {
      if (!c) { row.innerHTML += '<div class="aisle"></div>'; return; }
      const seatId  = `${r}${c}`;
      const isOcc   = occupied.includes(r) && ['A','C','F'].includes(c);
      const isExtra = extraLeg.includes(r);
      const div = document.createElement('div');
      div.className = `seat${isOcc ? ' occupied' : ''}${isExtra ? ' extra-legroom' : ''}`;
      div.textContent = seatId;
      div.setAttribute('data-seat', seatId);
      if (!isOcc) div.onclick = () => selectSeat(seatId, div);
      row.appendChild(div);
    });
    map.appendChild(row);
  }
}

function selectSeat(id, el) {
  document.querySelectorAll('.seat.selected').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedSeat = id;
  const info = document.getElementById('selectedSeatInfo');
  info.style.display = 'block';
  info.innerHTML = `<i class="fas fa-check-circle"></i> Seat ${id} selected`;
}

// ── Payment ──────────────────────────────────────────────────────
function setPayTab(tab, el) {
  document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.pay-content').forEach(c => c.classList.remove('active-pay'));
  el.classList.add('active');
  document.getElementById('payContent-' + tab).classList.add('active-pay');
}

function selectBank(el) {
  el.closest('.bank-grid').querySelectorAll('.bank-card').forEach(b => b.classList.remove('active-bank'));
  el.classList.add('active-bank');
}

function formatCard(input) {
  let v = input.value.replace(/\D/g,'').slice(0,16);
  input.value = v.replace(/(.{4})/g,'$1 ').trim();
  const icon = document.getElementById('cardBrandIcon');
  if (v.startsWith('4'))       icon.className = 'fab fa-cc-visa card-brand-icon';
  else if (/^5[1-5]/.test(v)) icon.className = 'fab fa-cc-mastercard card-brand-icon';
  else if (/^3[47]/.test(v))  icon.className = 'fab fa-cc-amex card-brand-icon';
  else                         icon.className = 'fab fa-cc-visa card-brand-icon';
}

async function processPayment() {
  const overlay = document.getElementById('paymentOverlay');
  overlay.classList.add('show');

  try {
    const f = state.selectedFlight || flightDB[0];
    const bookingData = {
      airline:     f.airline,
      flight_no:   f.code,
      from_city:   state.from || 'New Delhi',
      to_city:     state.to   || 'Dubai',
      from_code:   state.fromCode || 'DEL',
      to_code:     state.toCode   || 'DXB',
      dep_date:    state.depDate  || new Date().toISOString().split('T')[0],
      dep_time:    f.dep,
      arr_time:    f.arr,
      duration:    f.dur,
      cabin_class: state.cabin || 'Economy',
      seat:        state.selectedSeat || '14C',
      adults:      state.adults || 1,
      base_fare:   f.price,
    };

    // Save booking to database
    const res = await fetch(`${API}/api/bookings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData)
    });

    await new Promise(r => setTimeout(r, 1800)); // show spinner briefly

    overlay.classList.remove('show');

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Booking failed. Please try again.', 'error');
      return;
    }

    const data = await res.json();
    const bk   = data.booking;

    // Populate confirmation page
    document.getElementById('bookingRef').textContent = bk.booking_ref;
    document.getElementById('cfFlight').textContent   = bk.flight_no;
    document.getElementById('cfRoute').textContent    = `${bk.from_code} → ${bk.to_code}`;
    document.getElementById('cfDep').textContent      = bk.dep_time;
    document.getElementById('cfArr').textContent      = bk.arr_time;
    document.getElementById('cfSeat').textContent     = bk.seat || '—';
    document.getElementById('cfDate').textContent     = new Date(bk.dep_date)
      .toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'long', year:'numeric' });

    showPage('confirmation');
    showToast('Booking confirmed! 🎉', 'success');

  } catch (err) {
    overlay.classList.remove('show');
    showToast('Network error. Please check your connection.', 'error');
    console.error(err);
  }
}

function downloadTicket() {
  showToast('E-Ticket downloaded successfully!', 'success');
}

// ── Auth forms ───────────────────────────────────────────────────
function setAuthTab(tab) {
  document.getElementById('loginTab').classList.toggle('active',  tab === 'login');
  document.getElementById('signupTab').classList.toggle('active', tab === 'signup');
  document.getElementById('loginForm').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? '' : 'none';
}

function togglePw(id, icon) {
  const input = document.getElementById(id);
  if (input.type === 'password') { input.type = 'text';     icon.className = 'fas fa-eye-slash pw-toggle'; }
  else                           { input.type = 'password'; icon.className = 'fas fa-eye pw-toggle'; }
}

async function loginUser() {
  const email = document.querySelector('#loginForm input[type="email"]').value.trim();
  const pw    = document.getElementById('loginPw').value;
  if (!email || !pw) { showToast('Please fill in all fields.', 'error'); return; }

  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Login failed.', 'error'); return; }

    state.currentUser = data.user;
    updateNavForUser(data.user);
    showToast(`Welcome back, ${data.user.first_name}!`, 'success');
    setTimeout(() => showPage('dashboard'), 800);
  } catch {
    showToast('Cannot connect to server. Is it running?', 'error');
  }
}

async function signupUser() {
  const firstName = document.querySelectorAll('#signupForm .form-grid input')[0].value.trim();
  const lastName  = document.querySelectorAll('#signupForm .form-grid input')[1].value.trim();
  const email     = document.querySelector('#signupForm input[type="email"]').value.trim();
  const phone     = document.querySelector('#signupForm input[type="tel"]').value.trim();
  const pw        = document.getElementById('signupPw').value;
  const agreed    = document.querySelector('#signupForm input[type="checkbox"]').checked;

  if (!firstName || !lastName || !email || !pw) { showToast('Please fill in all required fields.', 'error'); return; }
  if (!agreed) { showToast('Please accept the Terms & Privacy Policy.', 'error'); return; }
  if (pw.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }

  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, phone, password: pw })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Registration failed.', 'error'); return; }

    state.currentUser = data.user;
    updateNavForUser(data.user);
    showToast(`Account created! Welcome, ${data.user.first_name}!`, 'success');
    setTimeout(() => showPage('dashboard'), 800);
  } catch {
    showToast('Cannot connect to server. Is it running?', 'error');
  }
}

// ── Dashboard ────────────────────────────────────────────────────
async function loadDashboard() {
  if (!state.currentUser) return;
  const u = state.currentUser;
  // Update profile panel
  document.querySelector('.dash-name').textContent  = `${u.first_name} ${u.last_name}`;
  document.querySelector('.dash-email').textContent = u.email;

  // Fill profile form
  const profileInputs = document.querySelectorAll('#dash-profile input, #dash-profile select');
  if (profileInputs.length >= 6) {
    profileInputs[0].value = u.first_name || '';
    profileInputs[1].value = u.last_name  || '';
    profileInputs[2].value = u.email      || '';
    profileInputs[3].value = u.phone      || '';
    if (profileInputs[4].tagName === 'SELECT') {
      profileInputs[4].value = u.nationality || 'Indian';
    }
    profileInputs[5].value = u.passport_no || '';
  }

  // Load real bookings
  try {
    const res  = await fetch(`${API}/api/bookings`, { credentials: 'include' });
    const data = await res.json();
    renderBookingList(data.bookings || []);
    updateDashStats(data.bookings || []);
  } catch (e) {
    console.error('Could not load bookings', e);
  }
}

function renderBookingList(bookings) {
  const list = document.querySelector('.booking-list');
  if (!list) return;
  if (!bookings.length) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--muted)">
      <i class="fas fa-ticket-alt" style="font-size:2.5rem;margin-bottom:1rem;display:block;opacity:0.3"></i>
      <p>No bookings yet. <a href="#" onclick="showPage('home')" style="color:var(--sky)">Search flights</a> to get started.</p>
    </div>`;
    return;
  }
  list.innerHTML = bookings.map(b => {
    const statusClass = b.status === 'upcoming' ? 'upcoming' : b.status === 'cancelled' ? 'completed' : 'completed';
    const dateStr = b.dep_date ? new Date(b.dep_date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : b.dep_date;
    return `
    <div class="booking-item ${b.status === 'upcoming' ? 'upcoming' : 'completed'}">
      <div class="bi-status ${statusClass}">${b.status.charAt(0).toUpperCase() + b.status.slice(1)}</div>
      <div class="bi-route"><strong>${b.from_code} → ${b.to_code}</strong><span>${b.flight_no}</span></div>
      <div class="bi-date"><i class="fas fa-calendar"></i> ${dateStr} · ${b.dep_time}</div>
      <div class="bi-class"><i class="fas fa-couch"></i> ${b.cabin_class} · Seat ${b.seat || '—'}</div>
      <div class="bi-ref">Ref: ${b.booking_ref}</div>
      <div class="bi-date"><i class="fas fa-rupee-sign"></i> Total: ₹${parseFloat(b.total).toLocaleString('en-IN')}</div>
      <div class="bi-actions">
        <button class="btn-sm" onclick="showToast('E-Ticket downloaded!','success')"><i class="fas fa-download"></i> E-Ticket</button>
        ${b.status === 'upcoming' ? `<button class="btn-sm btn-cancel" onclick="cancelBooking('${b.booking_ref}',this)"><i class="fas fa-times"></i> Cancel</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function updateDashStats(bookings) {
  const total    = bookings.length;
  const upcoming = bookings.filter(b => b.status === 'upcoming').length;
  const codes    = new Set(bookings.map(b => b.to_code));
  const statCards = document.querySelectorAll('.stat-card span');
  if (statCards[0]) statCards[0].textContent = total;
  if (statCards[1]) statCards[1].textContent = codes.size;
}

async function cancelBooking(ref, btn) {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  try {
    const res = await fetch(`${API}/api/bookings/${ref}/cancel`, { method:'PUT', credentials:'include' });
    if (res.ok) {
      showToast('Booking cancelled successfully.', 'success');
      loadDashboard();
    } else {
      showToast('Could not cancel booking.', 'error');
    }
  } catch {
    showToast('Network error.', 'error');
  }
}

function showDashTab(tab, el) {
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active-tab'));
  document.querySelectorAll('.dash-link').forEach(l => l.classList.remove('active'));
  document.getElementById('dash-' + tab).classList.add('active-tab');
  el.classList.add('active');
}

async function saveProfile() {
  const inputs = document.querySelectorAll('#dash-profile input, #dash-profile select');
  const payload = {
    first_name:  inputs[0]?.value.trim(),
    last_name:   inputs[1]?.value.trim(),
    phone:       inputs[3]?.value.trim(),
    nationality: inputs[4]?.value,
    passport_no: inputs[5]?.value.trim(),
  };
  try {
    const res  = await fetch(`${API}/api/user/profile`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      state.currentUser = data.user;
      updateNavForUser(data.user);
      document.querySelector('.dash-name').textContent = `${data.user.first_name} ${data.user.last_name}`;
      showToast('Profile saved successfully!', 'success');
    } else {
      showToast(data.error || 'Could not save profile.', 'error');
    }
  } catch {
    showToast('Network error.', 'error');
  }
}

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast${type ? ' ' + type : ''}`;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}
