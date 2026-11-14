// State management
let currentViewLevel = 'monthly';
let financialChart = null;
let donutChart = null;
let activeTableTab = 'milk';

const operationalCategories = [
  'Veterinary & Medicine',
  'Labor & Wages',
  'Electricity & Water',
  'Transport & Fuel',
  'Cleaning & Sanitization',
  'Repairs & Maintenance',
  'Miscellaneous Farm Expense'
];

const capitalCategories = [
  'Cattle Purchase (Cows/Calves)',
  'Shed & Infrastructure',
  'Machinery & Equipment',
  'Borewell & Water System',
  'Milk Cooler & Tank',
  'Other Long-term Investment'
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const monthStr = `${yyyy}-${mm}`;

  // Pre-fill inputs
  document.getElementById('input-daily-date').value = todayStr;
  document.getElementById('input-monthly-date').value = monthStr;
  document.getElementById('select-year').value = String(yyyy);
  
  // Custom date defaults (last 30 days)
  const past30 = new Date(today);
  past30.setDate(today.getDate() - 30);
  const past30Str = `${past30.getFullYear()}-${String(past30.getMonth() + 1).padStart(2, '0')}-${String(past30.getDate()).padStart(2, '0')}`;
  document.getElementById('input-custom-start').value = past30Str;
  document.getElementById('input-custom-end').value = todayStr;

  // Form dates
  document.getElementById('milk-date').value = todayStr;
  document.getElementById('feed-date').value = todayStr;
  document.getElementById('expense-date').value = todayStr;

  // Init category dropdown
  updateCategoryOptions();

  // Initialize Firebase Cloud if configured
  if (typeof firebaseManager !== 'undefined') {
    firebaseManager.init();
  }

  // Load Dashboard & Data
  loadDashboard();
  loadRecentTables();
});

// View Level Switcher (daily, monthly, yearly, custom)
function setViewLevel(level) {
  currentViewLevel = level;
  const tabs = ['daily', 'monthly', 'yearly', 'custom'];
  tabs.forEach(t => {
    const btn = document.getElementById(`btn-tab-${t}`);
    const filter = document.getElementById(`filter-${t}`);
    if (t === level) {
      btn.className = 'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all bg-white text-emerald-700 shadow-sm';
      filter.classList.remove('hidden');
    } else {
      btn.className = 'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-slate-600 hover:text-slate-900';
      filter.classList.add('hidden');
    }
  });

  loadDashboard();
}

// Navigation helpers
function changeDay(delta) {
  const input = document.getElementById('input-daily-date');
  const d = new Date(input.value || new Date());
  d.setDate(d.getDate() + delta);
  input.value = d.toISOString().split('T')[0];
  loadDashboard();
}

function setToday() {
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('input-daily-date').value = todayStr;
  loadDashboard();
}

function changeMonth(delta) {
  const input = document.getElementById('input-monthly-date');
  let [year, month] = input.value.split('-').map(Number);
  month += delta;
  if (month < 1) { month = 12; year--; }
  if (month > 12) { month = 1; year++; }
  input.value = `${year}-${String(month).padStart(2, '0')}`;
  loadDashboard();
}

function setCurrentMonth() {
  const today = new Date();
  document.getElementById('input-monthly-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  loadDashboard();
}

function changeYear(delta) {
  const select = document.getElementById('select-year');
  let y = parseInt(select.value, 10) + delta;
  let opt = select.querySelector(`option[value="${y}"]`);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = y;
    opt.innerText = y;
    select.appendChild(opt);
  }
  select.value = y;
  loadDashboard();
}

// Fetch and render Dashboard
async function loadDashboard() {
  const targetDaily = document.getElementById('input-daily-date').value;
  const targetMonthly = document.getElementById('input-monthly-date').value;
  const targetYearly = document.getElementById('select-year').value;
  const customStart = document.getElementById('input-custom-start').value;
  const customEnd = document.getElementById('input-custom-end').value;

  try {
    let d;
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      let targetDate = targetMonthly;
      if (currentViewLevel === 'daily') targetDate = targetDaily;
      if (currentViewLevel === 'yearly') targetDate = targetYearly;
      d = await firebaseManager.getDashboardSummary(currentViewLevel, targetDate, customStart, customEnd);
    } else {
      let url = `/api/dashboard?level=${currentViewLevel}`;
      if (currentViewLevel === 'daily') url += `&target_date=${targetDaily}`;
      else if (currentViewLevel === 'monthly') url += `&target_date=${targetMonthly}`;
      else if (currentViewLevel === 'yearly') url += `&target_date=${targetYearly}`;
      else if (currentViewLevel === 'custom') url += `&start_date=${customStart}&end_date=${customEnd}`;

      const res = await fetch(url);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      d = result.data;
    }

    renderMetrics(d);
    renderFinancialChart(d.chart_data);
    renderDonutChart(d.category_breakdown);
    document.getElementById('period-badge').innerText = d.period_label;
  } catch (err) {
    console.error('Error fetching dashboard:', err);
    showToast('Failed to load dashboard data', 'error');
  }
}

function renderMetrics(d) {
  document.getElementById('card-revenue').innerText = `₹${formatNumber(d.revenue)}`;
  document.getElementById('card-liters').innerText = `${d.total_liters} L`;
  document.getElementById('card-avg-price').innerText = `₹${d.avg_price_per_liter}/L`;

  document.getElementById('card-opex').innerText = `₹${formatNumber(d.operational_expenses)}`;
  document.getElementById('card-feed-cost').innerText = `₹${formatNumber(d.feed_expense)}`;
  document.getElementById('card-feed-per-l').innerText = `₹${d.feed_cost_per_liter}/L`;

  document.getElementById('card-investment').innerText = `₹${formatNumber(d.capital_investment)}`;

  const profitEl = document.getElementById('card-profit');
  const iconBox = document.getElementById('card-profit-icon-box');
  const icon = document.getElementById('card-profit-icon');

  if (d.net_profit >= 0) {
    profitEl.innerText = `+₹${formatNumber(d.net_profit)}`;
    profitEl.className = 'text-2xl font-black mt-1 text-emerald-600';
    iconBox.className = 'w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center text-xl shadow-sm';
    icon.className = 'fa-solid fa-arrow-trend-up';
  } else {
    profitEl.innerText = `-₹${formatNumber(Math.abs(d.net_profit))}`;
    profitEl.className = 'text-2xl font-black mt-1 text-rose-600';
    iconBox.className = 'w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center text-xl shadow-sm';
    icon.className = 'fa-solid fa-arrow-trend-down';
  }

  document.getElementById('card-profit-margin').innerText = `${d.profit_margin_pct}%`;
  document.getElementById('card-avg-fat').innerText = d.avg_fat !== null ? `${d.avg_fat}%` : 'N/A';
}

