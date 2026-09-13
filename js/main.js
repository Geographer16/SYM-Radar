/**
 * main.js
 * ---------------------------------------------------------------------------
 * Uygulamanın giriş noktası. Dosya seçme/sürükleme olaylarını dinler,
 * FileReader ile dosyayı okur, StockParser ile ayrıştırır, Analysis ile
 * hesaplar ve UI + Charts ile ekrana basar.
 *
 * Her yüklenen dosya "loadedFiles" listesinde ayrı bir kayıt olarak tutulur
 * (id, ad, boyut, kendi kayıtları/hataları). Bu sayede dosya listesinden tek
 * bir dosya çıkarıldığında sadece o dosyanın verisi düşürülüp geri kalan
 * dosyalarla analiz yeniden çalıştırılabilir — dosyaları yeniden yüklemeye
 * gerek kalmaz.
 *
 * Veri hiçbir zaman tarayıcı dışına çıkmaz: ağ isteği yok, sunucu yok.
 * ---------------------------------------------------------------------------
 */

(function () {
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');
  const clearBtn = document.getElementById('clear-btn');
  const generateReportBtn = document.getElementById('generate-report-btn');

  // Her öğe: { id, name, size, records, errors, totalLines }
  let loadedFiles = [];
  let nextFileId = 1;
  let lastResults = null;

  UI.initTheme();

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFiles(files);
    // Aynı dosyayı art arda seçebilmek için input'u sıfırla
    fileInput.value = '';
  });

  clearBtn.addEventListener('click', () => {
    fullReset();
  });

  generateReportBtn.addEventListener('click', () => {
    if (!lastResults) return;
    const allRecords = getAllRecords();
    const allErrors = getAllErrors();
    Report.generateAndOpen(lastResults, {
      validCount: allRecords.length,
      errorCount: allErrors.length,
      fileNames: loadedFiles.map(f => f.name).join(', '),
    });
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

  function getAllRecords() {
    return loadedFiles.flatMap(f => f.records);
  }

  function getAllErrors() {
    return loadedFiles.flatMap(f => f.errors);
  }

  async function handleFiles(files) {
    UI.clearStatus();
    UI.showStatus(`${files.length} dosya okunuyor...`, 'info');

    try {
      for (const file of files) {
        const content = await readFileAsText(file);
        const { records, errors, totalLines } = StockParser.parseFileContent(content);

        loadedFiles.push({
          id: nextFileId++,
          name: file.name,
          size: file.size,
          records,
          errors,
          totalLines,
        });

        console.log(`[${file.name}] toplam satır: ${totalLines}, geçerli: ${records.length}, hatalı: ${errors.length}`);
      }

      recomputeAndRender();

    } catch (err) {
      console.error(err);
      UI.showStatus(`Dosya okunurken hata oluştu: ${err.message}`, 'error');
    }
  }

  /** Dosya listesinden tek bir dosyayı çıkarır ve kalan verilerle yeniden analiz eder. */
  function removeFile(fileId) {
    loadedFiles = loadedFiles.filter(f => f.id !== fileId);

    if (loadedFiles.length === 0) {
      fullReset();
      return;
    }

    recomputeAndRender();
  }

  /** Her şeyi (dosyalar, analiz, grafikler, DOM) sıfırlar. */
  function fullReset() {
    loadedFiles = [];
    lastResults = null;
    Charts.destroyAll();
    UI.resetAll();
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`"${file.name}" okunamadı.`));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /** Mevcut loadedFiles durumuna göre dosya listesini ve tüm analiz bölümlerini yeniden çizer. */
  function recomputeAndRender() {
    UI.renderFileList(loadedFiles, removeFile);
    UI.showClearButton();

    const allRecords = getAllRecords();
    const allErrors = getAllErrors();
    const validCount = allRecords.length;
    const invalidCount = allErrors.length;

    // Hatalı satırları her durumda göster (geçerli kayıt olsa da olmasa da)
    UI.renderErrors(allErrors);

    if (validCount === 0) {
      UI.showStatus('Hiçbir geçerli kayıt bulunamadı. Dosya formatını kontrol edin.', 'error');
      Charts.destroyAll();
      UI.hideAnalysisSections();
      lastResults = null;
      return;
    }

    const statusMsg = invalidCount > 0
      ? `Tamamlandı — ${validCount.toLocaleString('tr-TR')} kayıt (${invalidCount.toLocaleString('tr-TR')} satır okunamadı).`
      : `Tamamlandı — ${validCount.toLocaleString('tr-TR')} kayıt.`;

    UI.showStatus(statusMsg, invalidCount > 0 ? 'info' : 'success');

    const results = Analysis.runAllAnalyses(allRecords);
    lastResults = results;

    // 1. Sayaç şeridi
    UI.updateCounterStrip({
      locationCount: results.locationCount,
      userCount: results.users.length,
      validCount,
      speed: results.overallSpeed.itemsPerSecond,
    });

    // 2. Kullanıcı listesi (lokasyon sayısı ve ürün başına saniye dahil)
    UI.renderUsers(results.userStats);

    // 2b. Kullanıcı bazlı grafikler (hız karşılaştırması + okutma/lokasyon hacmi)
    Charts.renderUserSpeedChart('user-speed-chart', results.userStats);
    Charts.renderUserVolumeChart('user-volume-chart', results.userStats);

    // 3. Lokasyon detay tablosu (sıralanabilir)
    UI.renderLocations(results.locationSpeeds);

    // 4. Rapor bölümü artık kullanılabilir
    UI.els.reportSection.hidden = false;

    console.log('Analiz sonuçları:', results);
  }

})();
