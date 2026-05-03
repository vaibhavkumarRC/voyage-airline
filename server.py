from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
import sqlite3, hashlib, uuid, os, json
import urllib.request, urllib.error
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__, static_folder='.')
app.secret_key = 'voyage-secret-key-2026-xK9pL'
app.permanent_session_lifetime = timedelta(days=7)
CORS(app, supports_credentials=True)

DB_PATH = os.path.join(os.path.dirname(__file__), 'voyage.db')

# ── Database ──────────────────────────────────────────────────────
def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with get_db() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name    TEXT NOT NULL,
                last_name     TEXT NOT NULL,
                email         TEXT UNIQUE NOT NULL,
                phone         TEXT DEFAULT '',
                password_hash TEXT NOT NULL,
                nationality   TEXT DEFAULT 'Indian',
                passport_no   TEXT DEFAULT '',
                created_at    TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS bookings (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                booking_ref TEXT UNIQUE NOT NULL,
                airline     TEXT NOT NULL,
                flight_no   TEXT NOT NULL,
                from_city   TEXT NOT NULL,
                to_city     TEXT NOT NULL,
                from_code   TEXT NOT NULL,
                to_code     TEXT NOT NULL,
                dep_date    TEXT NOT NULL,
                dep_time    TEXT NOT NULL,
                arr_time    TEXT NOT NULL,
                duration    TEXT NOT NULL,
                cabin_class TEXT DEFAULT 'Economy',
                seat        TEXT DEFAULT '',
                adults      INTEGER DEFAULT 1,
                base_fare   REAL NOT NULL,
                taxes       REAL NOT NULL,
                total       REAL NOT NULL,
                status      TEXT DEFAULT 'upcoming',
                created_at  TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        ''')

init_db()

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Not authenticated'}), 401
        return f(*args, **kwargs)
    return decorated

def row_to_dict(row):
    return dict(row) if row else None

# ── Auth ──────────────────────────────────────────────────────────
@app.route('/api/auth/register', methods=['POST'])
def register():
    d = request.get_json()
    if not d:
        return jsonify({'error': 'No data provided'}), 400
    first = d.get('first_name', '').strip()
    last  = d.get('last_name', '').strip()
    email = d.get('email', '').strip().lower()
    phone = d.get('phone', '').strip()
    pw    = d.get('password', '')
    if not all([first, last, email, pw]):
        return jsonify({'error': 'First name, last name, email and password are required'}), 400
    if len(pw) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    try:
        with get_db() as db:
            db.execute(
                'INSERT INTO users (first_name, last_name, email, phone, password_hash) VALUES (?,?,?,?,?)',
                (first, last, email, phone, hash_pw(pw))
            )
            db.commit()
            user = row_to_dict(db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone())
        session.permanent = True
        session['user_id'] = user['id']
        user.pop('password_hash', None)
        return jsonify({'success': True, 'user': user}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'An account with this email already exists'}), 409

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.get_json()
    if not d:
        return jsonify({'error': 'No data provided'}), 400
    email = d.get('email', '').strip().lower()
    pw    = d.get('password', '')
    if not email or not pw:
        return jsonify({'error': 'Email and password are required'}), 400
    with get_db() as db:
        user = row_to_dict(db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone())
    if not user or user['password_hash'] != hash_pw(pw):
        return jsonify({'error': 'Invalid email or password'}), 401
    session.permanent = True
    session['user_id'] = user['id']
    user.pop('password_hash', None)
    return jsonify({'success': True, 'user': user})

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    d = request.get_json()
    credential = (d or {}).get('credential', '')
    if not credential:
        return jsonify({'error': 'No credential provided'}), 400
    try:
        url = f'https://oauth2.googleapis.com/tokeninfo?id_token={credential}'
        with urllib.request.urlopen(url, timeout=5) as resp:
            info = json.loads(resp.read())
    except urllib.error.HTTPError:
        return jsonify({'error': 'Invalid Google token'}), 401
    except Exception:
        return jsonify({'error': 'Could not verify Google token'}), 500
    email = info.get('email', '').strip().lower()
    first = info.get('given_name', 'User')
    last  = info.get('family_name', '')
    if not email:
        return jsonify({'error': 'Could not get email from Google'}), 400
    with get_db() as db:
        user = row_to_dict(db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone())
        if not user:
            db.execute(
                'INSERT INTO users (first_name, last_name, email, password_hash) VALUES (?,?,?,?)',
                (first, last, email, hash_pw(uuid.uuid4().hex))
            )
            db.commit()
            user = row_to_dict(db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone())
    session.permanent = True
    session['user_id'] = user['id']
    user.pop('password_hash', None)
    return jsonify({'success': True, 'user': user})

@app.route('/api/auth/me', methods=['GET'])
@login_required
def me():
    with get_db() as db:
        user = row_to_dict(db.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone())
    if not user:
        session.clear()
        return jsonify({'error': 'User not found'}), 404
    user.pop('password_hash', None)
    return jsonify({'user': user})

# ── User Profile ──────────────────────────────────────────────────
@app.route('/api/user/profile', methods=['PUT'])
@login_required
def update_profile():
    d = request.get_json()
    if not d:
        return jsonify({'error': 'No data'}), 400
    fields = ['first_name', 'last_name', 'phone', 'nationality', 'passport_no']
    updates, values = [], []
    for f in fields:
        if f in d:
            updates.append(f'{f}=?')
            values.append(d[f])
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400
    values.append(session['user_id'])
    with get_db() as db:
        db.execute(f"UPDATE users SET {','.join(updates)} WHERE id=?", values)
        db.commit()
        user = row_to_dict(db.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone())
    user.pop('password_hash', None)
    return jsonify({'success': True, 'user': user})

@app.route('/api/user/change-password', methods=['PUT'])
@login_required
def change_password():
    d = request.get_json()
    old_pw = d.get('old_password', '')
    new_pw = d.get('new_password', '')
    if not old_pw or not new_pw:
        return jsonify({'error': 'Both passwords required'}), 400
    if len(new_pw) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400
    with get_db() as db:
        user = row_to_dict(db.execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone())
        if user['password_hash'] != hash_pw(old_pw):
            return jsonify({'error': 'Current password is incorrect'}), 401
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (hash_pw(new_pw), session['user_id']))
        db.commit()
    return jsonify({'success': True})

# ── Bookings ──────────────────────────────────────────────────────
@app.route('/api/bookings', methods=['GET'])
@login_required
def get_bookings():
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM bookings WHERE user_id=? ORDER BY created_at DESC',
            (session['user_id'],)
        ).fetchall()
    return jsonify({'bookings': [row_to_dict(r) for r in rows]})

@app.route('/api/bookings', methods=['POST'])
@login_required
def create_booking():
    d = request.get_json()
    if not d:
        return jsonify({'error': 'No data'}), 400
    required = ['airline','flight_no','from_city','to_city','from_code','to_code',
                'dep_date','dep_time','arr_time','duration','base_fare']
    missing = [r for r in required if not d.get(r)]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400
    base  = float(d['base_fare'])
    taxes = round(base * 0.16, 2)
    total = round(base + taxes, 2)
    ref   = 'VYG-' + datetime.now().strftime('%Y') + '-' + str(uuid.uuid4())[:8].upper()
    with get_db() as db:
        db.execute('''
            INSERT INTO bookings
              (user_id, booking_ref, airline, flight_no, from_city, to_city, from_code,
               to_code, dep_date, dep_time, arr_time, duration, cabin_class, seat,
               adults, base_fare, taxes, total, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            session['user_id'], ref,
            d['airline'], d['flight_no'],
            d['from_city'], d['to_city'],
            d['from_code'], d['to_code'],
            d['dep_date'], d['dep_time'], d['arr_time'], d['duration'],
            d.get('cabin_class', 'Economy'),
            d.get('seat', ''),
            int(d.get('adults', 1)),
            base, taxes, total, 'upcoming'
        ))
        db.commit()
        booking = row_to_dict(db.execute('SELECT * FROM bookings WHERE booking_ref=?', (ref,)).fetchone())
    return jsonify({'success': True, 'booking': booking}), 201

@app.route('/api/bookings/<ref>/cancel', methods=['PUT'])
@login_required
def cancel_booking(ref):
    with get_db() as db:
        row = db.execute('SELECT * FROM bookings WHERE booking_ref=? AND user_id=?',
                         (ref, session['user_id'])).fetchone()
        if not row:
            return jsonify({'error': 'Booking not found'}), 404
        db.execute("UPDATE bookings SET status='cancelled' WHERE booking_ref=?", (ref,))
        db.commit()
    return jsonify({'success': True})

# ── Static files ──────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    if os.path.exists(os.path.join(os.path.dirname(__file__), path)):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')

if __name__ == '__main__':
    print('\n  ✈  VOYAGE Airlines Server')
    print('  ──────────────────────────')
    port = int(os.environ.get('PORT', 8080))
    print(f'  Running at: http://localhost:{port}\n')
    app.run(debug=False, host='0.0.0.0', port=port)