function renderFinancialChart(chartData) {
  const ctx = document.getElementById('financialTrendChart').getContext('2d');
  
  if (financialChart) {
    financialChart.destroy();
  }

  // Calculate Net Profit series
  const netProfits = chartData.revenues.map((rev, i) => {
    return Math.round((rev - chartData.operational_expenses[i]) * 100) / 100;
  });

  financialChart = new Chart(ctx, {
    data: {
      labels: chartData.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Milk Revenue (₹)',
          data: chartData.revenues,
          backgroundColor: 'rgba(34, 197, 94, 0.85)',
          borderRadius: 6,
          order: 2
        },
        {
          type: 'bar',
          label: 'Operational Expenses (₹)',
          data: chartData.operational_expenses,
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          borderRadius: 6,
          order: 3
        },
        {
          type: 'bar',
          label: 'Capital Investment (₹)',
          data: chartData.investments,
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderRadius: 6,
          order: 4
        },
        {
          type: 'line',
          label: 'Net Profit (₹)',
          data: netProfits,
          borderColor: '#10b981',
          borderWidth: 2.5,
          pointBackgroundColor: '#047857',
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'y',
          order: 1
        },
        {
          type: 'line',
          label: 'Milk Liters (L)',
          data: chartData.liters,
          borderColor: '#8b5cf6',
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 3,
          pointBackgroundColor: '#7c3aed',
          tension: 0.3,
          yAxisID: 'y1',
          order: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif", weight: '600' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              if (label.includes('Liters')) {
                return `${label}: ${val} L`;
              }
              return `${label}: ₹${formatNumber(val)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { size: 10 },
            callback: (v) => '₹' + (v >= 1000 ? (v / 1000) + 'k' : v)
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            font: { size: 10 },
            callback: (v) => v + ' L'
          }
        }
      }
    }
  });
}

function renderDonutChart(categories) {
  const ctx = document.getElementById('expenseDonutChart').getContext('2d');
  const summaryEl = document.getElementById('expense-legend-summary');

  if (donutChart) {
    donutChart.destroy();
  }

  if (!categories || categories.length === 0) {
    summaryEl.innerHTML = `<p class="text-center text-slate-400 py-4">No expenses recorded for this period</p>`;
    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No Data'],
        datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }]
      },
      options: { cutout: '75%', plugins: { legend: { display: false } } }
    });
    return;
  }

  const palette = [
    '#f59e0b', // Feed (amber)
    '#ef4444', // Vet (red)
    '#8b5cf6', // Labor (purple)
    '#3b82f6', // Cattle purchase (blue)
    '#06b6d4', // Utilities (cyan)
    '#ec4899', // Transport (pink)
    '#10b981', // Infrastructure (emerald)
    '#64748b'  // Misc (slate)
  ];

  const labels = categories.map(c => c.category);
  const data = categories.map(c => c.total);
  const colors = categories.map((_, i) => palette[i % palette.length]);

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ₹${formatNumber(ctx.parsed)}`
          }
        }
      }
    }
  });

  // Render bottom list
  const total = data.reduce((a, b) => a + b, 0);
  summaryEl.innerHTML = categories.map((cat, i) => {
    const pct = total > 0 ? Math.round((cat.total / total) * 100) : 0;
    const color = palette[i % palette.length];
    return `
      <div class="flex items-center justify-between py-0.5">
        <span class="flex items-center gap-1.5 truncate">
          <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: ${color}"></span>
          <span class="text-slate-700 font-medium">${cat.category}</span>
        </span>
        <span class="font-bold text-slate-800">₹${formatNumber(cat.total)} <span class="text-[10px] text-slate-400 font-normal">(${pct}%)</span></span>
      </div>
    `;
  }).join('');
}

// ----------------- TABLES & TABS ----------------- //

function switchTableTab(tab) {
  activeTableTab = tab;
  ['milk', 'feed', 'expenses'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`table-content-${t}`);
    if (t === tab) {
      btn.className = 'px-3 sm:px-4 py-2 sm:py-2.5 font-bold text-xs sm:text-sm border-b-2 border-emerald-600 text-emerald-800 transition-all flex items-center gap-1.5 whitespace-nowrap';
      content.classList.remove('hidden');
    } else {
      btn.className = 'px-3 sm:px-4 py-2 sm:py-2.5 font-bold text-xs sm:text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1.5 whitespace-nowrap';
      content.classList.add('hidden');
    }
  });
}

async function loadRecentTables() {
  loadMilkTable();
  loadFeedTable();
  loadExpensesTable();
}

