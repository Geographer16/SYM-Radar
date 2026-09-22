/**
 * ui.js
 * ---------------------------------------------------------------------------
 * DOM güncellemeleri burada toplanır. main.js akışı yönetir, bu modül
 * "ekrana nasıl basılır"ı bilir. Grafik çizimi charts.js'e devredilir.
 * ---------------------------------------------------------------------------
 */

const UI = (() => {

  const els = {
    statusSection: document.getElementById('status-section'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),

    fileListPanel: document.getElementById('file-list-panel'),
    fileList: document.getElementById('file-list'),

    errorDetails: document.getElementById('error-details'),
    errorSummary: document.getElementById('error-summary'),
    errorList: document.getElementById('error-list'),

    summarySection: document.getElementById('summary-section'),
    statLocations: document.getElementById('stat-locations'),
    statUsers: document.getElementById('stat-users'),
    statValidRows: document.getElementById('stat-valid-rows'),
    statAvgSpeed: document.getElementById('stat-avg-speed'),

    usersSection: document.getElementById('users-section'),
    userComparisonTable: document.getElementById('user-comparison-table'),
    userComparisonBody: document.getElementById('user-comparison-body'),

    locationsSection: document.getElementById('locations-section'),
    locationTable: document.getElementById('location-table'),
    locationTableBody: document.getElementById('location-table-body'),

    reportSection: document.getElementById('report-section'),
    generateReportBtn: document.getElementById('generate-report-btn'),

    clearBtn: document.getElementById('clear-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    themeLabel: document.getElementById('theme-label'),
    themeIcon: document.getElementById('theme-icon'),
  };

  function showStatus(message, type = 'info') {
    els.statusSection.hidden = false;
    els.statusSection.textContent = message;
    els.statusSection.className = `status-box ${type}`;
  }

  function clearStatus() {
    els.statusSection.hidden = true;
    els.statusSection.textContent = '';
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Yüklenen dosyaların listesini, her biri tek tek çıkarılabilir şekilde
   * render eder. Liste boşsa panel tamamen gizlenir.
   * @param {object[]} loadedFiles - { id, name, size, records, errors }
   * @param {(fileId:number) => void} onRemove - çıkar butonuna basılınca çağrılır
   */
  function renderFileList(loadedFiles, onRemove) {
    if (!loadedFiles || loadedFiles.length === 0) {
      els.fileListPanel.hidden = true;
      els.fileList.innerHTML = '';
      return;
    }

    els.fileListPanel.hidden = false;
    els.fileList.innerHTML = loadedFiles.map(f => `
      <li class="file-list-item" data-file-id="${f.id}">
        <span class="file-item-info">
          <span class="file-item-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
          <span class="file-item-meta">${formatBytes(f.size)} · ${f.records.length.toLocaleString('tr-TR')} kayıt</span>
        </span>
        <button type="button" class="file-remove-btn" aria-label="${escapeHtml(f.name)} dosyasını kaldır" data-file-id="${f.id}">✕</button>
      </li>
    `).join('');

    els.fileList.querySelectorAll('.file-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileId = Number(btn.dataset.fileId);
        onRemove(fileId);
      });
    });
  }

  /**
   * Hatalı (ayrıştırılamayan) satırları katlanır bir liste olarak gösterir.
   * Hiç hata yoksa bölüm tamamen gizlenir.
   */
  function renderErrors(errors) {
    if (!errors || errors.length === 0) {
      els.errorDetails.hidden = true;
      els.errorList.innerHTML = '';
      return;
    }
    els.errorDetails.hidden = false;
    els.errorDetails.open = false;
    els.errorSummary.textContent = `${errors.length.toLocaleString('tr-TR')} satır okunamadı — göster/gizle`;
    els.errorList.innerHTML = errors.map(e => `
      <li>
        <span class="err-line">Satır ${e.lineNumber}</span>
        <span class="err-reason">${escapeHtml(e.error)}</span>
      </li>
    `).join('');
  }

  /**
   * Tüm analiz bölümlerini ve durum alanlarını başlangıç haline döndürür.
   * "Temizle" butonu ve son dosya kaldırıldığında tam sıfırlama için kullanılır.
   */
  function resetAll() {
    clearStatus();
    els.fileInput.value = '';

    els.fileListPanel.hidden = true;
    els.fileList.innerHTML = '';

    els.errorDetails.hidden = true;
    els.errorList.innerHTML = '';

    hideAnalysisSections();

    els.reportSection.hidden = true;
    els.clearBtn.classList.remove('visible');
  }

  /** Analiz sonucu bölümlerini (sayaçlar, kullanıcı, lokasyon) gizler ve içeriklerini temizler. */
  function hideAnalysisSections() {
    els.summarySection.hidden = true;

    els.usersSection.hidden = true;
    els.userComparisonBody.innerHTML = '';

    els.locationsSection.hidden = true;
    els.locationTableBody.innerHTML = '';
  }

  /** Veri yüklendiğinde "Temizle" butonunu görünür yapar. */
  function showClearButton() {
    els.clearBtn.classList.add('visible');
  }

  /* ---------- Tema (karanlık/aydınlık mod) ---------- */

  const THEME_STORAGE_KEY = 'sayim-akisi-theme';

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      els.themeLabel.textContent = 'Aydınlık';
      els.themeIcon.innerHTML = '<circle cx="10" cy="10" r="4.2" stroke="currentColor" stroke-width="1.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
    } else {
      document.documentElement.removeAttribute('data-theme');
      els.themeLabel.textContent = 'Karanlık';
      els.themeIcon.innerHTML = '<path d="M17 11.2A7 7 0 1 1 8.8 3 5.6 5.6 0 0 0 17 11.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
    }
  }

  function initTheme() {
    // Varsayılan her zaman aydınlık: sistem/tarayıcı "karanlık mod" tercihini
    // otomatik uygulamıyoruz. Kullanıcı daha önce butondan bilinçli olarak
    // karanlığı seçtiyse (localStorage'da kayıtlıysa) onu hatırlıyoruz.
    let saved = null;
    try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* gizli modda erişilemeyebilir */ }
    applyTheme(saved === 'dark' ? 'dark' : 'light');

    els.themeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (e) { /* yok sayılabilir */ }
    });
  }

  function setDropZoneDragState(isDragging) {
    els.dropZone.classList.toggle('dragover', isDragging);
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Üstteki dört büyük sayaç. */
  function updateCounterStrip({ locationCount, userCount, validCount, speed }) {
    els.summarySection.hidden = false;
    els.statLocations.textContent = locationCount.toLocaleString('tr-TR');
    els.statUsers.textContent = userCount.toLocaleString('tr-TR');
    els.statValidRows.textContent = validCount.toLocaleString('tr-TR');

    // speed ürün/saniye cinsinden geliyor; kullanıcıya "ürün başına kaç
    // saniye" olarak daha sezgisel gösteriyoruz (tersini alıyoruz)
    const secondsPerItem = speed > 0 ? 1 / speed : 0;
    els.statAvgSpeed.textContent = secondsPerItem > 0 ? secondsPerItem.toFixed(2) : '—';
  }

  /**
   * Kullanıcı karşılaştırma tablosunu kurar: okutma sayısı, sayılan lokasyon
   * sayısı ve ürün başına ortalama saniye (lokasyon-içi hızın tersi).
   */
  function renderUsers(userStats) {
    els.usersSection.hidden = false;

    // secondsPerItem'ı burada bir kez hesaplayıp tabloya taşıyoruz
    const enriched = userStats.map(u => ({
      ...u,
      secondsPerItem: u.itemsPerSecond > 0 ? 1 / u.itemsPerSecond : null,
    }));

    setupUserComparisonTable(enriched);
  }

  /**
   * Sıralanabilir kullanıcı karşılaştırma tablosu. Başlıklara tıklanınca
   * ilgili sütuna göre artan/azalan sıralama yapılır; aynı başlığa tekrar
   * tıklamak yönü tersine çevirir. Varsayılan sıralama: en çok okutma yapan
   * en üstte (recordCount, azalan).
   */
  function setupUserComparisonTable(userStats) {
    let sortKey = 'recordCount';
    let sortDir = 'desc'; // 'asc' | 'desc'

    function renderRows() {
      const sorted = [...userStats].sort((a, b) => {
        let va = a[sortKey];
        let vb = b[sortKey];

        // secondsPerItem null olabilir (hız hesaplanamadı) — sıralamada en sona at
        if (sortKey === 'secondsPerItem') {
          if (va === null && vb === null) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
        }

        // startTime/endTime birer Date nesnesi — karşılaştırma için sayıya çevir
        if (va instanceof Date) va = va.getTime();
        if (vb instanceof Date) vb = vb.getTime();

        if (typeof va === 'string') {
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === 'asc' ? va - vb : vb - va;
      });

      els.userComparisonBody.innerHTML = sorted.map(u => `
        <tr>
          <td>
            <span class="user-cell">
              <span class="cell-dot" style="background:${u.color};"></span>
              ${escapeHtml(u.userCode)}
            </span>
          </td>
          <td>${u.recordCount.toLocaleString('tr-TR')}</td>
          <td>${u.locationCount.toLocaleString('tr-TR')}</td>
          <td>${u.secondsPerItem !== null ? u.secondsPerItem.toFixed(2) : '—'}</td>
          <td>${Analysis.formatClockTime(u.startTime)}</td>
          <td>${Analysis.formatClockTime(u.endTime)}</td>
          <td>${Analysis.formatDuration(u.totalDurationSec)}</td>
        </tr>
      `).join('');
    }

    function updateHeaderIndicators() {
      els.userComparisonTable.querySelectorAll('th.sortable').forEach(th => {
        const isActive = th.dataset.sortKey === sortKey;
        th.classList.toggle('active', isActive);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.remove();
        const span = document.createElement('span');
        span.className = 'sort-arrow';
        span.textContent = isActive ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼';
        th.appendChild(span);
      });
    }

    // Önceki dinleyicileri temizlemek için başlıkları klonluyoruz (renderUsers
    // her yeni dosya yüklemesinde tekrar çağrılabildiği için).
    els.userComparisonTable.querySelectorAll('th.sortable').forEach(th => {
      const clone = th.cloneNode(true);
      th.replaceWith(clone);
      clone.addEventListener('click', () => {
        if (sortKey === clone.dataset.sortKey) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = clone.dataset.sortKey;
          sortDir = 'desc';
        }
        renderRows();
        updateHeaderIndicators();
      });
    });

    renderRows();
    updateHeaderIndicators();
  }

  /**
   * Lokasyon detay tablosu — sıralanabilir, kullanıcı karşılaştırma
   * tablosuyla aynı desende. Analysis.computeLocationSpeeds() çıktısını
   * doğrudan render eder.
   */
  function renderLocations(locationSpeeds) {
    els.locationsSection.hidden = false;
    setupLocationTable(locationSpeeds);
  }

  function setupLocationTable(locationSpeeds) {
    let sortKey = 'locationCode';
    let sortDir = 'asc';

    function renderRows() {
      const sorted = [...locationSpeeds].sort((a, b) => {
        let va = a[sortKey];
        let vb = b[sortKey];

        // itemsPerSecond null olabilir (tek okutmalı lokasyon) — sona at
        if (sortKey === 'itemsPerSecond') {
          if (va === null && vb === null) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
        }

        if (typeof va === 'string') {
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === 'asc' ? va - vb : vb - va;
      });

      els.locationTableBody.innerHTML = sorted.map(l => `
        <tr>
          <td>
            <span class="user-cell">
              <span class="cell-dot" style="background:${l.color};"></span>
              ${escapeHtml(l.locationCode)}
            </span>
          </td>
          <td>${escapeHtml(l.userCode)}</td>
          <td>${l.count.toLocaleString('tr-TR')}</td>
          <td>${l.durationSec ? Analysis.formatDuration(l.durationSec) : '—'}</td>
          <td>${l.itemsPerSecond !== null ? l.itemsPerSecond.toFixed(2) : '—'}</td>
        </tr>
      `).join('');
    }

    function updateHeaderIndicators() {
      els.locationTable.querySelectorAll('th.sortable').forEach(th => {
        const isActive = th.dataset.sortKey === sortKey;
        th.classList.toggle('active', isActive);
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.remove();
        const span = document.createElement('span');
        span.className = 'sort-arrow';
        span.textContent = isActive ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼';
        th.appendChild(span);
      });
    }

    // Önceki dinleyicileri temizlemek için başlıkları klonluyoruz (renderLocations
    // her yeni dosya yüklemesinde tekrar çağrılabildiği için).
    els.locationTable.querySelectorAll('th.sortable').forEach(th => {
      const clone = th.cloneNode(true);
      th.replaceWith(clone);
      clone.addEventListener('click', () => {
        if (sortKey === clone.dataset.sortKey) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = clone.dataset.sortKey;
          sortDir = 'asc';
        }
        renderRows();
        updateHeaderIndicators();
      });
    });

    renderRows();
    updateHeaderIndicators();
  }

  return {
    els,
    showStatus,
    clearStatus,
    setDropZoneDragState,
    renderFileList,
    updateCounterStrip,
    renderUsers,
    renderLocations,
    renderErrors,
    resetAll,
    hideAnalysisSections,
    showClearButton,
    initTheme,
  };

})();

window.UI = UI;
