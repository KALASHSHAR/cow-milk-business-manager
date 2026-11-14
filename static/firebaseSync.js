// Firebase Cloud Manager for GauDhan Dairy ERP
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCYflBYBoSXJLmUETOvij3ylN-ZQi-bjFg",
  authDomain: "gaudhan-dairy.firebaseapp.com",
  projectId: "gaudhan-dairy",
  storageBucket: "gaudhan-dairy.firebasestorage.app",
  messagingSenderId: "780742131617",
  appId: "1:780742131617:web:7a8b83acd5a984d367d5e0",
  measurementId: "G-F7XWQPM9HJ"
};

const firebaseManager = {
  app: null,
  db: null,
  storage: null,
  connected: false,
  config: null,

  init() {
    const savedConfig = localStorage.getItem('gaudhan_firebase_config');
    let configToUse = null;
    if (savedConfig) {
      try {
        configToUse = JSON.parse(savedConfig);
      } catch (e) {
        console.error("Failed to parse saved Firebase config", e);
      }
    }
    if (!configToUse && DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.apiKey) {
      configToUse = DEFAULT_FIREBASE_CONFIG;
    }

    if (configToUse) {
      try {
        this.connect(configToUse);
      } catch (err) {
        console.warn("Auto-connect to Firebase failed, falling back to local mode", err);
      }
    }
    this.updateUI();
  },

  connect(config) {
    try {
      if (firebase.apps.length > 0) {
        this.app = firebase.apps[0];
      } else {
        this.app = firebase.initializeApp(config);
      }
      this.db = firebase.firestore();
      this.storage = firebase.storage();
      this.connected = true;
      this.config = config;
      localStorage.setItem('gaudhan_firebase_config', JSON.stringify(config));
      this.updateUI();
      return true;
    } catch (err) {
      console.error("Firebase connection failed:", err);
      this.connected = false;
      this.updateUI();
      throw err;
    }
  },

  disconnect() {
    this.connected = false;
    this.config = null;
    localStorage.removeItem('gaudhan_firebase_config');
    this.updateUI();
  },

  updateUI() {
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');
    const btn = document.getElementById('btn-cloud-status');
    const banner = document.getElementById('firebaseStatusBanner');
    const btnDisconnect = document.getElementById('btn-disconnect-firebase');
    const btnSyncModal = document.getElementById('btn-sync-modal');

    if (this.connected && this.config) {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (text) text.innerText = 'Cloud: Firebase (Connected)';
      if (btn) btn.className = 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all';
      
      if (banner) {
        banner.className = 'p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 flex items-center justify-between text-xs font-semibold';
        banner.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>Connected to Firebase Project: <strong>${this.config.projectId}</strong></span>
          </div>
          <span class="text-[11px] bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded-full">Cloud Active</span>
        `;
      }
      if (btnDisconnect) btnDisconnect.classList.remove('hidden');
      if (btnSyncModal) btnSyncModal.classList.remove('hidden');
    } else {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
      if (text) text.innerText = 'Connect Firebase Cloud';
      if (btn) btn.className = 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-300/30 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all';

      if (banner) {
        banner.className = 'p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 flex items-center justify-between text-xs font-semibold';
        banner.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Running in Local SQLite Mode</span>
          </div>
          <span class="text-[11px] bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full">Offline / Local</span>
        `;
      }
      if (btnDisconnect) btnDisconnect.classList.add('hidden');
      if (btnSyncModal) btnSyncModal.classList.add('hidden');
    }
  },

  // Upload receipt image to Firebase Cloud Storage with local fallback
  async uploadReceipt(file, folder = 'receipts') {
    if (!this.connected || !file) return null;
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
      const fileRef = this.storage.ref().child(filename);
      const snapshot = await fileRef.put(file);
      const downloadUrl = await snapshot.ref.getDownloadURL();
      return downloadUrl;
    } catch (err) {
      console.warn("Firebase Storage upload error, falling back:", err);
      // Fallback: try uploading to local server if available
      try {
        const formData = new FormData();
        formData.append('receipt', file);
        const res = await fetch('/api/upload-receipt', { method: 'POST', body: formData });
        const d = await res.json();
        if (d.success) return d.filename;
      } catch (localErr) {}
      return null;
    }
  },

  // ----------------- MILK SALES (FIRESTORE) ----------------- //

  async saveMilk(data, file) {
    let receiptUrl = data.receipt_image || null;
    if (file) {
      receiptUrl = await this.uploadReceipt(file, 'milk_receipts');
    }
    const docData = {
      date: data.date,
      shift: data.shift || 'Morning',
      quantity_liters: Number(data.quantity_liters),
      price_per_liter: Number(data.price_per_liter),
      total_amount: Math.round(Number(data.quantity_liters) * Number(data.price_per_liter) * 100) / 100,
      fat_percentage: data.fat_percentage ? Number(data.fat_percentage) : null,
      snf_percentage: data.snf_percentage ? Number(data.snf_percentage) : null,
      buyer_name: data.buyer_name || 'Local Dairy',
      notes: data.notes || '',
      receipt_image: receiptUrl,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await this.db.collection('milk_sales').add(docData);
    return docRef.id;
  },

  async getMilk(limitCount = 100) {
    const snapshot = await this.db.collection('milk_sales')
      .orderBy('date', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  },

  async deleteMilk(docId) {
    await this.db.collection('milk_sales').doc(docId).delete();
    return true;
  },

  // ----------------- FEED PURCHASES (FIRESTORE) ----------------- //

  async saveFeed(data, file) {
    let receiptUrl = data.receipt_image || null;
    if (file) {
      receiptUrl = await this.uploadReceipt(file, 'feed_receipts');
    }
    const cost = Number(data.cost);
    const qty = Number(data.quantity_kg || 0);
    const docData = {
      date: data.date,
      feed_type: data.feed_type,
      item_name: data.item_name,
      quantity_kg: qty,
      cost: cost,
      supplier: data.supplier || '',
      payment_mode: data.payment_mode || 'Cash',
      notes: data.notes || '',
      receipt_image: receiptUrl,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    const feedRef = await this.db.collection('feed_purchases').add(docData);

    // Auto-log to expenses collection
    let desc = `Feed Purchase: ${data.item_name} (${data.feed_type})`;
    if (qty > 0) desc += ` - ${qty} kg`;
    if (data.supplier) desc += ` from ${data.supplier}`;

    await this.db.collection('expenses').add({
      date: data.date,
      type: 'Operational',
      category: 'Cow Feed',
      description: desc,
      amount: cost,
      payment_mode: data.payment_mode || 'Cash',
      feed_purchase_id: feedRef.id,
      receipt_image: receiptUrl,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    return feedRef.id;
  },

  async getFeed(limitCount = 100) {
    const snapshot = await this.db.collection('feed_purchases')
      .orderBy('date', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  },

  async deleteFeed(docId) {
    // Delete linked expense
    const expSnapshot = await this.db.collection('expenses')
      .where('feed_purchase_id', '==', docId)
      .get();
    
    const batch = this.db.batch();
    expSnapshot.docs.forEach(d => batch.delete(d.ref));
    batch.delete(this.db.collection('feed_purchases').doc(docId));
    await batch.commit();
    return true;
  },

  // ----------------- EXPENSES & INVESTMENTS (FIRESTORE) ----------------- //

  async saveExpense(data, file) {
    let receiptUrl = data.receipt_image || null;
    if (file) {
      receiptUrl = await this.uploadReceipt(file, 'expense_receipts');
    }
    const docData = {
      date: data.date,
      type: data.type || 'Operational',
      category: data.category || 'Miscellaneous Farm Expense',
      description: data.description || '',
      amount: Number(data.amount),
      payment_mode: data.payment_mode || 'Cash',
      receipt_image: receiptUrl,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await this.db.collection('expenses').add(docData);
    return docRef.id;
  },

  async getExpenses(limitCount = 100) {
    const snapshot = await this.db.collection('expenses')
      .orderBy('date', 'desc')
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  },

  async deleteExpense(docId) {
    const docRef = this.db.collection('expenses').doc(docId);
    const doc = await docRef.get();
    if (doc.exists && doc.data().feed_purchase_id) {
      await this.db.collection('feed_purchases').doc(doc.data().feed_purchase_id).delete();
    }
    await docRef.delete();
    return true;
  },

  // ----------------- DASHBOARD & ANALYTICS (FIRESTORE) ----------------- //

  async getDashboardSummary(viewLevel, targetDate, startDate, endDate) {
    // Fetch all milk sales and expenses to aggregate
    const [milkSnap, expSnap] = await Promise.all([
      this.db.collection('milk_sales').get(),
      this.db.collection('expenses').get()
    ]);

    const allMilk = milkSnap.docs.map(d => d.data());
    const allExpenses = expSnap.docs.map(d => d.data());

    // Filter functions
    const isMatchingDate = (dateStr) => {
      if (!dateStr) return false;
      if (viewLevel === 'daily') {
        return dateStr === targetDate;
      } else if (viewLevel === 'monthly') {
        return dateStr.startsWith(targetDate.substring(0, 7));
      } else if (viewLevel === 'yearly') {
        return dateStr.startsWith(targetDate.substring(0, 4));
      } else if (viewLevel === 'custom' && startDate && endDate) {
        return dateStr >= startDate && dateStr <= endDate;
      }
      return true;
    };

    const filteredMilk = allMilk.filter(m => isMatchingDate(m.date));
    const filteredExpenses = allExpenses.filter(e => isMatchingDate(e.date));

    // Milk stats
    const totalRevenue = filteredMilk.reduce((sum, m) => sum + (Number(m.total_amount) || 0), 0);
    const totalLiters = filteredMilk.reduce((sum, m) => sum + (Number(m.quantity_liters) || 0), 0);
    const avgPrice = filteredMilk.length > 0 
      ? filteredMilk.reduce((sum, m) => sum + (Number(m.price_per_liter) || 0), 0) / filteredMilk.length 
      : 0;
    
    const fatList = filteredMilk.filter(m => m.fat_percentage > 0).map(m => Number(m.fat_percentage));
    const avgFat = fatList.length > 0 ? fatList.reduce((a, b) => a + b, 0) / fatList.length : null;

    // Expense stats
    const operationalExpenses = filteredExpenses
      .filter(e => e.type === 'Operational')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    
    const capitalInvestment = filteredExpenses
      .filter(e => e.type === 'Capital Investment')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const feedExpense = filteredExpenses
      .filter(e => e.category === 'Cow Feed')
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const netProfit = Math.round((totalRevenue - operationalExpenses) * 100) / 100;
    const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;
    const feedCostPerLiter = totalLiters > 0 ? Math.round((feedExpense / totalLiters) * 100) / 100 : 0;
    const costPerLiter = totalLiters > 0 ? Math.round((operationalExpenses / totalLiters) * 100) / 100 : 0;

    // Category breakdown
    const categoryMap = {};
    filteredExpenses.forEach(e => {
      const cat = e.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + (Number(e.amount) || 0);
    });
    const categoryBreakdown = Object.keys(categoryMap).map(k => ({
      category: k,
      total: categoryMap[k]
    })).sort((a, b) => b.total - a.total);

    // Chart Data Generation
    const chartData = this.buildTrendChartData(allMilk, allExpenses, viewLevel, targetDate, startDate, endDate);

    let periodLabel = `Period: ${targetDate}`;
    if (viewLevel === 'daily') periodLabel = `Day: ${targetDate}`;
    if (viewLevel === 'monthly') periodLabel = `Month: ${targetDate.substring(0, 7)}`;
    if (viewLevel === 'yearly') periodLabel = `Year: ${targetDate.substring(0, 4)}`;
    if (viewLevel === 'custom') periodLabel = `Range: ${startDate} to ${endDate}`;

    return {
      period_label: periodLabel,
      view_level: viewLevel,
      revenue: Math.round(totalRevenue * 100) / 100,
      operational_expenses: Math.round(operationalExpenses * 100) / 100,
      capital_investment: Math.round(capitalInvestment * 100) / 100,
      total_expenditure: Math.round((operationalExpenses + capitalInvestment) * 100) / 100,
      net_profit: netProfit,
      profit_margin_pct: profitMargin,
      total_liters: Math.round(totalLiters * 100) / 100,
      avg_price_per_liter: Math.round(avgPrice * 100) / 100,
      avg_fat: avgFat ? Math.round(avgFat * 10) / 10 : null,
      feed_expense: feedExpense,
      feed_cost_per_liter: feedCostPerLiter,
      cost_per_liter: costPerLiter,
      total_entries: filteredMilk.length,
      category_breakdown: categoryBreakdown,
      chart_data: chartData
    };
  },

  buildTrendChartData(allMilk, allExpenses, viewLevel, targetDate, startDate, endDate) {
    const labels = [];
    const revenues = [];
    const operationalExps = [];
    const investments = [];
    const liters = [];

    if (viewLevel === 'daily') {
      const base = new Date(targetDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(base);
        d.setDate(base.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        labels.push(dayLabel);

        const mDay = allMilk.filter(m => m.date === dStr);
        const eDay = allExpenses.filter(e => e.date === dStr);

        revenues.push(mDay.reduce((s, m) => s + (Number(m.total_amount) || 0), 0));
        liters.push(mDay.reduce((s, m) => s + (Number(m.quantity_liters) || 0), 0));
        operationalExps.push(eDay.filter(e => e.type === 'Operational').reduce((s, e) => s + (Number(e.amount) || 0), 0));
        investments.push(eDay.filter(e => e.type === 'Capital Investment').reduce((s, e) => s + (Number(e.amount) || 0), 0));
      }
    } else if (viewLevel === 'monthly') {
      const [year, month] = targetDate.substring(0, 7).split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        labels.push(String(day));

        const mDay = allMilk.filter(m => m.date === dStr);
        const eDay = allExpenses.filter(e => e.date === dStr);

        revenues.push(mDay.reduce((s, m) => s + (Number(m.total_amount) || 0), 0));
        liters.push(mDay.reduce((s, m) => s + (Number(m.quantity_liters) || 0), 0));
        operationalExps.push(eDay.filter(e => e.type === 'Operational').reduce((s, e) => s + (Number(e.amount) || 0), 0));
        investments.push(eDay.filter(e => e.type === 'Capital Investment').reduce((s, e) => s + (Number(e.amount) || 0), 0));
      }
    } else if (viewLevel === 'yearly') {
      const year = targetDate.substring(0, 4);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthNames.forEach((mName, idx) => {
        const mPrefix = `${year}-${String(idx + 1).padStart(2, '0')}`;
        labels.push(mName);

        const mMonth = allMilk.filter(m => m.date && m.date.startsWith(mPrefix));
        const eMonth = allExpenses.filter(e => e.date && e.date.startsWith(mPrefix));

        revenues.push(mMonth.reduce((s, m) => s + (Number(m.total_amount) || 0), 0));
        liters.push(mMonth.reduce((s, m) => s + (Number(m.quantity_liters) || 0), 0));
        operationalExps.push(eMonth.filter(e => e.type === 'Operational').reduce((s, e) => s + (Number(e.amount) || 0), 0));
        investments.push(eMonth.filter(e => e.type === 'Capital Investment').reduce((s, e) => s + (Number(e.amount) || 0), 0));
      });
    } else {
      // Custom
      labels.push('Custom Total');
      const mCustom = allMilk.filter(m => m.date >= startDate && m.date <= endDate);
      const eCustom = allExpenses.filter(e => e.date >= startDate && e.date <= endDate);

      revenues.push(mCustom.reduce((s, m) => s + (Number(m.total_amount) || 0), 0));
      liters.push(mCustom.reduce((s, m) => s + (Number(m.quantity_liters) || 0), 0));
      operationalExps.push(eCustom.filter(e => e.type === 'Operational').reduce((s, e) => s + (Number(e.amount) || 0), 0));
      investments.push(eCustom.filter(e => e.type === 'Capital Investment').reduce((s, e) => s + (Number(e.amount) || 0), 0));
    }

    return { labels, revenues, operational_expenses: operationalExps, investments, liters };
  }
};
