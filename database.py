import sqlite3
import os
from datetime import datetime, timedelta
import random

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dairy_farm.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Milk sales & production
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS milk_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shift TEXT DEFAULT 'Morning',
        quantity_liters REAL NOT NULL,
        price_per_liter REAL NOT NULL,
        total_amount REAL NOT NULL,
        fat_percentage REAL,
        snf_percentage REAL,
        buyer_name TEXT DEFAULT 'Local Dairy',
        payment_status TEXT DEFAULT 'Paid',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Feed purchases
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS feed_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        feed_type TEXT NOT NULL,
        item_name TEXT NOT NULL,
        quantity_kg REAL DEFAULT 0,
        cost REAL NOT NULL,
        supplier TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # General expenses & Capital Investments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'Operational', -- 'Operational' or 'Capital Investment'
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_mode TEXT DEFAULT 'Cash',
        feed_purchase_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_purchase_id) REFERENCES feed_purchases(id) ON DELETE CASCADE
    )
    """)

    # Business profile & settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # Default settings if empty
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_symbol', '₹')")
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('farm_name', 'Kamdhenu Cow Milk Dairy')")
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_milk_rate', '45')")

    # Authorized users for role-based access control
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS authorized_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'Staff', -- 'Owner', 'Admin', 'Staff'
        photo_url TEXT,
        added_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Migrate columns if not present
    for table in ['milk_sales', 'feed_purchases', 'expenses']:
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [c['name'] for c in cursor.fetchall()]
        if 'receipt_image' not in columns:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN receipt_image TEXT")

    conn.commit()
    conn.close()

# ----------------- MILK SALES CRUD ----------------- #

def add_milk_sale(data):
    conn = get_db()
    cursor = conn.cursor()
    quantity = float(data.get('quantity_liters', 0))
    price = float(data.get('price_per_liter', 0))
    total = round(quantity * price, 2)
    fat = float(data['fat_percentage']) if data.get('fat_percentage') not in (None, '', 'null') else None
    snf = float(data['snf_percentage']) if data.get('snf_percentage') not in (None, '', 'null') else None
    receipt = data.get('receipt_image')

    cursor.execute("""
        INSERT INTO milk_sales (date, shift, quantity_liters, price_per_liter, total_amount, fat_percentage, snf_percentage, buyer_name, payment_status, notes, receipt_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get('date', datetime.now().strftime('%Y-%m-%d')),
        data.get('shift', 'Morning'),
        quantity,
        price,
        total,
        fat,
        snf,
        data.get('buyer_name', 'Local Dairy'),
        data.get('payment_status', 'Paid'),
        data.get('notes', ''),
        receipt
    ))
    sale_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return sale_id

