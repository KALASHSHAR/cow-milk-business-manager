import os
import csv
import io
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, send_from_directory, Response
import database as db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf'}

app = Flask(__name__, static_folder="static")
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Initialize database tables
db.init_db()

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/upload-receipt', methods=['POST'])
def upload_receipt():
    if 'receipt' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400
    file = request.files['receipt']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        unique_name = f"receipt_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        return jsonify({'success': True, 'filename': unique_name, 'url': f'/uploads/{unique_name}'})
    return jsonify({'success': False, 'error': 'Invalid file format. Allowed: JPG, PNG, WEBP, PDF'}), 400

# ----------------- DASHBOARD API ----------------- #

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    level = request.args.get('level', 'monthly')  # 'daily', 'monthly', 'yearly', 'custom'
    target_date = request.args.get('target_date', datetime.now().strftime('%Y-%m-%d'))
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    data = db.get_dashboard_summary(
        view_level=level,
        target_date=target_date,
        start_date=start_date,
        end_date=end_date
    )
    return jsonify({'success': True, 'data': data})

# ----------------- MILK SALES API ----------------- #

@app.route('/api/milk', methods=['GET'])
def get_milk_sales():
    limit = int(request.args.get('limit', 100))
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    rows = db.get_milk_sales(limit=limit, start_date=start_date, end_date=end_date)
    return jsonify({'success': True, 'records': rows})

