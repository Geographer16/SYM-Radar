/**
 * charts.js
 * ---------------------------------------------------------------------------
 * Chart.js kullanarak analiz sonuçlarını grafiğe döker. Her fonksiyon bir
 * canvas id'si ve analiz verisi alır, Chart.js instance'ını döndürür.
 * Aynı canvas'a ikinci kez çizim yapılacaksa önce eskisi destroy edilir
 * (dosya yeniden yüklendiğinde grafiklerin üst üste binmemesi için).
 *
 * Kullanıcı grafikleri, kullanıcı tablosuyla aynı renkleri kullanır
 * (Analysis.getUserColor() ile atanan sabit renkler) — böylece tabloda
 * görülen kullanıcı burada da aynı renkte tanınır.
 * ---------------------------------------------------------------------------
 */

const Charts = (() => {

  const COLORS = {
    teal900: '#0F3D3E',
    teal600: '#1B7A6B',
    inkSoft: '#4B655F',
    grid: '#E4EEEA',
    amber: '#C97A1F',
  };

  const instances = {};

  function destroyIfExists(canvasId) {
    if (instances[canvasId]) {
      instances[canvasId].destroy();
      delete instances[canvasId];
    }
  }

  /** "Temizle" veya son dosya kaldırıldığında tüm grafik instance'larını yok eder. */
  function destroyAll() {
    Object.keys(instances).forEach(destroyIfExists);
  }

  const baseFont = { family: 'Inter, sans-serif', size: 12 };

  /** Chart.js metin/gridline renklerini CSS değişkeninden okur (tema uyumlu). */
  function themeColor(varName, fallback) {
    const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return val || fallback;
  }

  /**
   * Kullanıcı bazlı okutma hızı karşılaştırması — yatay bar chart.
   * Her bar kullanıcının kendi rengiyle, ürün/saniye cinsinden.
   */
  function renderUserSpeedChart(canvasId, userStats) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const sorted = [...userStats].sort((a, b) => b.itemsPerSecond - a.itemsPerSecond);
    const ink = themeColor('--ink', COLORS.teal900);
    const inkSoft = themeColor('--ink-soft', COLORS.inkSoft);
    const grid = themeColor('--line', COLORS.grid);

    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(u => u.userCode),
        datasets: [{
          label: 'Ürün / saniye',
          data: sorted.map(u => Number(u.itemsPerSecond.toFixed(2))),
          backgroundColor: sorted.map(u => u.color),
          borderRadius: 4,
          maxBarThickness: 34,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        resizeDelay: 100,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: COLORS.teal900,
            titleFont: baseFont,
            bodyFont: baseFont,
            callbacks: {
              label: (c) => `${c.parsed.x.toFixed(2)} ürün/sn`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Ürün / saniye', font: baseFont, color: inkSoft },
            grid: { color: grid },
            ticks: { font: baseFont, color: inkSoft },
          },
          y: {
            grid: { display: false },
            ticks: { font: baseFont, color: ink },
          },
        },
      },
    });

    return instances[canvasId];
  }

  /**
   * Kullanıcı bazlı okutma ve lokasyon sayısı — gruplu (grouped) bar chart.
   * İki metrik yan yana: toplam okutma, sayılan lokasyon sayısı.
   */
  function renderUserVolumeChart(canvasId, userStats) {
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const sorted = [...userStats].sort((a, b) => b.recordCount - a.recordCount);
    const ink = themeColor('--ink', COLORS.teal900);
    const inkSoft = themeColor('--ink-soft', COLORS.inkSoft);
    const grid = themeColor('--line', COLORS.grid);
    const teal600 = themeColor('--teal-600', COLORS.teal600);
    const amber = themeColor('--amber', COLORS.amber);

    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(u => u.userCode),
        datasets: [
          {
            label: 'Okutma',
            data: sorted.map(u => u.recordCount),
            backgroundColor: teal600,
            borderRadius: 4,
            maxBarThickness: 26,
          },
          {
            label: 'Lokasyon',
            data: sorted.map(u => u.locationCount),
            backgroundColor: amber,
            borderRadius: 4,
            maxBarThickness: 26,
          },
        ],
      },
      options: {
        responsive: true,
        resizeDelay: 100,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { font: baseFont, color: ink, usePointStyle: true, boxWidth: 8 },
          },
          tooltip: {
            backgroundColor: COLORS.teal900,
            titleFont: baseFont,
            bodyFont: baseFont,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: baseFont, color: ink },
          },
          y: {
            beginAtZero: true,
            grid: { color: grid },
            ticks: { font: baseFont, color: inkSoft, precision: 0 },
          },
        },
      },
    });

    return instances[canvasId];
  }

  return {
    renderUserSpeedChart,
    renderUserVolumeChart,
    destroyAll,
  };

})();

window.Charts = Charts;