def get_milk_sales(limit=100, start_date=None, end_date=None):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM milk_sales WHERE 1=1"
    params = []
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    query += " ORDER BY date DESC, id DESC LIMIT ?"
    params.append(limit)
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def delete_milk_sale(sale_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM milk_sales WHERE id = ?", (sale_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- FEED PURCHASES CRUD ----------------- #

def add_feed_purchase(data):
    conn = get_db()
    cursor = conn.cursor()
    cost = float(data.get('cost', 0))
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    feed_type = data.get('feed_type', 'Cattle Feed / Concentrate')
    item_name = data.get('item_name', 'Cow Feed')
    qty_kg = float(data.get('quantity_kg', 0))
    supplier = data.get('supplier', '')
    notes = data.get('notes', '')
    receipt = data.get('receipt_image')

    cursor.execute("""
        INSERT INTO feed_purchases (date, feed_type, item_name, quantity_kg, cost, supplier, notes, receipt_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (date, feed_type, item_name, qty_kg, cost, supplier, notes, receipt))
    feed_id = cursor.lastrowid

    # Automatically log as an Operational Expense under Cow Feed category
    desc = f"Feed Purchase: {item_name} ({feed_type})"
    if qty_kg > 0:
        desc += f" - {qty_kg} kg"
    if supplier:
        desc += f" from {supplier}"

    cursor.execute("""
        INSERT INTO expenses (date, type, category, description, amount, payment_mode, feed_purchase_id, receipt_image)
        VALUES (?, 'Operational', 'Cow Feed', ?, ?, ?, ?, ?)
    """, (date, desc, cost, data.get('payment_mode', 'Cash'), feed_id, receipt))

    conn.commit()
    conn.close()
    return feed_id

def get_feed_purchases(limit=100, start_date=None, end_date=None):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM feed_purchases WHERE 1=1"
    params = []
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    query += " ORDER BY date DESC, id DESC LIMIT ?"
    params.append(limit)
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def delete_feed_purchase(feed_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses WHERE feed_purchase_id = ?", (feed_id,))
    cursor.execute("DELETE FROM feed_purchases WHERE id = ?", (feed_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- EXPENSES & INVESTMENTS CRUD ----------------- #

def add_expense(data):
    conn = get_db()
    cursor = conn.cursor()
    amount = float(data.get('amount', 0))
    exp_type = data.get('type', 'Operational')  # 'Operational' or 'Capital Investment'
    category = data.get('category', 'Miscellaneous')
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    desc = data.get('description', '')
    mode = data.get('payment_mode', 'Cash')
    receipt = data.get('receipt_image')

    cursor.execute("""
        INSERT INTO expenses (date, type, category, description, amount, payment_mode, receipt_image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (date, exp_type, category, desc, amount, mode, receipt))
    exp_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return exp_id

def get_expenses(limit=100, start_date=None, end_date=None, exp_type=None):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM expenses WHERE 1=1"
    params = []
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    if exp_type:
        query += " AND type = ?"
        params.append(exp_type)
    query += " ORDER BY date DESC, id DESC LIMIT ?"
    params.append(limit)
    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def delete_expense(exp_id):
    conn = get_db()
    cursor = conn.cursor()
    # Check if tied to feed purchase
    cursor.execute("SELECT feed_purchase_id FROM expenses WHERE id = ?", (exp_id,))
    row = cursor.fetchone()
    if row and row['feed_purchase_id']:
        cursor.execute("DELETE FROM feed_purchases WHERE id = ?", (row['feed_purchase_id'],))
    cursor.execute("DELETE FROM expenses WHERE id = ?", (exp_id,))
    conn.commit()
    conn.close()
    return True

# ----------------- DASHBOARD & ANALYTICS ----------------- #

def get_dashboard_summary(view_level='monthly', target_date=None, start_date=None, end_date=None):
    """
    view_level: 'daily', 'monthly', 'yearly', or 'custom'
    target_date: date string 'YYYY-MM-DD', 'YYYY-MM', or 'YYYY'
    """
    conn = get_db()
    cursor = conn.cursor()

    today_str = datetime.now().strftime('%Y-%m-%d')
    if not target_date:
        target_date = today_str

    if view_level == 'daily':
        # Default target_date to full YYYY-MM-DD
        d_str = target_date[:10]
        date_filter_milk = "date = ?"
        date_filter_exp = "date = ?"
        params_milk = [d_str]
        params_exp = [d_str]
        period_label = f"Day: {d_str}"
    elif view_level == 'monthly':
        # target_date format YYYY-MM
        m_str = target_date[:7]
        date_filter_milk = "strftime('%Y-%m', date) = ?"
        date_filter_exp = "strftime('%Y-%m', date) = ?"
        params_milk = [m_str]
        params_exp = [m_str]
        period_label = f"Month: {m_str}"
    elif view_level == 'yearly':
        y_str = target_date[:4]
        date_filter_milk = "strftime('%Y', date) = ?"
        date_filter_exp = "strftime('%Y', date) = ?"
        params_milk = [y_str]
        params_exp = [y_str]
        period_label = f"Year: {y_str}"
    elif view_level == 'custom' and start_date and end_date:
        date_filter_milk = "date BETWEEN ? AND ?"
        date_filter_exp = "date BETWEEN ? AND ?"
        params_milk = [start_date, end_date]
        params_exp = [start_date, end_date]
        period_label = f"Range: {start_date} to {end_date}"
    else:
        # fallback to all time
        date_filter_milk = "1=1"
        date_filter_exp = "1=1"
        params_milk = []
        params_exp = []
        period_label = "All Time"

    # 1. Milk Revenue & Production Stats
    cursor.execute(f"""
        SELECT 
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(SUM(quantity_liters), 0) as total_liters,
            COALESCE(AVG(price_per_liter), 0) as avg_price_per_liter,
            AVG(CASE WHEN fat_percentage > 0 THEN fat_percentage ELSE NULL END) as avg_fat,
            COUNT(*) as total_entries
        FROM milk_sales
        WHERE {date_filter_milk}
    """, params_milk)
    milk_stats = dict(cursor.fetchone())

    # 2. Expenses - Operational vs Capital Investment
    cursor.execute(f"""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'Operational' THEN amount ELSE 0 END), 0) as total_operational_exp,
            COALESCE(SUM(CASE WHEN type = 'Capital Investment' THEN amount ELSE 0 END), 0) as total_capital_investment,
            COALESCE(SUM(amount), 0) as total_all_exp
        FROM expenses
        WHERE {date_filter_exp}
    """, params_exp)
    exp_stats = dict(cursor.fetchone())

    # 3. Cow Feed specific cost
    cursor.execute(f"""
        SELECT COALESCE(SUM(amount), 0) as feed_exp
        FROM expenses
        WHERE category = 'Cow Feed' AND {date_filter_exp}
    """, params_exp)
    feed_exp = cursor.fetchone()['feed_exp']

    # Calculations
    revenue = float(milk_stats['total_revenue'])
    op_exp = float(exp_stats['total_operational_exp'])
    investment = float(exp_stats['total_capital_investment'])
    total_liters = float(milk_stats['total_liters'])

    net_profit = round(revenue - op_exp, 2)
    profit_margin = round((net_profit / revenue * 100), 1) if revenue > 0 else 0.0
    feed_cost_per_liter = round((feed_exp / total_liters), 2) if total_liters > 0 else 0.0
    cost_per_liter = round((op_exp / total_liters), 2) if total_liters > 0 else 0.0

    # 4. Expense Breakdown by Category
    cursor.execute(f"""
        SELECT category, SUM(amount) as total, type
        FROM expenses
        WHERE {date_filter_exp}
        GROUP BY category
        ORDER BY total DESC
    """, params_exp)
    category_breakdown = [dict(r) for r in cursor.fetchall()]

    # 5. Trend Chart Data (Depends on view_level)
    chart_data = get_trend_chart_data(cursor, view_level, target_date, start_date, end_date)

    conn.close()

    return {
        'period_label': period_label,
        'view_level': view_level,
        'revenue': revenue,
        'operational_expenses': op_exp,
        'capital_investment': investment,
        'total_expenditure': op_exp + investment,
        'net_profit': net_profit,
        'profit_margin_pct': profit_margin,
        'total_liters': round(total_liters, 2),
        'avg_price_per_liter': round(float(milk_stats['avg_price_per_liter']), 2),
        'avg_fat': round(float(milk_stats['avg_fat']), 2) if milk_stats['avg_fat'] is not None else None,
        'feed_expense': feed_exp,
        'feed_cost_per_liter': feed_cost_per_liter,
        'cost_per_liter': cost_per_liter,
        'total_entries': milk_stats['total_entries'],
        'category_breakdown': category_breakdown,
        'chart_data': chart_data
    }

def get_trend_chart_data(cursor, view_level, target_date, start_date=None, end_date=None):
    labels = []
    revenues = []
    operational_exps = []
    investments = []
    liters = []

    if view_level == 'daily':
        # Show recent 7 days leading up to target_date
        base = datetime.strptime(target_date[:10], '%Y-%m-%d')
        days = [(base - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(6, -1, -1)]
        for d in days:
            labels.append(datetime.strptime(d, '%Y-%m-%d').strftime('%d %b'))
            # Rev & liters
            cursor.execute("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(quantity_liters), 0) FROM milk_sales WHERE date = ?", (d,))
            r, l = cursor.fetchone()
            revenues.append(round(r, 2))
            liters.append(round(l, 2))

            # Expenses
            cursor.execute("SELECT COALESCE(SUM(CASE WHEN type='Operational' THEN amount ELSE 0 END), 0), COALESCE(SUM(CASE WHEN type='Capital Investment' THEN amount ELSE 0 END), 0) FROM expenses WHERE date = ?", (d,))
            op, inv = cursor.fetchone()
            operational_exps.append(round(op, 2))
            investments.append(round(inv, 2))

    elif view_level == 'monthly':
        # Show all days of that month
        year, month = map(int, target_date[:7].split('-'))
        import calendar
        _, num_days = calendar.monthrange(year, month)
        for day in range(1, num_days + 1):
            d_str = f"{year:04d}-{month:02d}-{day:02d}"
            labels.append(str(day))
            cursor.execute("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(quantity_liters), 0) FROM milk_sales WHERE date = ?", (d_str,))
            r, l = cursor.fetchone()
            revenues.append(round(r, 2))
            liters.append(round(l, 2))

            cursor.execute("SELECT COALESCE(SUM(CASE WHEN type='Operational' THEN amount ELSE 0 END), 0), COALESCE(SUM(CASE WHEN type='Capital Investment' THEN amount ELSE 0 END), 0) FROM expenses WHERE date = ?", (d_str,))
            op, inv = cursor.fetchone()
            operational_exps.append(round(op, 2))
            investments.append(round(inv, 2))

    elif view_level == 'yearly':
        # Show 12 months of that year
        year = target_date[:4]
        month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        for idx, m_name in enumerate(month_names, start=1):
            m_str = f"{year}-{idx:02d}"
            labels.append(m_name)
            cursor.execute("SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(quantity_liters), 0) FROM milk_sales WHERE strftime('%Y-%m', date) = ?", (m_str,))
            r, l = cursor.fetchone()
            revenues.append(round(r, 2))
            liters.append(round(l, 2))

            cursor.execute("SELECT COALESCE(SUM(CASE WHEN type='Operational' THEN amount ELSE 0 END), 0), COALESCE(SUM(CASE WHEN type='Capital Investment' THEN amount ELSE 0 END), 0) FROM expenses WHERE strftime('%Y-%m', date) = ?", (m_str,))
            op, inv = cursor.fetchone()
            operational_exps.append(round(op, 2))
            investments.append(round(inv, 2))

    else:
        # Custom or fallback
        cursor.execute("""
            SELECT date, SUM(total_amount) as rev, SUM(quantity_liters) as lit 
            FROM milk_sales 
            GROUP BY date 
            ORDER BY date DESC LIMIT 15
        """)
        rows = list(reversed(cursor.fetchall()))
        for row in rows:
            labels.append(row['date'][5:])
            revenues.append(round(row['rev'], 2))
            liters.append(round(row['lit'], 2))
            cursor.execute("SELECT COALESCE(SUM(CASE WHEN type='Operational' THEN amount ELSE 0 END), 0), COALESCE(SUM(CASE WHEN type='Capital Investment' THEN amount ELSE 0 END), 0) FROM expenses WHERE date = ?", (row['date'],))
            op, inv = cursor.fetchone()
            operational_exps.append(round(op, 2))
            investments.append(round(inv, 2))

    return {
        'labels': labels,
        'revenues': revenues,
        'operational_expenses': operational_exps,
        'investments': investments,
        'liters': liters
    }

# ----------------- SEED SAMPLE DATA ----------------- #

def seed_sample_data():
    """Generates 30 days of realistic dairy farm data for instant preview"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if data already exists
    cursor.execute("SELECT COUNT(*) as count FROM milk_sales")
    if cursor.fetchone()['count'] > 0:
        conn.close()
        return False

    today = datetime.now()
    buyers = ['Mother Dairy Center', 'Heritage Milk Co.', 'Amul Dairy Collection', 'Shree Krishna Sweet House', 'Local Colony Residents']
    feed_items = [
        ('Concentrate Feed', 'Sudharshan Premium Cattle Feed 50kg', 50, 1450, 'Kisan Agro Store'),
        ('Dry Fodder / Hay', 'Wheat Straw / Bhusa (Trolley)', 400, 2800, 'Ramesh Kisan Trader'),
        ('Green Fodder', 'Fresh Napier Grass & Maize Fodder', 300, 1200, 'Greenfields Farm'),
        ('Silage', 'Corn Maize Silage Bale', 100, 950, 'Dairy Agro Feeds'),
        ('Mineral Mixture / Calcium', 'Chelated Mineral Mixture + Calcium 5kg', 5, 650, 'Vet Care Medicals'),
        ('Cottonseed Cake', 'Pure Cottonseed Khal 50kg', 50, 1850, 'Kisan Agro Store')
    ]

    other_expenses = [
        ('Operational', 'Veterinary & Medicine', 'Deworming & Vaccination for 8 cows', 1200, 'Cash'),
        ('Operational', 'Veterinary & Medicine', 'Doctor visit & calcium supplement injection', 800, 'UPI / Online'),
        ('Operational', 'Labor & Wages', 'Farm helper weekly salary', 3500, 'Cash'),
        ('Operational', 'Labor & Wages', 'Milking assistant bi-weekly wages', 4000, 'Cash'),
        ('Operational', 'Electricity & Water', 'Tubewell electricity bill for dairy shed', 2200, 'UPI / Online'),
        ('Operational', 'Transport & Fuel', 'Diesel for milk delivery bike/van', 950, 'Cash'),
        ('Operational', 'Repairs & Maintenance', 'Milking machine pipe replacement and service', 650, 'Cash'),
        ('Operational', 'Cleaning & Sanitization', 'Disinfectant phenyl, teat dip & washing soap', 450, 'Cash'),
        ('Capital Investment', 'Cattle Purchase (Cows/Calves)', 'Purchased 1 high-yielding HF cross cow (18L/day)', 65000, 'Bank Transfer'),
        ('Capital Investment', 'Machinery & Equipment', 'Installed 2-bucket automatic milking machine', 32000, 'Bank Transfer'),
        ('Capital Investment', 'Shed & Infrastructure', 'Installed cow rubber mats and mist cooling fans', 14500, 'Bank Transfer')
    ]

    # Generate 30 days of data
    for i in range(29, -1, -1):
        day_date = (today - timedelta(days=i)).strftime('%Y-%m-%d')
        
        # Morning milk
        m_liters = round(random.uniform(42.0, 52.0), 1)
        m_rate = 48.0
        m_fat = round(random.uniform(3.9, 4.4), 1)
        m_buyer = random.choice(buyers)
        cursor.execute("""
            INSERT INTO milk_sales (date, shift, quantity_liters, price_per_liter, total_amount, fat_percentage, snf_percentage, buyer_name, payment_status, notes)
            VALUES (?, 'Morning', ?, ?, ?, ?, 8.5, ?, 'Paid', 'Morning collection')
        """, (day_date, m_liters, m_rate, round(m_liters * m_rate, 2), m_fat, m_buyer))

        # Evening milk
        e_liters = round(random.uniform(36.0, 44.0), 1)
        e_rate = 48.0
        e_fat = round(random.uniform(4.0, 4.6), 1)
        e_buyer = random.choice(buyers)
        cursor.execute("""
            INSERT INTO milk_sales (date, shift, quantity_liters, price_per_liter, total_amount, fat_percentage, snf_percentage, buyer_name, payment_status, notes)
            VALUES (?, 'Evening', ?, ?, ?, ?, 8.6, ?, 'Paid', 'Evening collection')
        """, (day_date, e_liters, e_rate, round(e_liters * e_rate, 2), e_fat, e_buyer))

        # Random feed purchases every 4-5 days
        if i % 4 == 0:
            feed = random.choice(feed_items)
            cursor.execute("""
                INSERT INTO feed_purchases (date, feed_type, item_name, quantity_kg, cost, supplier, notes)
                VALUES (?, ?, ?, ?, ?, ?, 'Routine stock replenishment')
            """, (day_date, feed[0], feed[1], feed[2], feed[3], feed[4]))
            fid = cursor.lastrowid
            
            cursor.execute("""
                INSERT INTO expenses (date, type, category, description, amount, payment_mode, feed_purchase_id)
                VALUES (?, 'Operational', 'Cow Feed', ?, ?, 'Cash', ?)
            """, (day_date, f"{feed[1]} ({feed[2]}kg)", feed[3], fid))

        # Random general expenses every 5-7 days
        if i % 6 == 0 and other_expenses:
            exp = other_expenses.pop(0)
            cursor.execute("""
                INSERT INTO expenses (date, type, category, description, amount, payment_mode)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (day_date, exp[0], exp[1], exp[2], exp[3], exp[4]))

    # Insert remaining capital investments at start of month
    for exp in other_expenses:
        inv_date = (today - timedelta(days=25)).strftime('%Y-%m-%d')
        cursor.execute("""
            INSERT INTO expenses (date, type, category, description, amount, payment_mode)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (inv_date, exp[0], exp[1], exp[2], exp[3], exp[4]))

    conn.commit()
    conn.close()
    return True

def reset_all_data():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM milk_sales")
    cursor.execute("DELETE FROM expenses")
    cursor.execute("DELETE FROM feed_purchases")
    conn.commit()
    conn.close()
    return True

# ----------------- ACCESS MANAGEMENT & USERS ----------------- #

def get_authorized_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM authorized_users ORDER BY role = 'Owner' DESC, role = 'Admin' DESC, created_at ASC")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users

def add_or_update_authorized_user(email, name="", role="Staff", photo_url="", added_by=""):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.strip().lower()
    
    # If no users exist yet, first user automatically becomes Owner
    cursor.execute("SELECT COUNT(*) as count FROM authorized_users")
    count = cursor.fetchone()['count']
    if count == 0:
        role = 'Owner'
        
    cursor.execute("""
        INSERT INTO authorized_users (email, name, role, photo_url, added_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            name = CASE WHEN excluded.name != '' THEN excluded.name ELSE authorized_users.name END,
            role = CASE WHEN authorized_users.role = 'Owner' THEN 'Owner' ELSE excluded.role END,
            photo_url = CASE WHEN excluded.photo_url != '' THEN excluded.photo_url ELSE authorized_users.photo_url END
    """, (email_clean, name, role, photo_url, added_by))
    conn.commit()
    conn.close()
    return True

def delete_authorized_user(email):
    conn = get_db()
    cursor = conn.cursor()
    email_clean = email.strip().lower()
    cursor.execute("SELECT role FROM authorized_users WHERE email = ?", (email_clean,))
    row = cursor.fetchone()
    if row and row['role'] == 'Owner':
        conn.close()
        return False, "Cannot delete Primary Owner"
    cursor.execute("DELETE FROM authorized_users WHERE email = ?", (email_clean,))
    conn.commit()
    conn.close()
    return True, "User removed"

def get_user_role(email):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM authorized_users")
    count = cursor.fetchone()['count']
    if count == 0:
        conn.close()
        return "Owner"
        
    cursor.execute("SELECT role, name FROM authorized_users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row['role']
    return None