@app.route('/api/milk', methods=['POST'])
def add_milk_sale():
    data = request.json or {}
    try:
        qty = float(data.get('quantity_liters', 0))
        price = float(data.get('price_per_liter', 0))
        if qty <= 0 or price <= 0:
            return jsonify({'success': False, 'error': 'Quantity and price must be greater than 0'}), 400
        
        sale_id = db.add_milk_sale(data)
        return jsonify({'success': True, 'id': sale_id, 'message': 'Milk sale recorded successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/milk/<int:sale_id>', methods=['DELETE'])
def delete_milk_sale(sale_id):
    db.delete_milk_sale(sale_id)
    return jsonify({'success': True, 'message': 'Milk sale deleted'})

# ----------------- FEED PURCHASES API ----------------- #

@app.route('/api/feed', methods=['GET'])
def get_feed_purchases():
    limit = int(request.args.get('limit', 100))
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    rows = db.get_feed_purchases(limit=limit, start_date=start_date, end_date=end_date)
    return jsonify({'success': True, 'records': rows})

@app.route('/api/feed', methods=['POST'])
def add_feed_purchase():
    data = request.json or {}
    try:
        cost = float(data.get('cost', 0))
        if cost <= 0:
            return jsonify({'success': False, 'error': 'Feed cost must be greater than 0'}), 400
        
        feed_id = db.add_feed_purchase(data)
        return jsonify({'success': True, 'id': feed_id, 'message': 'Feed purchase recorded successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/feed/<int:feed_id>', methods=['DELETE'])
def delete_feed_purchase(feed_id):
    db.delete_feed_purchase(feed_id)
    return jsonify({'success': True, 'message': 'Feed purchase deleted'})

# ----------------- EXPENSES API ----------------- #

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    limit = int(request.args.get('limit', 100))
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    exp_type = request.args.get('type')
    rows = db.get_expenses(limit=limit, start_date=start_date, end_date=end_date, exp_type=exp_type)
    return jsonify({'success': True, 'records': rows})

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    data = request.json or {}
    try:
        amount = float(data.get('amount', 0))
        if amount <= 0:
            return jsonify({'success': False, 'error': 'Amount must be greater than 0'}), 400
        
        exp_id = db.add_expense(data)
        return jsonify({'success': True, 'id': exp_id, 'message': 'Expense/Investment recorded successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/expenses/<int:exp_id>', methods=['DELETE'])
def delete_expense(exp_id):
    db.delete_expense(exp_id)
    return jsonify({'success': True, 'message': 'Expense deleted'})

# ----------------- DATA SEED & RESET ----------------- #

@app.route('/api/seed', methods=['POST'])
def seed_data():
    res = db.seed_sample_data()
    if res:
        return jsonify({'success': True, 'message': 'Sample dairy data seeded successfully!'})
    else:
        return jsonify({'success': False, 'message': 'Database already has records. Reset first if you want fresh demo data.'})

@app.route('/api/reset', methods=['POST'])
def reset_data():
    db.reset_all_data()
    return jsonify({'success': True, 'message': 'All transactions have been reset.'})

# ----------------- EXPORT TO CSV ----------------- #

@app.route('/api/export/csv', methods=['GET'])
def export_csv():
    report_type = request.args.get('type', 'milk')  # 'milk' or 'expenses'
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == 'milk':
        writer.writerow(['ID', 'Date', 'Shift', 'Liters', 'Price Per Liter', 'Total Amount', 'Fat %', 'SNF %', 'Buyer', 'Status', 'Notes'])
        sales = db.get_milk_sales(limit=10000)
        for s in sales:
            writer.writerow([
                s['id'], s['date'], s['shift'], s['quantity_liters'], s['price_per_liter'],
                s['total_amount'], s['fat_percentage'] or '', s['snf_percentage'] or '',
                s['buyer_name'], s['payment_status'], s['notes'] or ''
            ])
        filename = f"milk_sales_report_{datetime.now().strftime('%Y%m%d')}.csv"
    else:
        writer.writerow(['ID', 'Date', 'Type', 'Category', 'Description', 'Amount', 'Payment Mode'])
        expenses = db.get_expenses(limit=10000)
        for e in expenses:
            writer.writerow([
                e['id'], e['date'], e['type'], e['category'], e['description'],
                e['amount'], e['payment_mode']
            ])
        filename = f"expenses_and_investments_report_{datetime.now().strftime('%Y%m%d')}.csv"

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )

# ----------------- ACCESS MANAGEMENT API ----------------- #

@app.route('/api/access/users', methods=['GET'])
def api_get_authorized_users():
    users = db.get_authorized_users()
    return jsonify({"success": True, "users": users})

@app.route('/api/access/users', methods=['POST'])
def api_add_authorized_user():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email is required"}), 400
    name = data.get('name', '')
    role = data.get('role', 'Founder')
    photo_url = data.get('photo_url', '')
    added_by = data.get('added_by', '')
    db.add_or_update_authorized_user(email, name, role, photo_url, added_by)
    return jsonify({"success": True, "message": f"User {email} authorized as {role}"})

@app.route('/api/access/users/<email>', methods=['DELETE'])
def api_delete_authorized_user(email):
    success, msg = db.delete_authorized_user(email)
    if not success:
        return jsonify({"success": False, "error": msg}), 400
    return jsonify({"success": True, "message": msg})

@app.route('/api/access/check', methods=['POST'])
def api_check_user_access():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    role = db.get_user_role(email)
    return jsonify({"success": True, "role": role, "authorized": role is not None})

# Partner Capital Investments
@app.route('/api/partner-investments', methods=['GET'])
def api_get_partner_investments():
    try:
        inv = db.get_partner_investments()
        return jsonify({"success": True, "data": inv})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/partner-investments', methods=['POST'])
def api_save_partner_investments():
    try:
        req = request.get_json() or {}
        kalash = float(req.get('kalash', 0) or 0)
        sandesh = float(req.get('sandesh', 0) or 0)
        yash = float(req.get('yash', 0) or 0)
        notes = str(req.get('notes', '') or '')
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        data = {
            'kalash': kalash,
            'sandesh': sandesh,
            'yash': yash,
            'notes': notes,
            'updated_at': now_str
        }
        saved = db.save_partner_investments(data)
        return jsonify({"success": True, "data": saved})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

if __name__ == '__main__':
    print("============================================================")
    print("Cow Milk Business Manager is starting on http://localhost:5000")
    print("============================================================")
    app.run(host='0.0.0.0', port=5000, debug=False)
