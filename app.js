(() => {
  const STORAGE_KEYS = {
    db: 'keydup_inventory_db_v4',
    categories: 'keydup_categories',
    items: 'keydup_items',
    inventory: 'keydup_inventory',
    sales: 'keydup_sales',
    purchases: 'keydup_purchases'
  };
  const SESSION_KEY = 'keydup_admin_logged_in';
  const LOGIN_PAGE = 'login.html';

  const appState = {
    currentSection: 'home',
    categories: [],
    items: [],
    inventory: [], // manual inventory only
    sales: [],
    purchases: []
  };

  const sectionMeta = {
    home: { title: 'Home', subtitle: 'Ringkasan performa stok, penjualan, dan aktivitas terbaru.' },
    items: { title: 'Items', subtitle: 'Kelola kategori manual dan seluruh data item.' },
    inventory: { title: 'Inventory', subtitle: 'Atur stok masuk dan stok keluar secara real time.' },
    sales: { title: 'Sales', subtitle: 'Input penjualan dan pantau revenue usaha.' },
    purchases: { title: 'Purchases', subtitle: 'Catat pembelian dari supplier dan tambah stok otomatis.' }
  };

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => [...document.querySelectorAll(sel)];
  const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const toInt = (v) => Number.parseInt(v, 10) || 0;
  const toNumber = (v) => Number(v || 0) || 0;
  const toCurrency = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
  const escapeHtml = (str) => String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function nowISO() {
    return new Date().toISOString();
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function safeParse(json, fallback) {
    try {
      const parsed = JSON.parse(json);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function cloneStateSnapshot(state = appState) {
    return {
      categories: state.categories.map((row) => ({ ...row })),
      items: state.items.map((row) => ({ ...row })),
      inventory: state.inventory.map((row) => ({ ...row })),
      sales: state.sales.map((row) => ({ ...row })),
      purchases: state.purchases.map((row) => ({ ...row }))
    };
  }

  function normalizeState(raw) {
    const categories = Array.isArray(raw.categories) ? raw.categories : [];
    const items = Array.isArray(raw.items) ? raw.items : [];
    const inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
    const sales = Array.isArray(raw.sales) ? raw.sales : [];
    const purchases = Array.isArray(raw.purchases) ? raw.purchases : [];

    const normalized = {
      categories: categories
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          id: row.id || uid('cat'),
          name: String(row.name || '').trim(),
          createdAt: row.createdAt || nowISO(),
          updatedAt: row.updatedAt || ''
        }))
        .filter((row) => row.name),
      items: items
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          id: row.id || uid('item'),
          itemId: String(row.itemId || '').trim(),
          name: String(row.name || '').trim(),
          categoryId: row.categoryId || '',
          subCategory: String(row.subCategory || '').trim(),
          type: String(row.type || '').trim(),
          initialStock: toInt(row.initialStock),
          minStock: Math.max(0, toInt(row.minStock)),
          costPrice: Math.max(0, toNumber(row.costPrice)),
          sellPrice: Math.max(0, toNumber(row.sellPrice)),
          stock: toInt(row.stock),
          createdAt: row.createdAt || nowISO(),
          updatedAt: row.updatedAt || ''
        }))
        .filter((row) => row.itemId && row.name),
      inventory: inventory
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          id: row.id || uid('inv'),
          itemId: row.itemId || '',
          type: row.type === 'OUT' ? 'OUT' : 'IN',
          qty: Math.max(0, toInt(row.qty)),
          note: String(row.note || '').trim(),
          source: 'manual',
          date: row.date || nowISO(),
          createdAt: row.createdAt || row.date || nowISO(),
          updatedAt: row.updatedAt || ''
        }))
        .filter((row) => row.itemId && row.qty > 0),
      sales: sales
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          id: row.id || uid('sale'),
          customer: String(row.customer || '').trim(),
          itemId: row.itemId || '',
          qty: Math.max(0, toInt(row.qty)),
          status: row.status === 'Pending' ? 'Pending' : 'Selesai',
          sellPrice: Math.max(0, toNumber(row.sellPrice)),
          total: Math.max(0, toNumber(row.total)),
          date: row.date || nowISO(),
          createdAt: row.createdAt || row.date || nowISO(),
          updatedAt: row.updatedAt || ''
        }))
        .filter((row) => row.customer && row.itemId && row.qty > 0),
      purchases: purchases
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          id: row.id || uid('purchase'),
          supplier: String(row.supplier || '').trim(),
          itemId: row.itemId || '',
          qty: Math.max(0, toInt(row.qty)),
          status: row.status === 'Pending' ? 'Pending' : 'Selesai',
          costPrice: Math.max(0, toNumber(row.costPrice)),
          total: Math.max(0, toNumber(row.total)),
          date: row.date || nowISO(),
          createdAt: row.createdAt || row.date || nowISO(),
          updatedAt: row.updatedAt || ''
        }))
        .filter((row) => row.supplier && row.itemId && row.qty > 0)
    };

    return normalized;
  }

  function projectItems(items, inventory, sales, purchases) {
    const projected = items.map((item) => ({
      ...item,
      initialStock: Math.max(0, toInt(item.initialStock)),
      minStock: Math.max(0, toInt(item.minStock)),
      costPrice: Math.max(0, toNumber(item.costPrice)),
      sellPrice: Math.max(0, toNumber(item.sellPrice)),
      stock: Math.max(0, toInt(item.initialStock))
    }));

    const map = new Map(projected.map((item) => [item.id, item]));
    inventory.forEach((row) => {
      const item = map.get(row.itemId);
      if (!item) return;
      item.stock += row.type === 'IN' ? toInt(row.qty) : -toInt(row.qty);
    });
    purchases.forEach((row) => {
      const item = map.get(row.itemId);
      if (!item) return;
      item.stock += toInt(row.qty);
    });
    sales.forEach((row) => {
      const item = map.get(row.itemId);
      if (!item) return;
      item.stock -= toInt(row.qty);
    });

    return projected;
  }

  function syncComputedStocks(targetState = appState) {
    targetState.items = projectItems(targetState.items, targetState.inventory, targetState.sales, targetState.purchases)
      .map((item) => ({
        ...item,
        stock: Math.max(0, toInt(item.stock))
      }));
  }

  function validateNonNegativeStocks(stateLike) {
    const projected = projectItems(stateLike.items, stateLike.inventory, stateLike.sales, stateLike.purchases);
    const negatives = projected.filter((item) => item.stock < 0);
    return { projected, negatives };
  }

  function legacySnapshotFromStorage() {
    return {
      categories: safeParse(localStorage.getItem(STORAGE_KEYS.categories), []),
      items: safeParse(localStorage.getItem(STORAGE_KEYS.items), []),
      inventory: safeParse(localStorage.getItem(STORAGE_KEYS.inventory), []),
      sales: safeParse(localStorage.getItem(STORAGE_KEYS.sales), []),
      purchases: safeParse(localStorage.getItem(STORAGE_KEYS.purchases), [])
    };
  }

  function persistState({ syncLegacy = false } = {}) {
    const dbPayload = {
      version: 4,
      savedAt: nowISO(),
      data: cloneStateSnapshot()
    };
    localStorage.setItem(STORAGE_KEYS.db, JSON.stringify(dbPayload));

    if (syncLegacy) {
      localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(appState.categories));
      localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(appState.items));
      localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(appState.inventory));
      localStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(appState.sales));
      localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(appState.purchases));
    }
  }

  function cleanupLegacyKeys() {
    [STORAGE_KEYS.categories, STORAGE_KEYS.items, STORAGE_KEYS.inventory, STORAGE_KEYS.sales, STORAGE_KEYS.purchases]
      .forEach((key) => localStorage.removeItem(key));
  }

  function loadState() {
    const savedDb = safeParse(localStorage.getItem(STORAGE_KEYS.db), null);

    if (savedDb && savedDb.data) {
      const normalized = normalizeState(savedDb.data);
      appState.categories = normalized.categories;
      appState.items = normalized.items;
      appState.inventory = normalized.inventory;
      appState.sales = normalized.sales;
      appState.purchases = normalized.purchases;
      syncComputedStocks(appState);
      persistState();
      return;
    }

    const legacy = legacySnapshotFromStorage();
    const hasLegacyData = [legacy.categories, legacy.items, legacy.inventory, legacy.sales, legacy.purchases]
      .some((list) => Array.isArray(list) && list.length);

    const normalized = normalizeState(legacy);
    appState.categories = normalized.categories;
    appState.items = normalized.items;
    appState.inventory = normalized.inventory.filter((row) => row.source === 'manual');
    appState.sales = normalized.sales;
    appState.purchases = normalized.purchases;
    syncComputedStocks(appState);
    persistState();
    if (hasLegacyData) cleanupLegacyKeys();
  }

  function getCategoryById(id) {
    return appState.categories.find((cat) => cat.id === id);
  }

  function getItemById(id) {
    return appState.items.find((item) => item.id === id);
  }

  function getCategoryName(categoryId) {
    return getCategoryById(categoryId)?.name || '-';
  }

  function getCombinedInventoryRows() {
    const manualRows = appState.inventory.map((row) => ({
      id: row.id,
      refId: row.id,
      source: 'manual',
      itemId: row.itemId,
      type: row.type,
      qty: toInt(row.qty),
      note: row.note || '-',
      date: row.date,
      editable: true
    }));

    const salesRows = appState.sales.map((row) => ({
      id: `sale-${row.id}`,
      refId: row.id,
      source: 'sales',
      itemId: row.itemId,
      type: 'OUT',
      qty: toInt(row.qty),
      note: `Penjualan ke ${row.customer} (${row.status})`,
      date: row.date,
      editable: false
    }));

    const purchaseRows = appState.purchases.map((row) => ({
      id: `purchase-${row.id}`,
      refId: row.id,
      source: 'purchases',
      itemId: row.itemId,
      type: 'IN',
      qty: toInt(row.qty),
      note: `Pembelian dari ${row.supplier} (${row.status})`,
      date: row.date,
      editable: false
    }));

    return [...manualRows, ...salesRows, ...purchaseRows]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function computeRecentActivities(limit = 8) {
    return getCombinedInventoryRows()
      .map((row) => ({
        type: row.type === 'IN' ? 'stok-masuk' : 'stok-keluar',
        date: row.date,
        title: `${row.type === 'IN' ? 'Stok Masuk' : 'Stok Keluar'} • ${getItemById(row.itemId)?.name || 'Item tidak ditemukan'}`,
        subtitle: `${row.source} • Qty ${row.qty}${row.note ? ' • ' + row.note : ''}`,
        badge: row.type === 'IN' ? 'success' : 'warning'
      }))
      .slice(0, limit);
  }

  function calculateDashboard() {
    const totalItems = appState.items.length;
    const totalStock = appState.items.reduce((sum, item) => sum + toInt(item.stock), 0);
    const inventoryValue = appState.items.reduce((sum, item) => sum + (toInt(item.stock) * toNumber(item.costPrice)), 0);
    const totalSalesValue = appState.sales.reduce((sum, sale) => sum + toNumber(sale.total), 0);
    const lowStock = appState.items.filter((item) => toInt(item.stock) <= toInt(item.minStock));
    return { totalItems, totalStock, inventoryValue, totalSalesValue, lowStock };
  }

  function showToast(message, kind = 'success') {
    const toastWrap = qs('#toastWrap');
    if (!toastWrap) return;
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.innerHTML = `<strong style="display:block;margin-bottom:4px">${kind === 'error' ? 'Gagal' : kind === 'warning' ? 'Perhatian' : 'Berhasil'}</strong><div>${escapeHtml(message)}</div>`;
    toastWrap.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function openSection(sectionName) {
    appState.currentSection = sectionName;
    qsa('.section').forEach((section) => section.classList.remove('active'));
    qsa('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.section === sectionName));
    const target = qs(`#section-${sectionName}`);
    if (target) target.classList.add('active');
    qs('#pageTitle').textContent = sectionMeta[sectionName].title;
    qs('#pageSubtitle').textContent = sectionMeta[sectionName].subtitle;
    closeSidebar();
  }

  function openSidebar() {
    qs('#sidebar').classList.add('show');
    qs('#sidebarBackdrop').classList.add('show');
  }

  function closeSidebar() {
    qs('#sidebar').classList.remove('show');
    qs('#sidebarBackdrop').classList.remove('show');
  }

  function getFilteredItems() {
    const keyword = qs('#itemSearch').value.trim().toLowerCase();
    const categoryFilter = qs('#itemCategoryFilter').value;
    const subCategoryFilter = qs('#itemSubCategoryFilter').value;

    return appState.items
      .filter((item) => {
        const categoryName = getCategoryName(item.categoryId).toLowerCase();
        const fields = [
          item.itemId,
          item.name,
          categoryName,
          item.subCategory || '',
          item.type || ''
        ].join(' ').toLowerCase();

        const matchesKeyword = !keyword || fields.includes(keyword);
        const matchesCategory = !categoryFilter || item.categoryId === categoryFilter;
        const matchesSubCategory = !subCategoryFilter || item.subCategory === subCategoryFilter;
        return matchesKeyword && matchesCategory && matchesSubCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }

  function refreshSelectOptions() {
    const categoryOptions = appState.categories.length
      ? `<option value="">Pilih kategori</option>${appState.categories.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}`
      : `<option value="">Belum ada kategori</option>`;

    const itemCategoryEl = qs('#itemCategory');
    const currentItemCategory = itemCategoryEl.value;
    itemCategoryEl.innerHTML = categoryOptions;
    if (appState.categories.some((cat) => cat.id === currentItemCategory)) {
      itemCategoryEl.value = currentItemCategory;
    }

    const filterCategoryOptions = `<option value="">Semua kategori</option>${appState.categories.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}`;
    const currentCategoryFilter = qs('#itemCategoryFilter').value;
    qs('#itemCategoryFilter').innerHTML = filterCategoryOptions;
    if (appState.categories.some((cat) => cat.id === currentCategoryFilter)) {
      qs('#itemCategoryFilter').value = currentCategoryFilter;
    }

    const selectedCategoryFilter = qs('#itemCategoryFilter').value;
    const subCategorySource = selectedCategoryFilter
      ? appState.items.filter((item) => item.categoryId === selectedCategoryFilter)
      : appState.items;

    const uniqueSubCats = [...new Set(subCategorySource.map((item) => item.subCategory).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'id'));
    const currentSubCategoryFilter = qs('#itemSubCategoryFilter').value;
    qs('#itemSubCategoryFilter').innerHTML = `<option value="">Semua sub kategori</option>${uniqueSubCats.map((sc) => `<option value="${escapeHtml(sc)}">${escapeHtml(sc)}</option>`).join('')}`;
    if (uniqueSubCats.includes(currentSubCategoryFilter)) {
      qs('#itemSubCategoryFilter').value = currentSubCategoryFilter;
    }

    const itemOptions = appState.items.length
      ? `<option value="">Pilih item</option>${appState.items.map((item) => `<option value="${item.id}">${escapeHtml(item.itemId)} - ${escapeHtml(item.name)} (Stok: ${item.stock})</option>`).join('')}`
      : `<option value="">Belum ada item</option>`;

    ['#inventoryItem', '#salesItem', '#purchaseItem'].forEach((sel) => {
      const el = qs(sel);
      const currentVal = el.value;
      el.innerHTML = itemOptions;
      if (appState.items.some((item) => item.id === currentVal)) {
        el.value = currentVal;
      }
    });
  }

  function renderHome() {
    const summary = calculateDashboard();
    qs('#homeTotalItems').textContent = summary.totalItems;
    qs('#homeTotalStock').textContent = summary.totalStock;
    qs('#homeInventoryValue').textContent = toCurrency(summary.inventoryValue);
    qs('#homeTotalSalesValue').textContent = toCurrency(summary.totalSalesValue);
    qs('#heroCategoryCount').textContent = appState.categories.length;
    qs('#heroLowStockCount').textContent = summary.lowStock.length;
    qs('#heroSalesCount').textContent = appState.sales.length;
    qs('#heroPurchaseCount').textContent = appState.purchases.length;

    const lowWrap = qs('#lowStockList');
    if (!summary.lowStock.length) {
      lowWrap.innerHTML = `<div class="empty-state">Belum ada item yang stoknya menipis.</div>`;
    } else {
      lowWrap.innerHTML = `<div class="list-plain">${summary.lowStock
        .slice()
        .sort((a, b) => a.stock - b.stock)
        .map((item) => `
          <div class="list-row">
            <div class="stack">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="small muted">${escapeHtml(item.itemId)} • ${escapeHtml(getCategoryName(item.categoryId))} • ${escapeHtml(item.subCategory || '-')}</span>
            </div>
            <div class="stack" style="text-align:right">
              <span class="badge danger">Stok ${item.stock}</span>
              <span class="small muted">Min ${item.minStock}</span>
            </div>
          </div>
        `).join('')}</div>`;
    }

    const recent = computeRecentActivities(8);
    const recentWrap = qs('#recentActivityList');
    if (!recent.length) {
      recentWrap.innerHTML = `<div class="empty-state">Belum ada aktivitas terbaru.</div>`;
    } else {
      recentWrap.innerHTML = `<div class="list-plain">${recent.map((act) => `
        <div class="list-row">
          <div class="stack">
            <strong>${escapeHtml(act.title)}</strong>
            <span class="small muted">${escapeHtml(act.subtitle)}</span>
          </div>
          <div class="stack" style="text-align:right">
            <span class="badge ${act.badge}">${act.type}</span>
            <span class="small muted">${formatDate(act.date)}</span>
          </div>
        </div>
      `).join('')}</div>`;
    }
  }

  function renderCategories() {
    const tbody = qs('#categoryTableBody');
    if (!appState.categories.length) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">Belum ada kategori. Tambahkan kategori terlebih dahulu.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = appState.categories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
      .map((category) => {
        const count = appState.items.filter((item) => item.categoryId === category.id).length;
        return `
          <tr>
            <td>
              <strong>${escapeHtml(category.name)}</strong>
              <span class="subtext">Dibuat: ${formatDate(category.createdAt)}</span>
            </td>
            <td>${count}</td>
            <td class="actions-cell no-print">
              <button class="btn secondary small" data-action="edit-category" data-id="${category.id}">Edit</button>
              <button class="btn danger small" data-action="delete-category" data-id="${category.id}">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
  }

  function renderItems() {
    const tbody = qs('#itemsTableBody');
    const filteredItems = getFilteredItems();

    if (!filteredItems.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">Belum ada item yang cocok dengan filter.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = filteredItems
      .map((item) => `
        <tr>
          <td>
            <strong>${escapeHtml(item.itemId)}</strong>
            <span class="subtext">${escapeHtml(item.name)}</span>
          </td>
          <td>${escapeHtml(getCategoryName(item.categoryId))}</td>
          <td>${escapeHtml(item.subCategory || '-')}</td>
          <td>${escapeHtml(item.type || '-')}</td>
          <td><span class="badge ${toInt(item.stock) <= toInt(item.minStock) ? 'danger' : 'success'}">${item.stock}</span></td>
          <td>${item.minStock}</td>
          <td>${toCurrency(item.costPrice)}</td>
          <td>${toCurrency(item.sellPrice)}</td>
          <td class="actions-cell no-print">
            <button class="btn secondary small" data-action="edit-item" data-id="${item.id}">Edit</button>
            <button class="btn danger small" data-action="delete-item" data-id="${item.id}">Delete</button>
          </td>
        </tr>
      `).join('');
  }

  function renderInventory() {
    const combinedRows = getCombinedInventoryRows();
    const totalIn = combinedRows.filter((row) => row.type === 'IN').reduce((sum, row) => sum + toInt(row.qty), 0);
    const totalOut = combinedRows.filter((row) => row.type === 'OUT').reduce((sum, row) => sum + toInt(row.qty), 0);

    qs('#inventoryTotalMovement').textContent = combinedRows.length;
    qs('#inventoryTotalIn').textContent = totalIn;
    qs('#inventoryTotalOut').textContent = totalOut;
    qs('#inventoryNetMovement').textContent = totalIn - totalOut;

    const summaryWrap = qs('#inventorySummaryList');
    if (!appState.items.length) {
      summaryWrap.innerHTML = `<div class="empty-state">Belum ada item untuk diringkas.</div>`;
    } else {
      summaryWrap.innerHTML = `<div class="list-plain">${appState.items
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'id'))
        .map((item) => `
          <div class="list-row">
            <div class="stack">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="small muted">${escapeHtml(item.itemId)} • ${escapeHtml(getCategoryName(item.categoryId))}</span>
            </div>
            <div class="stack" style="text-align:right">
              <span class="badge ${toInt(item.stock) <= toInt(item.minStock) ? 'danger' : 'success'}">Stok ${item.stock}</span>
              <span class="small muted">Min ${item.minStock}</span>
            </div>
          </div>
        `).join('')}</div>`;
    }

    const tbody = qs('#inventoryTableBody');
    if (!combinedRows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">Belum ada riwayat inventory.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = combinedRows.map((row) => `
      <tr>
        <td>${formatDate(row.date)}</td>
        <td>${escapeHtml(getItemById(row.itemId)?.name || '-')}</td>
        <td><span class="badge ${row.type === 'IN' ? 'success' : 'warning'}">${row.type}</span></td>
        <td>${row.qty}</td>
        <td><span class="pill">${escapeHtml(row.source)}</span></td>
        <td>${escapeHtml(row.note || '-')}</td>
        <td class="actions-cell no-print">
          ${row.editable
            ? `<button class="btn secondary small" data-action="edit-inventory" data-id="${row.refId}">Edit</button>
               <button class="btn danger small" data-action="delete-inventory" data-id="${row.refId}">Delete</button>`
            : `<button class="btn secondary small" data-action="open-${row.source}" data-id="${row.refId}">Buka ${row.source === 'sales' ? 'Sales' : 'Purchases'}</button>`}
        </td>
      </tr>
    `).join('');
  }

  function renderSales() {
    const totalRevenue = appState.sales.reduce((sum, row) => sum + toNumber(row.total), 0);
    const done = appState.sales.filter((row) => row.status === 'Selesai').length;
    const pending = appState.sales.filter((row) => row.status === 'Pending').length;

    qs('#salesTotalTransactions').textContent = appState.sales.length;
    qs('#salesTotalRevenue').textContent = toCurrency(totalRevenue);
    qs('#salesDoneCount').textContent = done;
    qs('#salesPendingCount').textContent = pending;

    const insightWrap = qs('#salesInsightList');
    const topSales = appState.sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (!topSales.length) {
      insightWrap.innerHTML = `<div class="empty-state">Belum ada penjualan tercatat.</div>`;
    } else {
      insightWrap.innerHTML = `<div class="list-plain">${topSales.map((row) => `
        <div class="list-row">
          <div class="stack">
            <strong>${escapeHtml(row.customer)}</strong>
            <span class="small muted">${escapeHtml(getItemById(row.itemId)?.name || '-')} • Qty ${row.qty}</span>
          </div>
          <div class="stack" style="text-align:right">
            <span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span>
            <span class="small muted">${toCurrency(row.total)}</span>
          </div>
        </div>
      `).join('')}</div>`;
    }

    const tbody = qs('#salesTableBody');
    if (!appState.sales.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">Belum ada data penjualan.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = appState.sales
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((row) => `
        <tr>
          <td>${formatDate(row.date)}</td>
          <td>${escapeHtml(row.customer)}</td>
          <td>${escapeHtml(getItemById(row.itemId)?.name || '-')}</td>
          <td>${row.qty}</td>
          <td><span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span></td>
          <td>${toCurrency(row.sellPrice)}</td>
          <td>${toCurrency(row.total)}</td>
          <td class="actions-cell no-print">
            <button class="btn secondary small" data-action="edit-sale" data-id="${row.id}">Edit</button>
            <button class="btn danger small" data-action="delete-sale" data-id="${row.id}">Delete</button>
          </td>
        </tr>
      `).join('');
  }

  function renderPurchases() {
    const totalCost = appState.purchases.reduce((sum, row) => sum + toNumber(row.total), 0);
    const done = appState.purchases.filter((row) => row.status === 'Selesai').length;
    const pending = appState.purchases.filter((row) => row.status === 'Pending').length;

    qs('#purchaseTotalTransactions').textContent = appState.purchases.length;
    qs('#purchaseTotalCost').textContent = toCurrency(totalCost);
    qs('#purchaseDoneCount').textContent = done;
    qs('#purchasePendingCount').textContent = pending;

    const insightWrap = qs('#purchaseInsightList');
    const recentPurchases = appState.purchases.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (!recentPurchases.length) {
      insightWrap.innerHTML = `<div class="empty-state">Belum ada pembelian tercatat.</div>`;
    } else {
      insightWrap.innerHTML = `<div class="list-plain">${recentPurchases.map((row) => `
        <div class="list-row">
          <div class="stack">
            <strong>${escapeHtml(row.supplier)}</strong>
            <span class="small muted">${escapeHtml(getItemById(row.itemId)?.name || '-')} • Qty ${row.qty}</span>
          </div>
          <div class="stack" style="text-align:right">
            <span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span>
            <span class="small muted">${toCurrency(row.total)}</span>
          </div>
        </div>
      `).join('')}</div>`;
    }

    const tbody = qs('#purchaseTableBody');
    if (!appState.purchases.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">Belum ada data pembelian.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = appState.purchases
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((row) => `
        <tr>
          <td>${formatDate(row.date)}</td>
          <td>${escapeHtml(row.supplier)}</td>
          <td>${escapeHtml(getItemById(row.itemId)?.name || '-')}</td>
          <td>${row.qty}</td>
          <td><span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span></td>
          <td>${toCurrency(row.costPrice)}</td>
          <td>${toCurrency(row.total)}</td>
          <td class="actions-cell no-print">
            <button class="btn secondary small" data-action="edit-purchase" data-id="${row.id}">Edit</button>
            <button class="btn danger small" data-action="delete-purchase" data-id="${row.id}">Delete</button>
          </td>
        </tr>
      `).join('');
  }

  function renderAll() {
    refreshSelectOptions();
    renderHome();
    renderCategories();
    renderItems();
    renderInventory();
    renderSales();
    renderPurchases();
  }

  function resetCategoryForm() {
    qs('#categoryEditId').value = '';
    qs('#categoryName').value = '';
    qs('#saveCategoryBtn').textContent = 'Simpan Kategori';
  }

  function resetItemForm() {
    qs('#itemEditId').value = '';
    qs('#itemCode').value = '';
    qs('#itemName').value = '';
    qs('#itemCategory').value = '';
    qs('#itemSubCategory').value = '';
    qs('#itemType').value = '';
    qs('#itemInitialStock').value = '';
    qs('#itemMinStock').value = '';
    qs('#itemCostPrice').value = '';
    qs('#itemSellPrice').value = '';
    qs('#saveItemBtn').textContent = 'Simpan Item';
  }

  function resetInventoryForm() {
    qs('#inventoryEditId').value = '';
    qs('#inventoryItem').value = '';
    qs('#inventoryType').value = 'IN';
    qs('#inventoryQty').value = '';
    qs('#inventoryNote').value = '';
    qs('#saveInventoryBtn').textContent = 'Simpan Movement';
  }

  function resetSalesForm() {
    qs('#salesEditId').value = '';
    qs('#salesCustomer').value = '';
    qs('#salesItem').value = '';
    qs('#salesQty').value = '';
    qs('#salesStatus').value = 'Selesai';
    qs('#saveSalesBtn').textContent = 'Simpan Penjualan';
  }

  function resetPurchaseForm() {
    qs('#purchaseEditId').value = '';
    qs('#purchaseSupplier').value = '';
    qs('#purchaseItem').value = '';
    qs('#purchaseQty').value = '';
    qs('#purchaseStatus').value = 'Selesai';
    qs('#savePurchaseBtn').textContent = 'Simpan Pembelian';
  }

  function ensureValidProjectedState(nextState, messageWhenNegative) {
    const normalized = normalizeState(nextState);
    const validation = validateNonNegativeStocks(normalized);
    if (validation.negatives.length) {
      const problemItem = validation.negatives[0];
      showToast(messageWhenNegative || `Stok untuk item "${problemItem.name}" menjadi minus.`, 'error');
      return null;
    }
    normalized.items = validation.projected.map((item) => ({
      ...item,
      stock: toInt(item.stock)
    }));
    return normalized;
  }

  function applyStateAndRender(nextState, successMessage, options = {}) {
    appState.categories = nextState.categories;
    appState.items = nextState.items;
    appState.inventory = nextState.inventory;
    appState.sales = nextState.sales;
    appState.purchases = nextState.purchases;
    persistState(options.persistOptions || {});
    renderAll();
    if (typeof options.afterRender === 'function') options.afterRender();
    if (successMessage) showToast(successMessage, options.kind || 'success');
  }

  function handleCategorySubmit(e) {
    e.preventDefault();
    const name = qs('#categoryName').value.trim();
    const editId = qs('#categoryEditId').value;
    if (!name) {
      showToast('Nama kategori wajib diisi.', 'error');
      return;
    }

    const duplicate = appState.categories.find((cat) => cat.name.toLowerCase() === name.toLowerCase() && cat.id !== editId);
    if (duplicate) {
      showToast('Nama kategori sudah ada.', 'error');
      return;
    }

    const nextState = cloneStateSnapshot();
    if (editId) {
      const category = nextState.categories.find((row) => row.id === editId);
      if (!category) {
        showToast('Kategori tidak ditemukan.', 'error');
        return;
      }
      category.name = name;
      category.updatedAt = nowISO();
      const finalized = ensureValidProjectedState(nextState);
      if (!finalized) return;
      applyStateAndRender(finalized, 'Kategori berhasil diperbarui.');
    } else {
      nextState.categories.push({
        id: uid('cat'),
        name,
        createdAt: nowISO(),
        updatedAt: ''
      });
      const finalized = ensureValidProjectedState(nextState);
      if (!finalized) return;
      applyStateAndRender(finalized, 'Kategori berhasil ditambahkan.');
    }
    resetCategoryForm();
  }

  function handleItemSubmit(e) {
    e.preventDefault();

    if (!appState.categories.length) {
      showToast('Buat kategori terlebih dahulu sebelum menambah item.', 'error');
      return;
    }

    const editId = qs('#itemEditId').value;
    const payload = {
      itemId: qs('#itemCode').value.trim(),
      name: qs('#itemName').value.trim(),
      categoryId: qs('#itemCategory').value,
      subCategory: qs('#itemSubCategory').value.trim(),
      type: qs('#itemType').value.trim(),
      initialStock: Math.max(0, toInt(qs('#itemInitialStock').value)),
      minStock: Math.max(0, toInt(qs('#itemMinStock').value)),
      costPrice: Math.max(0, toNumber(qs('#itemCostPrice').value)),
      sellPrice: Math.max(0, toNumber(qs('#itemSellPrice').value))
    };

    if (!payload.itemId || !payload.name || !payload.categoryId || !payload.subCategory || !payload.type) {
      showToast('Lengkapi semua field item terlebih dahulu.', 'error');
      return;
    }

    if (!getCategoryById(payload.categoryId)) {
      showToast('Kategori item tidak valid.', 'error');
      return;
    }

    const duplicate = appState.items.find((item) => item.itemId.toLowerCase() === payload.itemId.toLowerCase() && item.id !== editId);
    if (duplicate) {
      showToast('ID Item sudah digunakan.', 'error');
      return;
    }

    const nextState = cloneStateSnapshot();
    if (editId) {
      const item = nextState.items.find((row) => row.id === editId);
      if (!item) {
        showToast('Item tidak ditemukan.', 'error');
        return;
      }
      Object.assign(item, payload, { updatedAt: nowISO() });
      const finalized = ensureValidProjectedState(nextState, 'Perubahan item membuat stok minus. Kurangi transaksi keluar atau naikkan stok awal.');
      if (!finalized) return;
      applyStateAndRender(finalized, 'Item berhasil diperbarui.');
    } else {
      nextState.items.push({
        id: uid('item'),
        ...payload,
        stock: payload.initialStock,
        createdAt: nowISO(),
        updatedAt: ''
      });
      const finalized = ensureValidProjectedState(nextState);
      if (!finalized) return;
      applyStateAndRender(finalized, 'Item berhasil ditambahkan.');
    }

    resetItemForm();
  }

  function handleInventorySubmit(e) {
    e.preventDefault();
    const editId = qs('#inventoryEditId').value;
    const itemId = qs('#inventoryItem').value;
    const type = qs('#inventoryType').value;
    const qty = Math.max(0, toInt(qs('#inventoryQty').value));
    const note = qs('#inventoryNote').value.trim();

    if (!itemId || !getItemById(itemId)) {
      showToast('Pilih item terlebih dahulu.', 'error');
      return;
    }
    if (qty <= 0) {
      showToast('Jumlah movement harus lebih dari 0.', 'error');
      return;
    }

    const nextState = cloneStateSnapshot();
    if (editId) {
      const row = nextState.inventory.find((entry) => entry.id === editId);
      if (!row) {
        showToast('Data inventory tidak ditemukan.', 'error');
        return;
      }
      row.itemId = itemId;
      row.type = type;
      row.qty = qty;
      row.note = note;
      row.updatedAt = nowISO();
    } else {
      nextState.inventory.push({
        id: uid('inv'),
        itemId,
        type,
        qty,
        note,
        source: 'manual',
        date: nowISO(),
        createdAt: nowISO(),
        updatedAt: ''
      });
    }

    const finalized = ensureValidProjectedState(nextState, 'Stok keluar melebihi stok yang tersedia.');
    if (!finalized) return;

    applyStateAndRender(finalized, editId ? 'Movement inventory berhasil diperbarui.' : `Movement ${type} berhasil disimpan.`);
    resetInventoryForm();
  }

  function handleSalesSubmit(e) {
    e.preventDefault();
    const editId = qs('#salesEditId').value;
    const customer = qs('#salesCustomer').value.trim();
    const itemId = qs('#salesItem').value;
    const qty = Math.max(0, toInt(qs('#salesQty').value));
    const status = qs('#salesStatus').value;
    const item = getItemById(itemId);

    if (!customer || !itemId || !item || qty <= 0) {
      showToast('Lengkapi data penjualan dengan benar.', 'error');
      return;
    }

    const nextState = cloneStateSnapshot();
    const currentItem = nextState.items.find((row) => row.id === itemId);
    const sellPrice = toNumber(currentItem?.sellPrice || item.sellPrice);
    const total = qty * sellPrice;

    if (editId) {
      const sale = nextState.sales.find((row) => row.id === editId);
      if (!sale) {
        showToast('Data penjualan tidak ditemukan.', 'error');
        return;
      }
      sale.customer = customer;
      sale.itemId = itemId;
      sale.qty = qty;
      sale.status = status;
      sale.sellPrice = sellPrice;
      sale.total = total;
      sale.updatedAt = nowISO();
    } else {
      nextState.sales.push({
        id: uid('sale'),
        customer,
        itemId,
        qty,
        status,
        sellPrice,
        total,
        date: nowISO(),
        createdAt: nowISO(),
        updatedAt: ''
      });
    }

    const finalized = ensureValidProjectedState(nextState, 'Stok item tidak cukup untuk penjualan ini.');
    if (!finalized) return;

    applyStateAndRender(finalized, editId ? 'Penjualan berhasil diperbarui.' : 'Penjualan berhasil disimpan.');
    resetSalesForm();
  }

  function handlePurchaseSubmit(e) {
    e.preventDefault();
    const editId = qs('#purchaseEditId').value;
    const supplier = qs('#purchaseSupplier').value.trim();
    const itemId = qs('#purchaseItem').value;
    const qty = Math.max(0, toInt(qs('#purchaseQty').value));
    const status = qs('#purchaseStatus').value;
    const item = getItemById(itemId);

    if (!supplier || !itemId || !item || qty <= 0) {
      showToast('Lengkapi data pembelian dengan benar.', 'error');
      return;
    }

    const nextState = cloneStateSnapshot();
    const currentItem = nextState.items.find((row) => row.id === itemId);
    const costPrice = toNumber(currentItem?.costPrice || item.costPrice);
    const total = qty * costPrice;

    if (editId) {
      const purchase = nextState.purchases.find((row) => row.id === editId);
      if (!purchase) {
        showToast('Data pembelian tidak ditemukan.', 'error');
        return;
      }
      purchase.supplier = supplier;
      purchase.itemId = itemId;
      purchase.qty = qty;
      purchase.status = status;
      purchase.costPrice = costPrice;
      purchase.total = total;
      purchase.updatedAt = nowISO();
    } else {
      nextState.purchases.push({
        id: uid('purchase'),
        supplier,
        itemId,
        qty,
        status,
        costPrice,
        total,
        date: nowISO(),
        createdAt: nowISO(),
        updatedAt: ''
      });
    }

    const finalized = ensureValidProjectedState(nextState);
    if (!finalized) return;

    applyStateAndRender(finalized, editId ? 'Pembelian berhasil diperbarui.' : 'Pembelian berhasil disimpan.');
    resetPurchaseForm();
  }

  function deleteWithValidation(builder, successMessage, errorMessage) {
    const nextState = cloneStateSnapshot();
    builder(nextState);
    const finalized = ensureValidProjectedState(nextState, errorMessage);
    if (!finalized) return;
    applyStateAndRender(finalized, successMessage);
  }

  function handleTableActions(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === 'edit-category') {
      const category = getCategoryById(id);
      if (!category) return;
      qs('#categoryEditId').value = category.id;
      qs('#categoryName').value = category.name;
      qs('#saveCategoryBtn').textContent = 'Update Kategori';
      openSection('items');
      qs('#categoryName').focus();
      return;
    }

    if (action === 'delete-category') {
      const used = appState.items.some((item) => item.categoryId === id);
      if (used) {
        showToast('Kategori yang masih dipakai item tidak boleh dihapus.', 'error');
        return;
      }
      const category = getCategoryById(id);
      if (category && confirm(`Hapus kategori "${category.name}"?`)) {
        deleteWithValidation(
          (nextState) => {
            nextState.categories = nextState.categories.filter((row) => row.id !== id);
          },
          'Kategori berhasil dihapus.'
        );
        resetCategoryForm();
      }
      return;
    }

    if (action === 'edit-item') {
      const item = getItemById(id);
      if (!item) return;
      qs('#itemEditId').value = item.id;
      qs('#itemCode').value = item.itemId;
      qs('#itemName').value = item.name;
      qs('#itemCategory').value = item.categoryId;
      qs('#itemSubCategory').value = item.subCategory;
      qs('#itemType').value = item.type;
      qs('#itemInitialStock').value = item.initialStock;
      qs('#itemMinStock').value = item.minStock;
      qs('#itemCostPrice').value = item.costPrice;
      qs('#itemSellPrice').value = item.sellPrice;
      qs('#saveItemBtn').textContent = 'Update Item';
      openSection('items');
      qs('#itemCode').focus();
      return;
    }

    if (action === 'delete-item') {
      const related = appState.inventory.some((row) => row.itemId === id)
        || appState.sales.some((row) => row.itemId === id)
        || appState.purchases.some((row) => row.itemId === id);

      if (related) {
        showToast('Item yang sudah punya riwayat transaksi tidak bisa dihapus.', 'error');
        return;
      }

      const item = getItemById(id);
      if (item && confirm(`Hapus item "${item.name}"?`)) {
        deleteWithValidation(
          (nextState) => {
            nextState.items = nextState.items.filter((row) => row.id !== id);
          },
          'Item berhasil dihapus.'
        );
        resetItemForm();
      }
      return;
    }

    if (action === 'edit-inventory') {
      const row = appState.inventory.find((entry) => entry.id === id);
      if (!row) return;
      qs('#inventoryEditId').value = row.id;
      qs('#inventoryItem').value = row.itemId;
      qs('#inventoryType').value = row.type;
      qs('#inventoryQty').value = row.qty;
      qs('#inventoryNote').value = row.note || '';
      qs('#saveInventoryBtn').textContent = 'Update Movement';
      openSection('inventory');
      qs('#inventoryQty').focus();
      return;
    }

    if (action === 'delete-inventory') {
      const row = appState.inventory.find((entry) => entry.id === id);
      if (row && confirm('Hapus movement inventory ini?')) {
        deleteWithValidation(
          (nextState) => {
            nextState.inventory = nextState.inventory.filter((entry) => entry.id !== id);
          },
          'Movement inventory berhasil dihapus.',
          'Penghapusan movement membuat stok minus.'
        );
        resetInventoryForm();
      }
      return;
    }

    if (action === 'edit-sale') {
      const row = appState.sales.find((entry) => entry.id === id);
      if (!row) return;
      qs('#salesEditId').value = row.id;
      qs('#salesCustomer').value = row.customer;
      qs('#salesItem').value = row.itemId;
      qs('#salesQty').value = row.qty;
      qs('#salesStatus').value = row.status;
      qs('#saveSalesBtn').textContent = 'Update Penjualan';
      openSection('sales');
      qs('#salesCustomer').focus();
      return;
    }

    if (action === 'delete-sale') {
      const row = appState.sales.find((entry) => entry.id === id);
      if (row && confirm('Hapus transaksi penjualan ini?')) {
        deleteWithValidation(
          (nextState) => {
            nextState.sales = nextState.sales.filter((entry) => entry.id !== id);
          },
          'Penjualan berhasil dihapus.'
        );
        resetSalesForm();
      }
      return;
    }

    if (action === 'edit-purchase') {
      const row = appState.purchases.find((entry) => entry.id === id);
      if (!row) return;
      qs('#purchaseEditId').value = row.id;
      qs('#purchaseSupplier').value = row.supplier;
      qs('#purchaseItem').value = row.itemId;
      qs('#purchaseQty').value = row.qty;
      qs('#purchaseStatus').value = row.status;
      qs('#savePurchaseBtn').textContent = 'Update Pembelian';
      openSection('purchases');
      qs('#purchaseSupplier').focus();
      return;
    }

    if (action === 'delete-purchase') {
      const row = appState.purchases.find((entry) => entry.id === id);
      if (row && confirm('Hapus transaksi pembelian ini?')) {
        deleteWithValidation(
          (nextState) => {
            nextState.purchases = nextState.purchases.filter((entry) => entry.id !== id);
          },
          'Pembelian berhasil dihapus.'
        );
        resetPurchaseForm();
      }
      return;
    }

    if (action === 'open-sales') {
      const row = appState.sales.find((entry) => entry.id === id);
      if (!row) return;
      openSection('sales');
      const editButton = qs(`[data-action="edit-sale"][data-id="${row.id}"]`);
      if (editButton) editButton.click();
      return;
    }

    if (action === 'open-purchases') {
      const row = appState.purchases.find((entry) => entry.id === id);
      if (!row) return;
      openSection('purchases');
      const editButton = qs(`[data-action="edit-purchase"][data-id="${row.id}"]`);
      if (editButton) editButton.click();
    }
  }

  function buildRowsHtml(headers, rows) {
    return `
      <table>
        <thead>
          <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Tidak ada data</td></tr>`}
        </tbody>
      </table>
    `;
  }

  function exportExcel(filename, title, sections) {
    const htmlSections = sections.map((section) => `
      <h2 style="font-family:Arial,sans-serif">${escapeHtml(section.title)}</h2>
      ${buildRowsHtml(section.headers, section.rows)}
      <br>
    `).join('');

    const html = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body{font-family:Arial,sans-serif;padding:20px}
            table{border-collapse:collapse;width:100%;margin-bottom:20px}
            th,td{border:1px solid #999;padding:8px;text-align:left}
            th{background:#f0f4ff}
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>Dibuat: ${escapeHtml(new Date().toLocaleString('id-ID'))}</p>
          ${htmlSections}
        </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function openPrintWindow(title, sections) {
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    const htmlSections = sections.map((section) => `
      <section style="margin-bottom:28px">
        <h2>${escapeHtml(section.title)}</h2>
        ${buildRowsHtml(section.headers, section.rows)}
      </section>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${escapeHtml(title)}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;color:#111}
            h1,h2{margin:0 0 12px}
            p{margin:0 0 18px;color:#555}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}
            th{background:#f3f6fb}
            @media print{body{padding:0}}
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>Dibuat: ${escapeHtml(new Date().toLocaleString('id-ID'))}</p>
          ${htmlSections}
          <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function getItemsExportRows() {
    return getFilteredItems().map((item) => [
      item.itemId,
      item.name,
      getCategoryName(item.categoryId),
      item.subCategory,
      item.type,
      String(item.stock),
      String(item.minStock),
      String(item.costPrice),
      String(item.sellPrice)
    ]);
  }

  function getInventoryExportRows() {
    return getCombinedInventoryRows().map((row) => [
      formatDate(row.date),
      getItemById(row.itemId)?.name || '-',
      row.type,
      String(row.qty),
      row.source,
      row.note || ''
    ]);
  }

  function getSalesExportRows() {
    return appState.sales
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((row) => [
        formatDate(row.date),
        row.customer,
        getItemById(row.itemId)?.name || '-',
        String(row.qty),
        row.status,
        String(row.sellPrice),
        String(row.total)
      ]);
  }

  function getPurchasesExportRows() {
    return appState.purchases
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((row) => [
        formatDate(row.date),
        row.supplier,
        getItemById(row.itemId)?.name || '-',
        String(row.qty),
        row.status,
        String(row.costPrice),
        String(row.total)
      ]);
  }

  function exportItemsExcel() {
    exportExcel('items-keydup.xls', 'Export Items', [{
      title: 'Items',
      headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
      rows: getItemsExportRows()
    }]);
  }

  function exportInventoryExcel() {
    exportExcel('inventory-keydup.xls', 'Export Inventory', [{
      title: 'Inventory',
      headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'],
      rows: getInventoryExportRows()
    }]);
  }

  function exportSalesExcel() {
    exportExcel('sales-keydup.xls', 'Export Sales', [{
      title: 'Sales',
      headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'],
      rows: getSalesExportRows()
    }]);
  }

  function exportPurchasesExcel() {
    exportExcel('purchases-keydup.xls', 'Export Purchases', [{
      title: 'Purchases',
      headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'],
      rows: getPurchasesExportRows()
    }]);
  }

  function exportAllExcel() {
    exportExcel('all-data-keydup.xls', 'Export Semua Data KeyDup', [
      {
        title: 'Items',
        headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
        rows: appState.items.map((item) => [item.itemId, item.name, getCategoryName(item.categoryId), item.subCategory, item.type, String(item.stock), String(item.minStock), String(item.costPrice), String(item.sellPrice)])
      },
      { title: 'Inventory', headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'], rows: getInventoryExportRows() },
      { title: 'Sales', headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'], rows: getSalesExportRows() },
      { title: 'Purchases', headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'], rows: getPurchasesExportRows() }
    ]);
  }

  function exportItemsPdf() {
    openPrintWindow('Export Items', [{
      title: 'Items',
      headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
      rows: getItemsExportRows()
    }]);
  }

  function exportInventoryPdf() {
    openPrintWindow('Export Inventory', [{
      title: 'Inventory',
      headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'],
      rows: getInventoryExportRows()
    }]);
  }

  function exportSalesPdf() {
    openPrintWindow('Export Sales', [{
      title: 'Sales',
      headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'],
      rows: getSalesExportRows()
    }]);
  }

  function exportPurchasesPdf() {
    openPrintWindow('Export Purchases', [{
      title: 'Purchases',
      headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'],
      rows: getPurchasesExportRows()
    }]);
  }

  function exportAllPdf() {
    openPrintWindow('Export Semua Data KeyDup', [
      {
        title: 'Items',
        headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
        rows: appState.items.map((item) => [item.itemId, item.name, getCategoryName(item.categoryId), item.subCategory, item.type, String(item.stock), String(item.minStock), String(item.costPrice), String(item.sellPrice)])
      },
      { title: 'Inventory', headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'], rows: getInventoryExportRows() },
      { title: 'Sales', headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'], rows: getSalesExportRows() },
      { title: 'Purchases', headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'], rows: getPurchasesExportRows() }
    ]);
  }

  function downloadTextFile(filename, content, mime = 'application/json;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function backupData() {
    const payload = {
      app: 'KeyDup Inventory Pro',
      version: 4,
      exportedAt: nowISO(),
      data: cloneStateSnapshot()
    };
    downloadTextFile(`backup-keydup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
    showToast('Backup JSON berhasil diunduh.');
  }

  function triggerRestorePicker() {
    qs('#restoreBackupInput').click();
  }

  function restoreBackupFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = safeParse(reader.result, null);
        if (!raw || !raw.data) {
          showToast('File backup tidak valid.', 'error');
          return;
        }
        if (!confirm('Restore akan menimpa data saat ini. Lanjutkan?')) return;
        const normalized = normalizeState(raw.data);
        const finalized = ensureValidProjectedState(normalized, 'File backup menghasilkan stok minus.');
        if (!finalized) return;
        applyStateAndRender(finalized, 'Backup berhasil dipulihkan.');
        resetCategoryForm();
        resetItemForm();
        resetInventoryForm();
        resetSalesForm();
        resetPurchaseForm();
      } catch {
        showToast('Gagal membaca file backup.', 'error');
      } finally {
        qs('#restoreBackupInput').value = '';
      }
    };
    reader.readAsText(file);
  }

  function isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.replace(LOGIN_PAGE);
      return false;
    }
    return true;
  }

  function bindEvents() {
    qs('#logoutBtn').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      closeSidebar();
      window.location.replace(LOGIN_PAGE);
    });

    qs('#menuToggle').addEventListener('click', openSidebar);
    qs('#sidebarBackdrop').addEventListener('click', closeSidebar);

    qsa('.nav-btn').forEach((btn) => btn.addEventListener('click', () => openSection(btn.dataset.section)));
    qsa('[data-open-section]').forEach((btn) => btn.addEventListener('click', () => openSection(btn.dataset.openSection)));

    qs('#categoryForm').addEventListener('submit', handleCategorySubmit);
    qs('#itemForm').addEventListener('submit', handleItemSubmit);
    qs('#inventoryForm').addEventListener('submit', handleInventorySubmit);
    qs('#salesForm').addEventListener('submit', handleSalesSubmit);
    qs('#purchaseForm').addEventListener('submit', handlePurchaseSubmit);

    qs('#cancelCategoryEditBtn').addEventListener('click', resetCategoryForm);
    qs('#cancelItemEditBtn').addEventListener('click', resetItemForm);
    qs('#cancelInventoryEditBtn').addEventListener('click', resetInventoryForm);
    qs('#cancelSalesEditBtn').addEventListener('click', resetSalesForm);
    qs('#cancelPurchaseEditBtn').addEventListener('click', resetPurchaseForm);

    qs('#categoryTableBody').addEventListener('click', handleTableActions);
    qs('#itemsTableBody').addEventListener('click', handleTableActions);
    qs('#inventoryTableBody').addEventListener('click', handleTableActions);
    qs('#salesTableBody').addEventListener('click', handleTableActions);
    qs('#purchaseTableBody').addEventListener('click', handleTableActions);

    qs('#itemSearch').addEventListener('input', renderItems);
    qs('#itemCategoryFilter').addEventListener('change', () => {
      refreshSelectOptions();
      renderItems();
    });
    qs('#itemSubCategoryFilter').addEventListener('change', renderItems);

    qs('#backupDataBtn').addEventListener('click', backupData);
    qs('#restoreBackupBtn').addEventListener('click', triggerRestorePicker);
    qs('#backupDataBtnBottom').addEventListener('click', backupData);
    qs('#restoreBackupBtnBottom').addEventListener('click', triggerRestorePicker);
    qs('#restoreBackupInput').addEventListener('change', (e) => restoreBackupFromFile(e.target.files?.[0]));

    qs('#exportItemsExcelBtn').addEventListener('click', exportItemsExcel);
    qs('#exportItemsPdfBtn').addEventListener('click', exportItemsPdf);
    qs('#exportInventoryExcelBtn').addEventListener('click', exportInventoryExcel);
    qs('#exportInventoryPdfBtn').addEventListener('click', exportInventoryPdf);
    qs('#exportSalesExcelBtn').addEventListener('click', exportSalesExcel);
    qs('#exportSalesPdfBtn').addEventListener('click', exportSalesPdf);
    qs('#exportPurchasesExcelBtn').addEventListener('click', exportPurchasesExcel);
    qs('#exportPurchasesPdfBtn').addEventListener('click', exportPurchasesPdf);
    qs('#exportAllExcelBtn').addEventListener('click', exportAllExcel);
    qs('#exportAllPdfBtn').addEventListener('click', exportAllPdf);

    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEYS.db) return;
      loadState();
      renderAll();
      showToast('Data diperbarui dari tab/browser lain.', 'warning');
    });
  }

  function init() {
    if (!requireAuth()) return;
    loadState();
    bindEvents();
    openSection('home');
    renderAll();
  }

  init();
})();
