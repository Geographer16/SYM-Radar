/**
 * main.js
 * ---------------------------------------------------------------------------
 * Uygulamanın giriş noktası. Dosya seçme/sürükleme olaylarını dinler,
 * FileReader ile dosyayı okur, StockParser ile ayrıştırır, Analysis ile
 * hesaplar ve UI + Charts ile ekrana basar.
 *
 * Veri hiçbir zaman tarayıcı dışına çıkmaz: ağ isteği yok, sunucu yok.
 * ---------------------------------------------------------------------------
 */

(function () {
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');

  let allRecords = [];
  let allErrors = [];
  let totalLinesProcessed = 0;

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFiles(files);
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      UI.setDropZoneDragState(true);
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      UI.setDropZoneDragState(false);
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []).filter(f =>
      f.name.toLowerCase().endsWith('.txt')
    );
    if (files.length) handleFiles(files);
  });

  async function handleFiles(files) {
    UI.clearStatus();
    UI.showStatus(`${files.length} dosya okunuyor...`, 'info');
    UI.setFileInfo(files.map(f => `${f.name} (${formatBytes(f.size)})`).join(', '));

    allRecords = [];
    allErrors = [];
    totalLinesProcessed = 0;

    try {
      for (const file of files) {
        const content = await readFileAsText(file);
        const { records, errors, totalLines } = StockParser.parseFileContent(content);

        allRecords = allRecords.concat(records);
        allErrors = allErrors.concat(errors);
        totalLinesProcessed += totalLines;

        console.log(`[${file.name}] toplam satır: ${totalLines}, geçerli: ${records.length}, hatalı: ${errors.length}`);
      }

      console.log('Ayrıştırılmış kayıtlar:', allRecords);
      if (allErrors.length) console.warn('Ayrıştırılamayan satırlar:', allErrors);

      renderResults();

    } catch (err) {
      console.error(err);
      UI.showStatus(`Dosya okunurken hata oluştu: ${err.message}`, 'error');
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`"${file.name}" okunamadı.`));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function renderResults() {
    const validCount = allRecords.length;
    const invalidCount = allErrors.length;

    if (validCount === 0) {
      UI.showStatus('Hiçbir geçerli kayıt bulunamadı. Dosya formatını kontrol edin.', 'error');
      return;
    }

    const statusMsg = invalidCount > 0
      ? `Tamamlandı — ${validCount.toLocaleString('tr-TR')} kayıt (${invalidCount.toLocaleString('tr-TR')} satır okunamadı).`
      : `Tamamlandı — ${validCount.toLocaleString('tr-TR')} kayıt.`;

    UI.showStatus(statusMsg, invalidCount > 0 ? 'info' : 'success');

    const results = Analysis.runAllAnalyses(allRecords);

    // 1. Sayaç şeridi
    UI.updateCounterStrip({
      locationCount: results.locationCount,
      userCount: results.users.length,
      validCount,
      activeSpeed: results.overallSpeed.activeItemsPerSecond,
      overallSpeed: results.overallSpeed.itemsPerSecond,
    });

    // 2. Kullanıcı listesi (lokasyon sayısı ve ürün başına saniye dahil)
    UI.renderUsers(results.userStats);

    // 3. Zaman bazlı lokasyon akışı grafiği (kullanıcı renkleriyle)
    UI.showTimelineSection();
    Charts.renderTimelineChart('timeline-chart', results.timeline, results.users);

    // 4. Lokasyon bazlı hız grafiği — histogram (kullanıcı renkleriyle) + renk anahtarı
    UI.showLocationSpeedSection();
    const { userColorKey } = Charts.renderLocationSpeedChart('location-speed-chart', results.locationSpeedHistogram);
    UI.renderLocationSpeedLegend(userColorKey);

    // 5. Genel + kullanıcı bazlı hız trend eğrileri
    UI.showSpeedTrendSection();
    Charts.renderSpeedTrendChart('speed-trend-chart', results.speedTrend, results.speedTrendByUser);

    console.log('Analiz sonuçları:', results);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

})();
