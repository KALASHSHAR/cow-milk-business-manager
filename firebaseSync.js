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
  auth: null,
  connected: false,
  config: null,
  currentUser: null,
  currentUserRole: null, // 'Owner', 'Admin', 'Staff', or 'unauthorized'

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

    // Restore saved direct session if available
    const savedUser = localStorage.getItem('gaudhan_active_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.email) {
          this.currentUser = { email: u.email, displayName: u.name, photoURL: u.photoURL || '' };
          this.currentUserRole = u.role || 'Owner';
          this.updateAuthUI(this.currentUser, this.currentUserRole);
        }
      } catch (e) {}
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
      if (typeof firebase.auth === 'function') {
        this.auth = firebase.auth();
        this.initAuthObserver();
      }
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

  initAuthObserver() {
    if (!this.auth) return;
    if (typeof this.auth.getRedirectResult === 'function') {
      this.auth.getRedirectResult().catch(err => {
        console.warn("Redirect result:", err);
      });
    }
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const access = await this.verifyUserAccess(user);
          this.currentUser = user;
          this.currentUserRole = access.role;
          this.updateAuthUI(user, access.role);
          if (typeof closeLoginModal === 'function') closeLoginModal();
          if (typeof loadAuthorizedUsersList === 'function' && (access.role === 'Owner' || access.role === 'Admin')) {
            loadAuthorizedUsersList();
          }
        } catch (err) {
          console.error("Auth access verification error:", err);
          this.currentUser = user;
          this.currentUserRole = 'Staff';
          this.updateAuthUI(user, 'Staff');
          if (typeof closeLoginModal === 'function') closeLoginModal();
        }
      } else {
        // If no firebase auth user, check if we have a direct login saved
        const savedUser = localStorage.getItem('gaudhan_active_user');
        if (savedUser) {
          try {
            const u = JSON.parse(savedUser);
            if (u && u.email) {
              this.currentUser = { email: u.email, displayName: u.name, photoURL: u.photoURL || '' };
              this.currentUserRole = u.role || 'Owner';
              this.updateAuthUI(this.currentUser, this.currentUserRole);
              return;
            }
          } catch(e) {}
        }
        this.currentUser = null;
        this.currentUserRole = null;
        this.updateAuthUI(null, null);
      }
    });
  },

  async verifyUserAccess(user) {
    const email = user.email.toLowerCase();

    // 1. Check in Cloud Firestore
    if (this.db) {
      try {
        const usersCol = await this.db.collection('authorized_users').get();
        if (usersCol.empty) {
          // First user who logs in becomes the Primary Farm Owner!
          const ownerDoc = {
            email: email,
            name: user.displayName || 'Farm Owner',
            role: 'Owner',
            photoURL: user.photoURL || '',
            addedBy: 'System (First Login)'
          };
          await this.db.collection('authorized_users').doc(email).set(ownerDoc);
          // Also sync to local SQLite
          try {
            await fetch('/api/access/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, name: user.displayName, role: 'Owner', photo_url: user.photoURL, added_by: 'System' })
            });
          } catch(e) {}
          return { role: 'Owner', authorized: true };
        }

        const doc = await this.db.collection('authorized_users').doc(email).get();
        if (doc.exists) {
          return { role: doc.data().role || 'Staff', authorized: true };
        }
      } catch (cloudErr) {
        console.warn("Firestore access check error:", cloudErr);
      }
    }

    // 2. Fallback check local SQLite database
    try {
      const res = await fetch('/api/access/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.authorized && data.role) {
        return { role: data.role, authorized: true };
      }
    } catch (localErr) {
      console.warn("Local access check error:", localErr);
    }

    // If not found in authorized users list, mark unauthorized
    return { role: 'unauthorized', authorized: false };
  },

  async signInWithGoogle() {
    if (!this.auth) {
      if (DEFAULT_FIREBASE_CONFIG) this.connect(DEFAULT_FIREBASE_CONFIG);
    }
    if (!this.auth) throw new Error("Firebase Auth is not available. Please check internet connection.");

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const res = await this.auth.signInWithPopup(provider);
      if (res && res.user) {
        localStorage.removeItem('gaudhan_active_user');
        return res.user;
      }
      return null;
    } catch (err) {
      console.warn("Google sign-in popup error:", err);
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error(`Domain/IP '${window.location.hostname}' is not authorized in Firebase Console -> Authentication -> Settings -> Authorized Domains. Add it there, or use Quick Farm Login below!`);
      } else if (err.code === 'auth/operation-not-allowed') {
        throw new Error("Google Sign-In is not enabled yet in your Firebase project. Go to Firebase Console -> Authentication -> Sign-in method -> Enable Google, or use Quick Farm Login below!");
      } else if (err.code === 'auth/popup-blocked') {
        throw new Error("Browser popup was blocked. Please allow popups for this site, or use Quick Farm Login below.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        throw new Error("Sign-in window was closed before completing.");
      } else {
        throw new Error(err.message || "Google sign-in failed. You can sign in using Quick Farm Login below.");
      }
    }
  },

  async signInDirect(email, name = '', role = null) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || cleanEmail.split('@')[0];

    let assignedRole = role;
    if (!assignedRole) {
      const access = await this.verifyUserAccess({ email: cleanEmail, displayName: cleanName, photoURL: '' });
      assignedRole = access.role;
    }

    const photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=0D8ABC&color=fff`;
    const userObj = {
      email: cleanEmail,
      displayName: cleanName,
      photoURL: photoURL
    };

    this.currentUser = userObj;
    this.currentUserRole = assignedRole;
    localStorage.setItem('gaudhan_active_user', JSON.stringify({ email: cleanEmail, name: cleanName, role: assignedRole, photoURL }));
    
    // Sync to SQLite
    try {
      await fetch('/api/access/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: cleanName, role: assignedRole, photo_url: photoURL, added_by: 'Self' })
      });
    } catch(e) {}

    this.updateAuthUI(userObj, assignedRole);
    return userObj;
  },

  async signOutGoogle() {
    if (this.auth) {
      try { await this.auth.signOut(); } catch (e) {}
    }
    this.currentUser = null;
    this.currentUserRole = null;
    localStorage.removeItem('gaudhan_active_user');
    this.updateAuthUI(null, null);
  },

  async getAuthorizedUsers() {
    // 1. Try Firestore
    if (this.db) {
      try {
        const snap = await this.db.collection('authorized_users').get();
        if (!snap.empty) {
          const list = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() }));
          return list;
        }
      } catch (e) {
        console.warn("Firestore get users error:", e);
      }
    }

    // 2. Fallback to SQLite
    try {
      const res = await fetch('/api/access/users');
      const data = await res.json();
      return data.users || [];
    } catch (e) {
      return [];
    }
  },

  async addAuthorizedUser(email, name = '', role = 'Staff') {
    const cleanEmail = email.trim().toLowerCase();
    const payload = {
      email: cleanEmail,
      name: name.trim() || cleanEmail.split('@')[0],
      role: role,
      photoURL: '',
      addedBy: this.currentUser ? this.currentUser.email : 'Admin'
    };

    // Save in Firestore
    if (this.db) {
      try {
        await this.db.collection('authorized_users').doc(cleanEmail).set(payload, { merge: true });
      } catch (e) {
        console.warn("Firestore add user error:", e);
      }
    }

    // Save in SQLite
    await fetch('/api/access/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        name: payload.name,
        role: role,
        added_by: payload.addedBy
      })
    });

    return true;
  },

  async removeAuthorizedUser(email) {
    const cleanEmail = email.trim().toLowerCase();

    // Remove from Firestore
    if (this.db) {
      try {
        await this.db.collection('authorized_users').doc(cleanEmail).delete();
      } catch (e) {
        console.warn("Firestore delete user error:", e);
      }
    }

    // Remove from SQLite
    const res = await fetch(`/api/access/users/${encodeURIComponent(cleanEmail)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return true;
  },

  updateAuthUI(user, role) {
    const btnLogin = document.getElementById('btn-google-login');
    const badge = document.getElementById('userProfileBadge');
    const unauthModal = document.getElementById('unauthorizedModal');
    const lockScreen = document.getElementById('authGuardLockScreen');

    if (user && role && role !== 'unauthorized') {
      if (lockScreen) lockScreen.classList.add('hidden');
    } else {
      if (lockScreen) lockScreen.classList.remove('hidden');
    }

    if (user) {
      if (btnLogin) btnLogin.classList.add('hidden');
      if (badge) badge.classList.remove('hidden');

      const avatar = document.getElementById('userAvatarImg');
      const nameEl = document.getElementById('userDisplayName');
      const roleEl = document.getElementById('userRoleBadge');
      const dropEmail = document.getElementById('userDropdownEmail');
      const dropRole = document.getElementById('userDropdownRole');

      const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=0D8ABC&color=fff`;
      if (avatar) avatar.src = photo;
      if (nameEl) nameEl.innerText = (user.displayName || user.email).split(' ')[0];
      
      const roleText = role === 'Owner' ? '👑 Owner' : (role === 'Admin' ? '🛡️ Admin' : (role === 'Staff' ? '👤 Staff' : '⚠️ Pending'));
      if (roleEl) roleEl.innerText = roleText;
      if (dropEmail) dropEmail.innerText = user.email;
      if (dropRole) dropRole.innerText = roleText;

      // Handle unauthorized lock
      if (role === 'unauthorized') {
        if (unauthModal) {
          unauthModal.classList.remove('hidden');
          const unauthAvatar = document.getElementById('unauth-user-avatar');
          const unauthName = document.getElementById('unauth-user-name');
          const unauthEmail = document.getElementById('unauth-user-email');
          if (unauthAvatar) unauthAvatar.src = photo;
          if (unauthName) unauthName.innerText = user.displayName || 'Google User';
          if (unauthEmail) unauthEmail.innerText = user.email;
        }
      } else {
        if (unauthModal) unauthModal.classList.add('hidden');
      }

      // Hide/Show Admin features
      const isAdminOrOwner = role === 'Owner' || role === 'Admin';
      const manageMenuBtn = document.getElementById('btn-manage-access-menu');
      const moreManageBtn = document.getElementById('btn-more-manage-access');
      if (manageMenuBtn) manageMenuBtn.style.display = isAdminOrOwner ? 'flex' : 'none';
      if (moreManageBtn) moreManageBtn.style.display = isAdminOrOwner ? 'flex' : 'none';
    } else {
      if (btnLogin) btnLogin.classList.remove('hidden');
      if (badge) badge.classList.add('hidden');
      if (unauthModal) unauthModal.classList.add('hidden');
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

  // Compress image to lightweight Base64 so it can be saved in Firestore for 100% FREE without Blaze upgrade
  compressImageToBase64(file, maxWidth = 800, quality = 0.72) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },

  // Upload receipt image: Tries Cloud Storage -> Auto-falls back to lightweight 100% FREE Base64 in Firestore
  async uploadReceipt(file, folder = 'receipts') {
    if (!file) return null;

    // 1. Try Firebase Cloud Storage if active (with fast 2s timeout)
    if (this.connected && this.storage) {
      try {
        const ext = file.name.split('.').pop() || 'jpg';
        const filename = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const fileRef = this.storage.ref().child(filename);

        const uploadTask = fileRef.put(file).then(snap => snap.ref.getDownloadURL());
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage requires Blaze or timed out')), 2000));
        const url = await Promise.race([uploadTask, timeout]);
        if (url) return url;
      } catch (err) {
        console.warn("Cloud Storage bucket not active, using compressed Firestore storage (100% Free):", err.message);
      }
    }

    // 2. 100% FREE Solution: Compress to clean JPEG Base64 and store directly in Firestore document
    try {
      const base64 = await this.compressImageToBase64(file);
      if (base64) return base64;
    } catch (err) {
      console.warn("Base64 compression failed:", err);
    }

    // 3. Fallback: local server /uploads folder
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      const res = await fetch('/api/upload-receipt', { method: 'POST', body: formData });
      const d = await res.json();
      if (d.success) return d.filename;
    } catch (e) {}

    return null;
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

    // 3-second timeout for Firestore write
    const writePromise = this.db.collection('milk_sales').add(docData);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timeout')), 3000)
    );

    const docRef = await Promise.race([writePromise, timeoutPromise]);
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

    const feedPromise = (async () => {
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
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore feed write timeout')), 3000)
    );

    return await Promise.race([feedPromise, timeoutPromise]);
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

    const writePromise = this.db.collection('expenses').add(docData).then(docRef => docRef.id);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore expense write timeout')), 3000)
    );

    return await Promise.race([writePromise, timeoutPromise]);
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
