/**
 * ui.js
 * ---------------------------------------------------------------------------
 * DOM güncellemeleri burada toplanır. main.js akışı yönetir, bu modül
 * "ekrana nasıl basılır"ı bilir. Grafik çizimi charts.js'e devredilir.
 * ---------------------------------------------------------------------------
 */

const UI = (() => {

  const els = {
    fileInfo: document.getElementById('file-info'),
    statusSection: document.getElementById('status-section'),
    dropZone: document.getElementById('drop-zone'),

    summarySection: document.getElementById('summary-section'),
    statLocations: document.getElementById('stat-locations'),
    statUsers: document.getElementById('stat-users'),
    statValidRows: document.getElementById('stat-valid-rows'),
    statAvgSpeed: document.getElementById('stat-avg-speed'),
    speedNote: document.getElementById('speed-note'),

    usersSection: document.getElementById('users-section'),
    usersList: document.getElementById('users-list'),
    userComparisonTable: document.getElementById('user-comparison-table'),
    userComparisonBody: document.getElementById('user-comparison-body'),

    timelineSection: document.getElementById('timeline-section'),
    locationSpeedSection: document.getElementById('location-speed-section'),
    locationSpeedLegend: document.getElementById('location-speed-legend'),
    speedTrendSection: document.getElementById('speed-trend-section'),
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

  function setFileInfo(text) {
    els.fileInfo.textContent = text;
  }

  function setDropZoneDragState(isDragging) {
    els.dropZone.classList.toggle('dragover', isDragging);
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Üstteki dört büyük sayaç. */
  function updateCounterStrip({ locationCount, userCount, validCount, activeSpeed, overallSpeed }) {
    els.summarySection.hidden = false;
    els.statLocations.textContent = locationCount.toLocaleString('tr-TR');
    els.statUsers.textContent = userCount.toLocaleString('tr-TR');
    els.statValidRows.textContent = validCount.toLocaleString('tr-TR');

    // activeSpeed ürün/saniye cinsinden geliyor; kullanıcıya "ürün başına
    // kaç saniye" olarak daha sezgisel gösteriyoruz (tersini alıyoruz)
    const secondsPerItem = activeSpeed > 0 ? 1 / activeSpeed : 0;
    els.statAvgSpeed.textContent = secondsPerItem > 0 ? secondsPerItem.toFixed(2) : '—';

    els.speedNote.hidden = false;
    const overallSecondsPerItem = overallSpeed > 0 ? 1 / overallSpeed : 0;
    els.speedNote.textContent =
      `Lokasyonlar arası geçişler dahil genel hız: ürün başına ${overallSecondsPerItem.toFixed(1)} saniye. ` +
      `Ürün başına saniye, ardışık okutmalar arası 10 saniyeden uzun boşlukları (lokasyon değişimi/mola) hariç tutarak hesaplanır.`;
  }

  /**
   * Kullanıcı kod listesi, chip görünümünde — her kullanıcının kendi
   * rengiyle. Her kullanıcı için: okutma sayısı, sayılan lokasyon sayısı ve
   * ürün başına ortalama saniye (aktif tarama hızının tersi) gösterilir.
   *
   * Aynı zamanda karşılaştırma tablosunu da kurar (bkz. setupUserComparisonTable).
   */
  function renderUsers(userStats) {
    els.usersSection.hidden = false;

    // secondsPerItem'ı burada bir kez hesaplayıp hem chip hem tabloya taşıyoruz
    const enriched = userStats.map(u => ({
      ...u,
      secondsPerItem: u.activeItemsPerSecond > 0 ? 1 / u.activeItemsPerSecond : null,
    }));

    els.usersList.innerHTML = enriched.map(u => {
      const speedText = u.secondsPerItem !== null
        ? `${u.secondsPerItem.toFixed(2)} sn/ürün`
        : 'hız hesaplanamadı';

      return `
        <div class="user-chip">
          <span class="chip-dot" style="background:${u.color};"></span>
          <span class="chip-code">${escapeHtml(u.userCode)}</span>
          <span class="chip-count">
            ${u.recordCount.toLocaleString('tr-TR')} okutma ·
            ${u.locationCount.toLocaleString('tr-TR')} lokasyon ·
            ${speedText}
          </span>
        </div>
      `;
    }).join('');

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

  /** Lokasyon hızı grafiğinin altındaki kullanıcı renk anahtarı. */
  function renderLocationSpeedLegend(userColorKey) {
    els.locationSpeedLegend.innerHTML = userColorKey.map(([userCode, color]) => `
      <span class="legend-item">
        <span class="legend-dot" style="background:${color};"></span>
        ${escapeHtml(userCode)}
      </span>
    `).join('');
  }

  function showTimelineSection() {
    els.timelineSection.hidden = false;
  }

  function showLocationSpeedSection() {
    els.locationSpeedSection.hidden = false;
  }

  function showSpeedTrendSection() {
    els.speedTrendSection.hidden = false;
  }

  return {
    els,
    showStatus,
    clearStatus,
    setFileInfo,
    setDropZoneDragState,
    updateCounterStrip,
    renderUsers,
    showTimelineSection,
    showLocationSpeedSection,
    renderLocationSpeedLegend,
    showSpeedTrendSection,
  };

})();

window.UI = UI;
