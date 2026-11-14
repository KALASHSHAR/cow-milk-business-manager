# 🐄 GauDhan - Cow Milk Business Management & Analytics Website

A complete, responsive web application designed specifically for **cow milk business owners** to record daily milk sales, attach receipt / payment slip photos, track feed purchases and farm expenses, and analyze revenue, investment, expenditure, and profit & loss on **daily, monthly, and yearly** levels.

---

## 🌟 Key Features

### 1. 📸 Receipt & Transaction Slip Photo Input (New!)
- **Daily Milk Slip**: Attach a photo of the dairy collection slip or receipt on mobile/camera or file picker.
- **Feed Bill / Invoice**: Attach invoices of cattle feed, hay, or supplement purchases.
- **Expense / UPI Receipt**: Attach payment receipts, veterinary bills, or UPI payment screenshots.
- **Interactive Lightbox**: Click "View Slip / Bill" in any transaction log to view, inspect, or download the high-resolution receipt image anytime.

### 2. 🥛 Daily Milk Sales & Production Entry
- **Quantity & Price**: Input daily milk volume in Liters and selling price per Liter (total amount auto-calculates in real-time).
- **Fat % (Optional)**: Record milk Fat percentage (e.g. 4.2%) and optional SNF percentage.
- **Shift Selection**: Morning ☀️, Evening 🌙, or Full Day collection.
- **Customer / Dairy Tagging**: Assign sales to specific buyers (e.g., Mother Dairy, Amul, sweet shops, local households).
- **Payment Status**: Track paid or pending amounts.

### 3. 🌾 Cow Feed Tracker
- Record feed purchases with specific categories:
  - Concentrates / Cattle Feed (e.g., Kapila, Sudharshan 50kg)
  - Dry Fodder / Hay / Bhusa (Wheat straw, paddy straw)
  - Green Fodder / Napier grass / Maize
  - Silage bales
  - Mineral mixtures & Calcium supplements
  - Cottonseed cake / Khal
- Automatically synchronizes with your operational expense ledger.

### 4. 💰 Multiple Expenses & Capital Investments
- Differentiates between:
  - **Operational Expenses (OPEX)**: Routine cow feed, doctor/veterinary visits, vaccinations, farm worker wages, electricity & water bills, milk delivery fuel, barn cleaning, and equipment maintenance.
  - **Capital Investments (CAPEX)**: Cow/heifer purchases, shed/barn construction, automatic milking machines, milk coolers, and borewells.
- Clear description and payment mode (Cash, UPI, Bank Transfer, Cheque).

### 5. 📊 Multi-Level Analytics Dashboard
- **Switchable Views**:
  - 📅 **Daily View**: Inspect exact day performance, compare with previous 7-day trend.
  - 🗓️ **Monthly View**: Month-to-date totals, day-by-day revenue vs expense vs profit progression.
  - 📈 **Yearly View**: 12-month financial breakdown, total annual revenue, costs, and profit margins.
  - 🎛️ **Custom Date Range**: Analyze any custom timeframe.
- **Key Performance Indicators (KPIs)**:
  - Total Revenue (₹)
  - Total Operational Expenses (₹)
  - Total Capital Investment (₹)
  - Net Profit / Loss (₹) with margin % badge
  - Total Liters Produced & Average Selling Rate (₹/L)
  - Average Milk Fat %
  - **Feed Cost per Liter** (Vital efficiency KPI for dairy farming)
- **Interactive Visual Charts**:
  - Multi-dataset Financial Trend Bar & Line Chart (Milk revenue, expenses, profit, liters)
  - Expense Category Distribution Donut Chart (Feed, labor, medical, utilities, etc.)

### 6. 📁 Transaction Logs & Data Export
- Searchable & filterable tables for Milk Sales, Cow Feed Stock, and Expenses.
- One-click export to **CSV format** for tax and bookkeeping records.
- Realistic **30-Day Demo Data Loader** for immediate testing.

---

## 🚀 How to Run Locally

### Option 1: Double-Click Launcher (Easiest for Windows)
Simply double-click the file:
```
run.bat
```
This automatically starts the backend server and opens your browser at `http://localhost:5000`.

### Option 2: Command Line
```bash
python app.py
```
Then visit:
```
http://localhost:5000
```

---

## 🌐 Deploy to GitHub & Cloud

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit of Cow Milk Business Manager"
git branch -M main
git remote add origin https://github.com/KALASHSHAR/cow-milk-business-manager.git
git push -u origin main
```

### 2. Free Cloud Hosting (Render / Railway / PythonAnywhere)
Because this application has a Python Flask backend, SQLite database, and image uploads:
- **Render.com**: Connect your GitHub repository, choose **Web Service**, set Build Command to `pip install -r requirements.txt` and Start Command to `gunicorn app:app`. (Included `render.yaml` handles this automatically!)
- **Railway.app** or **PythonAnywhere**: Free Python hosting with persistent storage.
