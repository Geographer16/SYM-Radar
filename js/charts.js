/**
 * charts.js
 * ---------------------------------------------------------------------------
 * Chart.js kullanarak analiz sonuçlarını grafiğe döker. Her fonksiyon bir
 * canvas id'si ve analiz verisi alır, Chart.js instance'ını döndürür.
 * Aynı canvas'a ikinci kez çizim yapılacaksa önce eskisi destroy edilir
 * (dosya yeniden yüklendiğinde grafiklerin üst üste binmemesi için).
 *
 * Tüm grafikler kullanıcı bazlı renklendirme kullanır: her kullanıcının
 * rengi Analysis.getUserColor() ile atanır ve tutarlı kalır — aynı kullanıcı
 * her grafikte aynı renkte görünür.
 * ---------------------------------------------------------------------------
 */

const Charts = (() => {

  // Palet: CSS'teki teal/amber sistemiyle tutarlı (nötr/marka renkleri)
  const COLORS = {
    teal900: '#0F3D3E',
    teal600: '#1B7A6B',
    teal500: '#229985',
    teal100: '#DCEFE7',
    amber: '#C97A1F',
    danger: '#B4472F',
    ink: '#17332E',
    inkSoft: '#4B655F',
    grid: '#E4EEEA',
  };

  const instances = {};

  function destroyIfExists(canvasId) {
    if (instances[canvasId]) {
      instances[canvasId].destroy();
      delete instances[canvasId];
    }
  }

  const baseFont = { family: 'Inter, sans-serif', size: 12 };

  /** Hex rengi rgba'ya çevirir (dolgu/şeffaflık için). */
  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Zaman bazlı lokasyon akışı: x = zaman, y = lokasyon ziyaret sırası.
   * Her nokta bir lokasyonun ilk okutma anını temsil eder; nokta rengi o
   * lokasyonu sayan kullanıcının rengidir, boyutu okutma sayısını yansıtır.
   * Legend, hangi rengin hangi kullanıcı olduğunu gösterir.
   */
  function renderTimelineChart(canvasId, timelineEntries, users) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    // Her kullanıcı için ayrı dataset oluştur ki legend'de ayrı ayrı görünsün
    // ve tıklayarak aç/kapa yapılabilsin.
    const datasets = users.map(u => {
      const points = timelineEntries
        .filter(e => e.userCode === u.userCode)
        .map(e => ({ x: e.firstScan, y: e.visitOrder, count: e.count, locationCode: e.locationCode }));

      return {
        label: u.userCode,
        data: points,
        backgroundColor: u.color,
        pointRadius: (context) => {
          const raw = context.raw;
          if (!raw) return 5;
          return Math.min(4 + raw.count * 0.6, 14);
        },
        pointHoverRadius: 10,
      };
    }).filter(ds => ds.data.length > 0);

    instances[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { font: baseFont, color: COLORS.ink, usePointStyle: true, boxWidth: 8 },
          },
          tooltip: {
            backgroundColor: COLORS.teal900,
            titleFont: baseFont,
            bodyFont: baseFont,
            callbacks: {
              label: (ctx) => {
                const raw = ctx.raw;
                const time = new Date(raw.x).toLocaleTimeString('tr-TR');
                return `${ctx.dataset.label} · Lokasyon ${raw.locationCode} · ${raw.count} okutma · ${time}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            // unit belirtilmiyor: Chart.js veri aralığına göre otomatik seçer
            // (saniye/dakika/saat/gün/ay...). Sabit birim kullanılırsa, veri
            // setinde günler/aylar süren boşluklar varsa hata fırlatabilir.
            time: { tooltipFormat: 'dd.MM.yyyy HH:mm:ss' },
            title: { display: true, text: 'Zaman', font: baseFont, color: COLORS.inkSoft },
            grid: { color: COLORS.grid },
            ticks: { font: baseFont, color: COLORS.inkSoft },
          },
          y: {
            title: { display: true, text: 'Ziyaret Sırası', font: baseFont, color: COLORS.inkSoft },
            grid: { color: COLORS.grid },
            ticks: { font: baseFont, color: COLORS.inkSoft, precision: 0 },
          }
        }
      }
    });

    return instances[canvasId];
  }

  /**
   * Lokasyon bazlı okutma hızı — HİSTOGRAM olarak: x ekseni sabit sayıda hız
   * aralığı (bucket), y ekseni o aralığa düşen lokasyon sayısı. Her bucket,
   * kullanıcı bazlı renklerle yığılmış (stacked) bardır — yüzlerce lokasyon
   * olsa bile grafik sabit sayıda bar ile okunabilir kalır.
   *
   * @param {string} canvasId
   * @param {object} histogram - Analysis.buildLocationSpeedHistogram() çıktısı
   */
  function renderLocationSpeedChart(canvasId, histogram) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const { buckets, singleScanCount } = histogram;

    // Histogramdaki tüm benzersiz kullanıcıları topla (renk anahtarı için)
    const userColorMap = new Map();
    buckets.forEach(b => b.byUser.forEach(u => userColorMap.set(u.userCode, u.color)));
    const uniqueUsers = Array.from(userColorMap.entries());

    // X ekseni etiketleri: sayısal aralıklar + varsa "Tek okutma" bucket'ı
    const labels = buckets.map(b => b.label);
    if (singleScanCount > 0) labels.push('Tek okutma');

    // Her kullanıcı için bir dataset oluştur (stacked bar) — her bucket'taki
    // kendi payını taşır, diğer kullanıcıların üstüne yığılır.
    const datasets = uniqueUsers.map(([userCode, color]) => {
      const data = buckets.map(b => {
        const entry = b.byUser.find(u => u.userCode === userCode);
        return entry ? entry.count : 0;
      });
      if (singleScanCount > 0) data.push(0); // tek okutma sütununda kullanıcı kırılımı gösterilmiyor
      return {
        label: userCode,
        data,
        backgroundColor: color,
        borderRadius: 3,
        maxBarThickness: 56,
      };
    });

    // "Tek okutma" sütunu ayrı, nötr renkli bir dataset olarak eklenir
    if (singleScanCount > 0) {
      datasets.push({
        label: 'Tek okutma',
        data: buckets.map(() => 0).concat([singleScanCount]),
        backgroundColor: COLORS.grid,
        borderRadius: 3,
        maxBarThickness: 56,
      });
    }

    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, // kullanıcı anahtarı ayrı render ediliyor (bkz. ui.js)
          tooltip: {
            backgroundColor: COLORS.teal900,
            titleFont: baseFont,
            bodyFont: baseFont,
            callbacks: {
              title: (items) => `${items[0].label} ürün/sn`,
              label: (ctx) => {
                if (ctx.parsed.y === 0) return null; // sıfır katkılı satırları tooltip'te gösterme
                return `${ctx.dataset.label} · ${ctx.parsed.y} lokasyon`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            title: { display: true, text: 'Okutma hızı aralığı (ürün/saniye)', font: baseFont, color: COLORS.inkSoft },
            grid: { display: false },
            ticks: { font: baseFont, color: COLORS.inkSoft },
          },
          y: {
            stacked: true,
            title: { display: true, text: 'Lokasyon sayısı', font: baseFont, color: COLORS.inkSoft },
            grid: { color: COLORS.grid },
            ticks: { font: baseFont, color: COLORS.inkSoft, precision: 0 },
            beginAtZero: true,
          }
        }
      }
    });

    return { chart: instances[canvasId], userColorKey: uniqueUsers };
  }

  /**
   * Genel + kullanıcı bazlı hız trend eğrileri: her kullanıcı için ayrı
   * çizgi (kendi rengiyle). Genel (tüm kullanıcılar toplam) eğri kesikli
   * çizgi olarak arka planda gösterilir, referans amaçlı.
   */
  function renderSpeedTrendChart(canvasId, overallTrend, trendByUser) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const datasets = [];

    // Genel eğri — referans, soluk kesikli çizgi
    datasets.push({
      label: 'Genel (tüm kullanıcılar)',
      data: overallTrend.points.map(p => ({ x: p.timestamp, y: p.smoothedSpeed })),
      borderColor: COLORS.inkSoft,
      borderDash: [4, 4],
      borderWidth: 1.5,
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      order: 99, // en arkada çizilsin
    });

    // Kullanıcı bazlı eğriler
    trendByUser.forEach(series => {
      datasets.push({
        label: series.userCode,
        data: series.points.map(p => ({ x: p.timestamp, y: p.smoothedSpeed })),
        borderColor: series.color,
        backgroundColor: hexToRgba(series.color, 0.08),
        borderWidth: 2,
        fill: false,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: series.color,
      });
    });

    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { font: baseFont, color: COLORS.ink, usePointStyle: true, boxWidth: 8 },
          },
          tooltip: {
            backgroundColor: COLORS.teal900,
            titleFont: baseFont,
            bodyFont: baseFont,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label} · ${ctx.parsed.y.toFixed(2)} ürün/sn`
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { tooltipFormat: 'dd.MM.yyyy HH:mm:ss' },
            title: { display: true, text: 'Zaman', font: baseFont, color: COLORS.inkSoft },
            grid: { color: COLORS.grid },
            ticks: { font: baseFont, color: COLORS.inkSoft },
          },
          y: {
            title: { display: true, text: 'Ürün / saniye', font: baseFont, color: COLORS.inkSoft },
            grid: { color: COLORS.grid },
            ticks: { font: baseFont, color: COLORS.inkSoft },
            beginAtZero: true,
          }
        }
      }
    });

    return instances[canvasId];
  }

  return {
    renderTimelineChart,
    renderLocationSpeedChart,
    renderSpeedTrendChart,
  };

})();

window.Charts = Charts;