async function loadMilkTable() {
  try {
    let records = [];
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      records = await firebaseManager.getMilk();
    } else {
      const res = await fetch('/api/milk?limit=50');
      const data = await res.json();
      records = data.records || [];
    }

    const tbody = document.getElementById('milk-table-body');
    const cardsContainer = document.getElementById('milk-cards-body');

    if (!records || records.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-400">No milk sales logged yet. Tap "+ Milk" to record sales!</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = `<div class="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">No milk sales logged yet. Tap "+ Milk" below to record!</div>`;
      return;
    }

    // 1. Desktop Table Rows
    if (tbody) {
      tbody.innerHTML = records.map(r => {
        const receiptSrc = r.receipt_image 
          ? (r.receipt_image.startsWith('http') ? r.receipt_image : `/uploads/${r.receipt_image}`)
          : null;

        return `
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">${r.date}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${r.shift === 'Morning' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}">
              ${r.shift}
            </span>
          </td>
          <td class="py-3 px-4 font-bold text-slate-900">${r.quantity_liters} L</td>
          <td class="py-3 px-4 text-slate-600">₹${r.price_per_liter}</td>
          <td class="py-3 px-4 font-semibold ${r.fat_percentage ? 'text-emerald-700' : 'text-slate-400'}">${r.fat_percentage ? r.fat_percentage + '%' : '--'}</td>
          <td class="py-3 px-4 font-black text-emerald-600">₹${formatNumber(r.total_amount)}</td>
          <td class="py-3 px-4 font-medium text-slate-700">${escapeHtml(r.buyer_name || '-')}</td>
          <td class="py-3 px-4">
            ${receiptSrc ? `
              <button onclick="openReceiptModal('${receiptSrc}', 'Milk Slip - ${r.date} (${r.shift})')" class="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold border border-emerald-200 transition-all">
                <i class="fa-solid fa-receipt text-emerald-600"></i> View Slip
              </button>
            ` : `<span class="text-xs text-slate-300">--</span>`}
          </td>
          <td class="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">${escapeHtml(r.notes || '')}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="deleteMilkSale('${r.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 transition-colors" title="Delete Entry">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `}).join('');
    }

    // 2. Mobile Responsive Card View (Touch-Optimized)
    if (cardsContainer) {
      cardsContainer.innerHTML = records.map(r => {
        const receiptSrc = r.receipt_image 
          ? (r.receipt_image.startsWith('http') ? r.receipt_image : `/uploads/${r.receipt_image}`)
          : null;

        return `
          <div class="milk-card-item bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-800 text-sm">${r.date}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.shift === 'Morning' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}">
                  ${r.shift}
                </span>
              </div>
              <span class="text-base font-black text-emerald-600">₹${formatNumber(r.total_amount)}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Quantity</span>
                <span class="font-bold text-slate-900">${r.quantity_liters} L</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Rate</span>
                <span class="font-bold text-slate-700">₹${r.price_per_liter}/L</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Fat / SNF</span>
                <span class="font-semibold text-emerald-700">${r.fat_percentage ? r.fat_percentage + '%' : '--'}</span>
              </div>
            </div>
            <div class="flex items-center justify-between pt-0.5 text-xs text-slate-500">
              <span class="truncate max-w-[170px]"><i class="fa-regular fa-user mr-1 text-slate-400"></i>${escapeHtml(r.buyer_name || 'Dairy')}</span>
              <div class="flex items-center gap-2">
                ${receiptSrc ? `
                  <button onclick="openReceiptModal('${receiptSrc}', 'Milk Slip - ${r.date}')" class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 active:scale-95">
                    <i class="fa-solid fa-receipt text-emerald-600"></i> Slip
                  </button>
                ` : ''}
                <button onclick="deleteMilkSale('${r.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 active:scale-95 transition-colors" title="Delete">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadFeedTable() {
  try {
    let records = [];
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      records = await firebaseManager.getFeed();
    } else {
      const res = await fetch('/api/feed?limit=50');
      const data = await res.json();
      records = data.records || [];
    }

    const tbody = document.getElementById('feed-table-body');
    const cardsContainer = document.getElementById('feed-cards-body');

    if (!records || records.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">No feed purchases logged yet. Tap "+ Feed" to track feed costs!</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = `<div class="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">No feed purchases logged yet. Tap "+ Feed" below to add!</div>`;
      return;
    }

    // 1. Desktop Table Rows
    if (tbody) {
      tbody.innerHTML = records.map(r => {
        const receiptSrc = r.receipt_image 
          ? (r.receipt_image.startsWith('http') ? r.receipt_image : `/uploads/${r.receipt_image}`)
          : null;

        return `
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">${r.date}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              ${escapeHtml(r.feed_type)}
            </span>
          </td>
          <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(r.item_name)}</td>
          <td class="py-3 px-4 text-slate-700">${r.quantity_kg ? r.quantity_kg + ' kg' : '--'}</td>
          <td class="py-3 px-4 font-black text-rose-600">₹${formatNumber(r.cost)}</td>
          <td class="py-3 px-4 text-slate-600">${escapeHtml(r.supplier || '-')}</td>
          <td class="py-3 px-4">
            ${receiptSrc ? `
              <button onclick="openReceiptModal('${receiptSrc}', 'Feed Invoice - ${escapeHtml(r.item_name)}')" class="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold border border-amber-200 transition-all">
                <i class="fa-solid fa-receipt text-amber-600"></i> View Bill
              </button>
            ` : `<span class="text-xs text-slate-300">--</span>`}
          </td>
          <td class="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">${escapeHtml(r.notes || '')}</td>
          <td class="py-3 px-4 text-right">
            <button onclick="deleteFeedPurchase('${r.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 transition-colors" title="Delete Entry">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `}).join('');
    }

    // 2. Mobile Responsive Card View
    if (cardsContainer) {
      cardsContainer.innerHTML = records.map(r => {
        const receiptSrc = r.receipt_image 
          ? (r.receipt_image.startsWith('http') ? r.receipt_image : `/uploads/${r.receipt_image}`)
          : null;

        return `
          <div class="feed-card-item bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-800 text-sm">${r.date}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  ${escapeHtml(r.feed_type)}
                </span>
              </div>
              <span class="text-base font-black text-rose-600">₹${formatNumber(r.cost)}</span>
            </div>
            <div class="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Feed Item</span>
                <span class="font-bold text-slate-900">${escapeHtml(r.item_name)}</span>
              </div>
              <div class="text-right">
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Quantity</span>
                <span class="font-semibold text-slate-700">${r.quantity_kg ? r.quantity_kg + ' kg' : '--'}</span>
              </div>
            </div>
            <div class="flex items-center justify-between pt-0.5 text-xs text-slate-500">
              <span class="truncate max-w-[170px]"><i class="fa-solid fa-store mr-1 text-slate-400"></i>${escapeHtml(r.supplier || '-')}</span>
              <div class="flex items-center gap-2">
                ${receiptSrc ? `
                  <button onclick="openReceiptModal('${receiptSrc}', 'Feed Bill - ${escapeHtml(r.item_name)}')" class="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1 active:scale-95">
                    <i class="fa-solid fa-receipt text-amber-600"></i> Bill
                  </button>
                ` : ''}
                <button onclick="deleteFeedPurchase('${r.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 active:scale-95 transition-colors" title="Delete">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadExpensesTable() {
  try {
    let records = [];
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      records = await firebaseManager.getExpenses();
    } else {
      const res = await fetch('/api/expenses?limit=50');
      const data = await res.json();
      records = data.records || [];
    }

    const tbody = document.getElementById('expenses-table-body');
    const cardsContainer = document.getElementById('expenses-cards-body');

    if (!records || records.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">No expenses logged yet. Tap "+ Expense" to record costs!</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = `<div class="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">No expenses logged yet. Tap "+ Expense" below to add!</div>`;
      return;
    }

    // 1. Desktop Table Rows
    if (tbody) {
      tbody.innerHTML = records.map(r => {
        const receiptSrc = r.receipt_image 
          ? (r.receipt_image.startsWith('http') ? r.receipt_image : `/uploads/${r.receipt_image}`)
          : null;

        return `
        <tr class="hover:bg-slate-50/70 transition-colors">
          <td class="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">${r.date}</td>
          <td class="py-3 px-4">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${r.type === 'Capital Investment' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-700'}">
              ${r.type}
            </span>
          </td>
          <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(r.category)}</td>
          <td class="py-3 px-4 text-slate-600 max-w-xs truncate">${escapeHtml(r.description)}</td>
          <td class="py-3 px-4 font-black ${r.type === 'Capital Investment' ? 'text-blue-600' : 'text-rose-600'}">₹${formatNumber(r.amount)}</td>
          <td class="py-3 px-4 text-xs font-medium text-slate-500">${escapeHtml(r.payment_mode || 'Cash')}</td>
          <td class="py-3 px-4">
            ${receiptSrc ? `
              <button onclick="openReceiptModal('${receiptSrc}', 'Receipt - ${escapeHtml(r.description)}')" class="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 transition-all">
                <i class="fa-solid fa-receipt text-slate-600"></i> View Slip
              </button>
            ` : `<span class="text-xs text-slate-300">--</span>`}
          </td>
          <td class="py-3 px-4 text-right">
            <button onclick="deleteExpense('${r.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 transition-colors" title="Delete Entry">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `}).join('');
    }

    // 2. Mobile Responsive Card View
    if (cardsContainer) {
      cardsContainer.innerHTML = records.map(r => {
        const receiptSrc = r.receipt_image 
          ? (r.receipt_image.startsWith('http') ? r.receipt_image : `/uploads/${r.receipt_image}`)
          : null;

        return `
          <div class="expense-card-item bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-800 text-sm">${r.date}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.type === 'Capital Investment' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-700'}">
                  ${r.type}
                </span>
              </div>
              <span class="text-base font-black ${r.type === 'Capital Investment' ? 'text-blue-600' : 'text-rose-600'}">₹${formatNumber(r.amount)}</span>
            </div>
            <div class="text-xs bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between">
              <div>
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Category</span>
                <span class="font-bold text-slate-800">${escapeHtml(r.category)}</span>
              </div>
              <div class="text-right">
                <span class="text-slate-400 block text-[10px] uppercase font-semibold">Payment</span>
                <span class="font-medium text-slate-600">${escapeHtml(r.payment_mode || 'Cash')}</span>
              </div>
            </div>
            <p class="text-xs text-slate-600 truncate">${escapeHtml(r.description)}</p>
            <div class="flex items-center justify-end gap-2 pt-0.5">
              ${receiptSrc ? `
                <button onclick="openReceiptModal('${receiptSrc}', 'Receipt - ${escapeHtml(r.description)}')" class="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 active:scale-95">
                  <i class="fa-solid fa-receipt text-slate-600"></i> Receipt
                </button>
              ` : ''}
              <button onclick="deleteExpense('${r.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 active:scale-95 transition-colors" title="Delete">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

function filterCurrentTable() {
  const query = document.getElementById('tableSearch').value.toLowerCase();
  let tableId = 'milk-table-body';
  let cardsId = 'milk-cards-body';
  if (activeTableTab === 'feed') {
    tableId = 'feed-table-body';
    cardsId = 'feed-cards-body';
  }
  if (activeTableTab === 'expenses') {
    tableId = 'expenses-table-body';
    cardsId = 'expenses-cards-body';
  }

  const rows = document.getElementById(tableId)?.getElementsByTagName('tr') || [];
  for (let r of rows) {
    const text = r.innerText.toLowerCase();
    r.style.display = text.includes(query) ? '' : 'none';
  }

  const cards = document.getElementById(cardsId)?.children || [];
  for (let c of cards) {
    const text = c.innerText.toLowerCase();
    c.style.display = text.includes(query) ? '' : 'none';
  }
}

// ----------------- MODAL CONTROLS ----------------- //

function openMilkModal() {
  document.getElementById('milkModal').classList.remove('hidden');
  calculateMilkTotal();
}
function closeMilkModal() {
  document.getElementById('milkModal').classList.add('hidden');
}

function calculateMilkTotal() {
  const qty = parseFloat(document.getElementById('milk-quantity').value) || 0;
  const price = parseFloat(document.getElementById('milk-price').value) || 0;
  const total = (qty * price).toFixed(2);
  document.getElementById('milk-calculated-total').innerText = `₹${formatNumber(total)}`;
}

function openFeedModal() {
  document.getElementById('feedModal').classList.remove('hidden');
}
function closeFeedModal() {
  document.getElementById('feedModal').classList.add('hidden');
}

function openExpenseModal() {
  document.getElementById('expenseModal').classList.remove('hidden');
}
function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
}

function updateCategoryOptions() {
  const nature = document.querySelector('input[name="expense_nature"]:checked').value;
  const select = document.getElementById('expense-category');
  select.innerHTML = '';
  const list = nature === 'Operational' ? operationalCategories : capitalCategories;
  list.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.innerText = cat;
    select.appendChild(opt);
  });
}

function toggleMoreMenu() {
  const m = document.getElementById('moreMenu');
  m.classList.toggle('hidden');
}
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('moreActionsDropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    document.getElementById('moreMenu')?.classList.add('hidden');
  }
});

// ----------------- RECEIPT CAMERA & FILE UPLOAD ----------------- //

let cameraStream = null;
let activeTargetModal = 'milk'; // 'milk', 'feed', or 'expense'
let cameraFacing = 'environment'; // 'environment' (rear) or 'user' (front)
let capturedBlob = null;
let activeCapturedFiles = { milk: null, feed: null, expense: null };

async function openCameraModal(target = 'milk') {
  activeTargetModal = target;
  capturedBlob = null;

  const modal = document.getElementById('cameraModal');
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const guides = document.getElementById('cameraGuides');
  const liveControls = document.getElementById('cameraLiveControls');
  const reviewControls = document.getElementById('cameraReviewControls');

  video.classList.remove('hidden');
  canvas.classList.add('hidden');
  if (guides) guides.classList.remove('hidden');
  liveControls.classList.remove('hidden');
  reviewControls.classList.add('hidden');

  modal.classList.remove('hidden');
  await startCameraStream();
}

async function startCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
  }

  const video = document.getElementById('cameraVideo');

  try {
    const constraints = {
      video: {
        facingMode: cameraFacing,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
    await video.play();
  } catch (err) {
    console.warn("Direct rear camera failed, trying fallback constraints:", err);
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = cameraStream;
      await video.play();
    } catch (err2) {
      alert("Unable to access camera: " + (err2.message || 'Please check browser camera permissions.'));
      closeCameraModal();
    }
  }
}

async function flipCameraFacing() {
  cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
  await startCameraStream();
}

function captureSnapshot() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const guides = document.getElementById('cameraGuides');
  const liveControls = document.getElementById('cameraLiveControls');
  const reviewControls = document.getElementById('cameraReviewControls');

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  canvas.toBlob(blob => {
    capturedBlob = blob;
  }, 'image/jpeg', 0.92);

  video.classList.add('hidden');
  canvas.classList.remove('hidden');
  if (guides) guides.classList.add('hidden');
  liveControls.classList.add('hidden');
  reviewControls.classList.remove('hidden');
}

function retakeSnapshot() {
  capturedBlob = null;
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const guides = document.getElementById('cameraGuides');
  const liveControls = document.getElementById('cameraLiveControls');
  const reviewControls = document.getElementById('cameraReviewControls');

  video.classList.remove('hidden');
  canvas.classList.add('hidden');
  if (guides) guides.classList.remove('hidden');
  liveControls.classList.remove('hidden');
  reviewControls.classList.add('hidden');
}

function confirmSnapshot() {
  if (!capturedBlob) return;

  const filename = `camera_receipt_${Date.now()}.jpg`;
  const file = new File([capturedBlob], filename, { type: 'image/jpeg' });
  activeCapturedFiles[activeTargetModal] = file;

  // Show preview in target modal
  const previewBox = document.getElementById(`${activeTargetModal}-receipt-preview`);
  const thumb = document.getElementById(`${activeTargetModal}-receipt-thumb`);
  const nameLabel = document.getElementById(`${activeTargetModal}-receipt-filename`);

  const previewUrl = URL.createObjectURL(capturedBlob);
  if (thumb) thumb.src = previewUrl;
  if (previewBox) previewBox.classList.remove('hidden');
  if (nameLabel) nameLabel.innerText = '📸 Photo Captured';

  closeCameraModal();
  showToast('Receipt photo captured!', 'success');
}

function closeCameraModal() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('cameraModal').classList.add('hidden');
}

function previewSelectedReceipt(e, previewBoxId, imgId, nameId) {
  const file = e.target.files[0];
  if (file) {
    // uploaded file replaces camera snapshot
    const target = previewBoxId.split('-')[0];
    activeCapturedFiles[target] = null;

    if (nameId) {
      document.getElementById(nameId).innerText = file.name;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      document.getElementById(imgId).src = evt.target.result;
      document.getElementById(previewBoxId).classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

function clearReceiptInput(inputId, previewBoxId, nameId) {
  const target = inputId.split('-')[0];
  activeCapturedFiles[target] = null;

  document.getElementById(inputId).value = '';
  document.getElementById(previewBoxId).classList.add('hidden');
  if (nameId) {
    document.getElementById(nameId).innerText = '';
  }
}

async function uploadReceiptFile(fileInputId, target = 'milk') {
  // Check if camera captured file exists, or file input has file
  const file = activeCapturedFiles[target] || (document.getElementById(fileInputId)?.files?.[0]);
  if (!file) {
    return null;
  }

  const formData = new FormData();
  formData.append('receipt', file);

  try {
    const res = await fetch('/api/upload-receipt', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      return data.filename;
    } else {
      console.warn('Receipt upload error:', data.error);
      return null;
    }
  } catch (err) {
    console.error('Failed to upload receipt image:', err);
    return null;
  }
}

function openReceiptModal(url, title = 'Transaction Receipt') {
  document.getElementById('receiptModalTitle').innerText = title;
  document.getElementById('receiptModalImg').src = url;
  document.getElementById('receiptDownloadBtn').href = url;
  document.getElementById('receiptModal').classList.remove('hidden');
}

function closeReceiptModal() {
  document.getElementById('receiptModal').classList.add('hidden');
}

// ----------------- SUBMISSIONS ----------------- //

async function submitMilkSale(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : 'Save Milk Record';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving...';
  }

  const fileInput = document.getElementById('milk-receipt-file');
  const receiptFile = activeCapturedFiles.milk || (fileInput && fileInput.files ? fileInput.files[0] : null);

  const payload = {
    date: document.getElementById('milk-date').value,
    shift: document.getElementById('milk-shift').value,
    quantity_liters: parseFloat(document.getElementById('milk-quantity').value),
    price_per_liter: parseFloat(document.getElementById('milk-price').value),
    fat_percentage: document.getElementById('milk-fat').value ? parseFloat(document.getElementById('milk-fat').value) : null,
    snf_percentage: document.getElementById('milk-snf').value ? parseFloat(document.getElementById('milk-snf').value) : null,
    buyer_name: document.getElementById('milk-buyer').value || 'Local Dairy',
    notes: document.getElementById('milk-notes').value
  };

  try {
    let savedToCloud = false;
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      try {
        await firebaseManager.saveMilk(payload, receiptFile);
        savedToCloud = true;
        showToast('Milk sale saved to Google Cloud!', 'success');
      } catch (cloudErr) {
        console.warn('Firebase write error, falling back to local SQLite:', cloudErr);
      }
    }

    if (!savedToCloud) {
      let receiptFilename = await uploadReceiptFile('milk-receipt-file', 'milk');
      payload.receipt_image = receiptFilename;

      const res = await fetch('/api/milk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      showToast('Milk sale recorded locally!', 'success');
    }

    closeMilkModal();
    document.getElementById('milk-quantity').value = '';
    clearReceiptInput('milk-receipt-file', 'milk-receipt-preview', 'milk-receipt-filename');
    activeCapturedFiles.milk = null;
    loadDashboard();
    loadMilkTable();
  } catch (err) {
    console.error('Submit milk error:', err);
    showToast(err.message || 'Failed to save record', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

async function submitFeedPurchase(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : 'Save Feed Purchase';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving...';
  }

  const fileInput = document.getElementById('feed-receipt-file');
  const receiptFile = activeCapturedFiles.feed || (fileInput && fileInput.files ? fileInput.files[0] : null);

  const payload = {
    date: document.getElementById('feed-date').value,
    feed_type: document.getElementById('feed-type').value,
    item_name: document.getElementById('feed-item').value,
    quantity_kg: parseFloat(document.getElementById('feed-quantity').value) || 0,
    cost: parseFloat(document.getElementById('feed-cost').value),
    supplier: document.getElementById('feed-supplier').value,
    payment_mode: document.getElementById('feed-payment').value,
    notes: document.getElementById('feed-notes').value
  };

  try {
    let savedToCloud = false;
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      try {
        await firebaseManager.saveFeed(payload, receiptFile);
        savedToCloud = true;
        showToast('Feed purchase saved to Google Cloud!', 'success');
      } catch (cloudErr) {
        console.warn('Firebase feed write error, falling back:', cloudErr);
      }
    }

    if (!savedToCloud) {
      let receiptFilename = await uploadReceiptFile('feed-receipt-file', 'feed');
      payload.receipt_image = receiptFilename;

      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      showToast('Cow feed purchase saved locally!', 'success');
    }

    closeFeedModal();
    document.getElementById('feed-item').value = '';
    document.getElementById('feed-cost').value = '';
    document.getElementById('feed-quantity').value = '';
    clearReceiptInput('feed-receipt-file', 'feed-receipt-preview', 'feed-receipt-filename');
    activeCapturedFiles.feed = null;
    loadDashboard();
    loadFeedTable();
    loadExpensesTable();
  } catch (err) {
    console.error('Submit feed error:', err);
    showToast(err.message || 'Failed to save feed', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

async function submitExpense(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : 'Save Expense';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving...';
  }

  const fileInput = document.getElementById('expense-receipt-file');
  const receiptFile = activeCapturedFiles.expense || (fileInput && fileInput.files ? fileInput.files[0] : null);

  const payload = {
    type: document.querySelector('input[name="expense_nature"]:checked').value,
    category: document.getElementById('expense-category').value,
    date: document.getElementById('expense-date').value,
    description: document.getElementById('expense-description').value,
    amount: parseFloat(document.getElementById('expense-amount').value),
    payment_mode: document.getElementById('expense-payment').value
  };

  try {
    let savedToCloud = false;
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      try {
        await firebaseManager.saveExpense(payload, receiptFile);
        savedToCloud = true;
        showToast('Expense saved to Google Cloud!', 'success');
      } catch (cloudErr) {
        console.warn('Firebase expense write error, falling back:', cloudErr);
      }
    }

    if (!savedToCloud) {
      let receiptFilename = await uploadReceiptFile('expense-receipt-file', 'expense');
      payload.receipt_image = receiptFilename;

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      showToast('Expense recorded locally!', 'success');
    }

    closeExpenseModal();
    document.getElementById('expense-description').value = '';
    document.getElementById('expense-amount').value = '';
    clearReceiptInput('expense-receipt-file', 'expense-receipt-preview', 'expense-receipt-filename');
    activeCapturedFiles.expense = null;
    loadDashboard();
    loadExpensesTable();
  } catch (err) {
    console.error('Submit expense error:', err);
    showToast(err.message || 'Failed to save expense', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

// ----------------- DELETIONS ----------------- //

async function deleteMilkSale(id) {
  if (!confirm('Are you sure you want to delete this milk record?')) return;
  try {
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      await firebaseManager.deleteMilk(id);
    } else {
      await fetch(`/api/milk/${id}`, { method: 'DELETE' });
    }
    showToast('Milk record removed', 'success');
    loadDashboard();
    loadMilkTable();
  } catch (err) {
    showToast('Failed to delete', 'error');
  }
}

async function deleteFeedPurchase(id) {
  if (!confirm('Are you sure you want to delete this feed purchase record?')) return;
  try {
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      await firebaseManager.deleteFeed(id);
    } else {
      await fetch(`/api/feed/${id}`, { method: 'DELETE' });
    }
    showToast('Feed record removed', 'success');
    loadDashboard();
    loadFeedTable();
    loadExpensesTable();
  } catch (err) {
    showToast('Failed to delete', 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('Are you sure you want to delete this expense record?')) return;
  try {
    if (typeof firebaseManager !== 'undefined' && firebaseManager.connected) {
      await firebaseManager.deleteExpense(id);
    } else {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    }
    showToast('Expense removed', 'success');
    loadDashboard();
    loadExpensesTable();
  } catch (err) {
    showToast('Failed to delete', 'error');
  }
}

// ----------------- FIREBASE CONFIG MODAL & SYNC ----------------- //

function openFirebaseModal() {
  const modal = document.getElementById('firebaseModal');
  const input = document.getElementById('firebaseConfigInput');
  const saved = localStorage.getItem('gaudhan_firebase_config') || (firebaseManager.config ? JSON.stringify(firebaseManager.config) : '');
  if (saved && !input.value) {
    try {
      input.value = JSON.stringify(JSON.parse(saved), null, 2);
    } catch (e) {
      input.value = saved;
    }
  }
  if (typeof firebaseManager !== 'undefined') {
    firebaseManager.updateUI();
  }
  modal.classList.remove('hidden');
}

function closeFirebaseModal() {
  document.getElementById('firebaseModal').classList.add('hidden');
}

function extractFirebaseConfig(raw) {
  if (!raw) return null;
  // 1. Try direct JSON parse
  try {
    const parsed = JSON.parse(raw);
    if (parsed.apiKey && parsed.projectId) return parsed;
  } catch (e) {}

  // 2. Look for firebaseConfig = { ... } object specifically
  const fcMatch = raw.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\});?/);
  if (fcMatch) {
    try {
      const jsonLike = fcMatch[1]
        .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1');
      const parsed = JSON.parse(jsonLike);
      if (parsed.apiKey && parsed.projectId) return parsed;
    } catch (e) {}
  }

  // 3. Fallback: extract individual keys using regex
  const getField = (field) => {
    const m = raw.match(new RegExp(`${field}["']?\\s*:\\s*["']([^"']+)["']`));
    return m ? m[1] : null;
  };

  const apiKey = getField('apiKey');
  const projectId = getField('projectId');
  if (apiKey && projectId) {
    return {
      apiKey,
      authDomain: getField('authDomain') || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: getField('storageBucket') || `${projectId}.firebasestorage.app`,
      messagingSenderId: getField('messagingSenderId') || '',
      appId: getField('appId') || '',
      measurementId: getField('measurementId') || ''
    };
  }
  return null;
}

function saveFirebaseConfig() {
  const raw = document.getElementById('firebaseConfigInput').value.trim();
  if (!raw) {
    showToast('Please paste your Firebase configuration first', 'error');
    return;
  }

  const configObj = extractFirebaseConfig(raw);

  if (!configObj || !configObj.projectId || !configObj.apiKey) {
    showToast('Invalid Firebase configuration. Missing apiKey or projectId.', 'error');
    return;
  }

  try {
    firebaseManager.connect(configObj);
    showToast('Connected to Google Firebase Cloud successfully!', 'success');
    closeFirebaseModal();
    loadDashboard();
    loadRecentTables();
  } catch (err) {
    showToast('Firebase connection error: ' + err.message, 'error');
  }
}

function disconnectFirebase() {
  if (!confirm('Disconnect from Firebase Cloud and switch back to Local SQLite mode?')) return;
  firebaseManager.disconnect();
  showToast('Switched back to Local Mode', 'info');
  closeFirebaseModal();
  loadDashboard();
  loadRecentTables();
}

async function syncLocalToFirebase() {
  if (!firebaseManager.connected) {
    showToast('Please connect Firebase Cloud first', 'error');
    return;
  }

  if (!confirm('This will upload all current local records (milk, feed, expenses) to your Firebase Firestore. Continue?')) return;

  try {
    showToast('Uploading local data to Google Cloud...', 'info');

    // Fetch local records
    const [mRes, fRes, eRes] = await Promise.all([
      fetch('/api/milk?limit=1000').then(r => r.json()),
      fetch('/api/feed?limit=1000').then(r => r.json()),
      fetch('/api/expenses?limit=1000').then(r => r.json())
    ]);

    const milkRecords = mRes.records || [];
    const feedRecords = fRes.records || [];
    const expRecords = eRes.records || [];

    let count = 0;
    for (const m of milkRecords) {
      await firebaseManager.saveMilk(m, null);
      count++;
    }
    for (const f of feedRecords) {
      await firebaseManager.saveFeed(f, null);
      count++;
    }
    // General expenses that aren't linked to feed purchases
    const nonFeedExpenses = expRecords.filter(e => !e.feed_purchase_id);
    for (const e of nonFeedExpenses) {
      await firebaseManager.saveExpense(e, null);
      count++;
    }

    showToast(`Successfully synced ${count} records to Google Firebase!`, 'success');
    closeFirebaseModal();
    loadDashboard();
    loadRecentTables();
  } catch (err) {
    console.error("Sync error:", err);
    showToast('Failed to sync to Firebase: ' + err.message, 'error');
  }
}

// ----------------- DEMO SEED & RESET ----------------- //

async function seedDemoData() {
  if (!confirm('Load 30 days of realistic sample dairy data (milk sales, feed, vet, equipment)?')) return;
  try {
    const res = await fetch('/api/seed', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast(result.message, 'success');
      loadDashboard();
      loadRecentTables();
    } else {
      showToast(result.message, 'info');
    }
  } catch (err) {
    showToast('Failed to seed data', 'error');
  }
}

async function confirmResetData() {
  if (!confirm('⚠️ WARNING: This will permanently delete ALL milk sales, feed purchases, and expenses! Are you sure?')) return;
  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    const result = await res.json();
    showToast(result.message, 'info');
    loadDashboard();
    loadRecentTables();
  } catch (err) {
    showToast('Failed to reset', 'error');
  }
}

// ----------------- UTILITIES ----------------- //

function formatNumber(num) {
  return Number(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const message = document.getElementById('toast-message');

  message.innerText = msg;
  if (type === 'error') {
    icon.className = 'fa-solid fa-circle-exclamation text-rose-400';
  } else if (type === 'info') {
    icon.className = 'fa-solid fa-circle-info text-blue-400';
  } else {
    icon.className = 'fa-solid fa-circle-check text-emerald-400';
  }

  toast.classList.remove('translate-y-24', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3500);
}

// ----------------- GOOGLE AUTH & ACCESS MANAGEMENT ----------------- //

function openLoginModal() {
  const errBanner = document.getElementById('loginErrorBanner');
  if (errBanner) errBanner.classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

let quickLoginSelectedRole = 'Owner';

function setQuickLoginRole(role) {
  quickLoginSelectedRole = role;
  const emailInput = document.getElementById('quick-login-email');
  const nameInput = document.getElementById('quick-login-name');
  if (role === 'Owner') {
    if (!emailInput.value) emailInput.value = 'owner@gaudhan.com';
    if (!nameInput.value) nameInput.value = 'Farm Owner';
    showToast('Role selected: 👑 Farm Owner', 'info');
  } else {
    if (!emailInput.value) emailInput.value = 'staff@gaudhan.com';
    if (!nameInput.value) nameInput.value = 'Dairy Staff';
    showToast('Role selected: 👤 Staff Member', 'info');
  }
}

async function submitQuickLogin(e) {
  e.preventDefault();
  const email = document.getElementById('quick-login-email').value.trim();
  const name = document.getElementById('quick-login-name').value.trim();

  if (!email) {
    showToast('Please enter your email', 'error');
    return;
  }

  try {
    const user = await firebaseManager.signInDirect(email, name, quickLoginSelectedRole);
    closeLoginModal();
    showToast(`Signed in as ${user.displayName || user.email} (${quickLoginSelectedRole})!`, 'success');
    loadDashboard();
    loadRecentTables();
  } catch (err) {
    console.error("Direct sign in error:", err);
    showToast(err.message || 'Failed to sign in', 'error');
  }
}

async function handleGoogleSignIn() {
  const errBanner = document.getElementById('loginErrorBanner');
  const errText = document.getElementById('loginErrorText');
  if (errBanner) errBanner.classList.add('hidden');

  try {
    showToast('Opening Google sign-in...', 'info');
    const user = await firebaseManager.signInWithGoogle();
    if (user) {
      closeLoginModal();
      showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
      loadDashboard();
      loadRecentTables();
    }
  } catch (err) {
    console.error("Sign in error:", err);
    if (errBanner && errText) {
      errText.innerText = err.message;
      errBanner.classList.remove('hidden');
    }
    showToast(err.message || 'Google sign-in was canceled or failed', 'error');
  }
}

async function handleGoogleSignOut() {
  try {
    await firebaseManager.signOutGoogle();
    document.getElementById('userDropdownMenu')?.classList.add('hidden');
    showToast('Signed out successfully', 'info');
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

function toggleUserDropdown() {
  const m = document.getElementById('userDropdownMenu');
  if (m) m.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const badge = document.getElementById('userProfileBadge');
  if (badge && !badge.contains(e.target)) {
    document.getElementById('userDropdownMenu')?.classList.add('hidden');
  }
});

function openAccessModal() {
  document.getElementById('userDropdownMenu')?.classList.add('hidden');
  document.getElementById('moreMenu')?.classList.add('hidden');
  document.getElementById('accessModal').classList.remove('hidden');
  loadAuthorizedUsersList();
}

function closeAccessModal() {
  document.getElementById('accessModal').classList.add('hidden');
}

async function loadAuthorizedUsersList() {
  const container = document.getElementById('authorized-users-list');
  const countEl = document.getElementById('access-user-count');
  if (!container) return;

  container.innerHTML = `<div class="py-4 text-center text-slate-400 text-xs">Loading authorized members...</div>`;

  try {
    const users = await firebaseManager.getAuthorizedUsers();
    if (countEl) countEl.innerText = `${users.length} User${users.length === 1 ? '' : 's'}`;

    if (!users || users.length === 0) {
      container.innerHTML = `<div class="p-4 bg-slate-50 text-slate-400 rounded-xl text-center text-xs">No team members added yet. Add staff above to grant access!</div>`;
      return;
    }

    const currentEmail = firebaseManager.currentUser ? firebaseManager.currentUser.email.toLowerCase() : '';
    const isOwnerOrAdmin = firebaseManager.currentUserRole === 'Owner' || firebaseManager.currentUserRole === 'Admin';

    container.innerHTML = users.map(u => {
      const email = u.email || u.id;
      const name = u.name || email.split('@')[0];
      const role = u.role || 'Staff';
      const isOwner = role === 'Owner';
      const isSelf = email.toLowerCase() === currentEmail;

      const roleBadge = isOwner 
        ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">👑 Owner</span>`
        : (role === 'Admin'
            ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">🛡️ Admin</span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">👤 Staff</span>`);

      return `
        <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 uppercase flex-shrink-0">
              ${name.charAt(0)}
            </div>
            <div class="truncate">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-800 text-xs truncate">${escapeHtml(name)}</span>
                ${isSelf ? '<span class="text-[9px] bg-emerald-50 text-emerald-700 px-1 rounded font-semibold">You</span>' : ''}
              </div>
              <span class="text-[11px] text-slate-500 block truncate">${escapeHtml(email)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            ${roleBadge}
            ${(!isOwner && isOwnerOrAdmin && !isSelf) ? `
              <button onclick="handleDeleteAuthorizedUser('${email}')" class="text-slate-400 hover:text-rose-600 p-1.5 text-xs transition-colors" title="Revoke Access">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error("Failed to load users:", err);
    container.innerHTML = `<div class="p-4 text-center text-rose-500 text-xs">Error loading users.</div>`;
  }
}

async function submitAddAuthorizedUser(e) {
  e.preventDefault();
  const emailInput = document.getElementById('access-user-email');
  const nameInput = document.getElementById('access-user-name');
  const roleSelect = document.getElementById('access-user-role');

  const email = emailInput.value.trim().toLowerCase();
  const name = nameInput.value.trim();
  const role = roleSelect.value;

  if (!email) {
    showToast('Please enter a valid Google email', 'error');
    return;
  }

  try {
    await firebaseManager.addAuthorizedUser(email, name, role);
    emailInput.value = '';
    nameInput.value = '';
    showToast(`Access granted to ${email} as ${role}!`, 'success');
    loadAuthorizedUsersList();
  } catch (err) {
    console.error("Error adding user:", err);
    showToast(err.message || 'Failed to authorize user', 'error');
  }
}

async function handleDeleteAuthorizedUser(email) {
  if (!confirm(`Are you sure you want to revoke access for ${email}?`)) {
    return;
  }

  try {
    await firebaseManager.removeAuthorizedUser(email);
    showToast(`Access revoked for ${email}`, 'info');
    loadAuthorizedUsersList();
  } catch (err) {
    console.error("Error removing user:", err);
    showToast(err.message || 'Failed to remove user', 'error');
  }
}
