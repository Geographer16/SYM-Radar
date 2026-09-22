/**
 * report.js
 * ---------------------------------------------------------------------------
 * Analiz sonuçlarından ("Analysis.runAllAnalyses" çıktısı) bağımsız,
 * yazdırılabilir bir HTML rapor dokümanı üretir. Bu doküman yeni bir
 * sekmede açılır; kullanıcı tarayıcının "Yazdır" (Ctrl+P) diyaloğundan
 * "PDF olarak kaydet" seçeneğiyle dosyaya çevirebilir.
 *
 * Rapor grafik içermez, sadece tablo ve özet kartlarından oluşur — bu
 * sayede Chart.js'e bağımlı olmadan, tek başına açılıp yazdırılabilir kalır.
 *
 * Veri hâlâ tarayıcıdan çıkmaz: yeni sekme de aynı tarayıcı içinde, blob
 * URL üzerinden açılır — ağa hiçbir şey gönderilmez.
 * ---------------------------------------------------------------------------
 */

const Report = (() => {

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(n, digits = 0) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  /** Genel bulgular bölümü için otomatik, okunabilir yorum cümleleri üretir. */
  function buildNarrative(results, meta) {
    const { locationCount, users, userStats, overallSpeed } = results;
    const parts = [];

    parts.push(
      `Bu sayımda toplam <strong>${fmt(locationCount)}</strong> farklı lokasyon, ` +
      `<strong>${fmt(users.length)}</strong> kullanıcı tarafından, <strong>${fmt(meta.validCount)}</strong> geçerli okutma ile tamamlanmıştır.`
    );

    if (meta.errorCount > 0) {
      parts.push(
        `Yüklenen dosyalarda <strong>${fmt(meta.errorCount)}</strong> satır format hatası nedeniyle okunamamış ve analiz dışında bırakılmıştır.`
      );
    }

    const speed = overallSpeed.itemsPerSecond;
    if (speed > 0) {
      const secPerItem = 1 / speed;
      parts.push(
        `Lokasyon içi ortalama hız ürün başına <strong>${fmt(secPerItem, 2)} saniye</strong> olarak ölçülmüştür.`
      );
    }

    if (userStats.length > 0) {
      const fastest = [...userStats].filter(u => u.itemsPerSecond > 0)
        .sort((a, b) => b.itemsPerSecond - a.itemsPerSecond)[0];
      const slowest = [...userStats].filter(u => u.itemsPerSecond > 0)
        .sort((a, b) => a.itemsPerSecond - b.itemsPerSecond)[0];
      if (fastest && slowest && fastest.userCode !== slowest.userCode) {
        parts.push(
          `Kullanıcılar arasında en yüksek hıza sahip <strong>${escapeHtml(fastest.userCode)}</strong>, ` +
          `en düşük hıza sahip ise <strong>${escapeHtml(slowest.userCode)}</strong> olmuştur.`
        );
      }
    }

    return parts.map(p => `<p>${p}</p>`).join('\n');
  }

  function buildUserTable(userStats) {
    const rows = userStats.map(u => {
      const secPerItem = u.itemsPerSecond > 0 ? (1 / u.itemsPerSecond).toFixed(2) : '—';
      return `
        <tr>
          <td><span class="r-dot" style="background:${u.color}"></span>${escapeHtml(u.userCode)}</td>
          <td>${fmt(u.recordCount)}</td>
          <td>${fmt(u.locationCount)}</td>
          <td>${secPerItem}</td>
          <td>${Analysis.formatClockTime(u.startTime)}</td>
          <td>${Analysis.formatClockTime(u.endTime)}</td>
          <td>${Analysis.formatDuration(u.totalDurationSec)}</td>
        </tr>
      `;
    }).join('');

    return `
      <section class="r-section">
        <h2>Kullanıcı Karşılaştırması</h2>
        <table class="r-table">
          <thead><tr><th>Kullanıcı</th><th>Okutma</th><th>Lokasyon</th><th>Ürün Başına Saniye</th><th>Başlangıç</th><th>Bitiş</th><th>Toplam Süre</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  /**
   * Ana giriş noktası: analiz sonuçlarını alıp tam bir HTML doküman string'i
   * üretir ve yeni bir sekmede açar.
   *
   * @param {object} results - Analysis.runAllAnalyses(records) çıktısı
   * @param {object} meta - { validCount, errorCount, fileNames }
   */
  function generateAndOpen(results, meta) {
    const now = new Date();
    const generatedAt = now.toLocaleString('tr-TR');

    const userLegend = `
      <div class="r-legend">
        ${results.users.map(u => `<span class="r-legend-item"><span class="r-dot" style="background:${u.color}"></span>${escapeHtml(u.userCode)}</span>`).join('')}
      </div>
    `;

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Sayım Analiz Raporu — ${escapeHtml(generatedAt)}</title>
<style>
  :root {
    --ink:#17332E; --ink-soft:#4B655F; --teal-900:#0F3D3E; --teal-600:#1B7A6B;
    --teal-100:#DCEFE7; --paper:#F7FAF9; --surface:#FFFFFF; --line:#D8E6E1;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", -apple-system, sans-serif;
    background: var(--paper); color: var(--ink); margin: 0;
    line-height: 1.55;
  }
  .r-page { max-width: 860px; margin: 0 auto; padding: 2.5rem 1.75rem 4rem; }
  .r-header { border-bottom: 3px solid var(--teal-600); padding-bottom: 1.2rem; margin-bottom: 2rem; }
  .r-header h1 { font-size: 1.6rem; color: var(--teal-900); margin: 0 0 0.3rem; }
  .r-header .r-meta { font-size: 0.85rem; color: var(--ink-soft); }
  .r-section { margin-bottom: 2.2rem; }
  .r-section h2 { font-size: 1.15rem; color: var(--teal-900); border-left: 4px solid var(--teal-600); padding-left: 0.6rem; margin: 0 0 0.8rem; }
  .r-muted { color: var(--ink-soft); font-size: 0.88rem; margin: 0 0 0.8rem; }
  .r-summary-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
    background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
    margin-bottom: 1.5rem;
  }
  .r-summary-cell { background: var(--surface); padding: 1rem; text-align: center; }
  .r-summary-value { font-size: 1.6rem; font-weight: 700; color: var(--teal-900); display: block; }
  .r-summary-label { font-size: 0.72rem; color: var(--ink-soft); }
  .r-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .r-table th { background: var(--teal-100); color: var(--teal-900); text-align: left; padding: 0.55rem 0.8rem; font-weight: 600; }
  .r-table td { padding: 0.5rem 0.8rem; border-top: 1px solid var(--line); }
  .r-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 0.4rem; vertical-align: middle; }
  .r-chart-img { width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .r-legend { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 0.7rem; }
  .r-legend-item { font-size: 0.78rem; color: var(--ink-soft); }
  .r-print-bar { display: flex; justify-content: flex-end; gap: 0.6rem; margin-bottom: 1.5rem; }
  .r-print-bar button {
    background: var(--teal-600); color: #fff; border: none; border-radius: 6px;
    padding: 0.6rem 1.1rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit;
  }
  .r-footer { text-align: center; color: var(--ink-soft); font-size: 0.76rem; margin-top: 3rem; }
  @media print {
    .r-print-bar { display: none; }
    .r-avoid-break { break-inside: avoid; }
    body { background: #fff; }
  }
</style>
</head>
<body>
  <div class="r-page">
    <div class="r-print-bar">
      <button onclick="window.print()">Yazdır / PDF olarak kaydet</button>
    </div>

    <div class="r-header">
      <h1>Sayım Analiz Raporu</h1>
      <div class="r-meta">
        Oluşturulma: ${escapeHtml(generatedAt)}
        ${meta.fileNames ? ` · Kaynak dosya(lar): ${escapeHtml(meta.fileNames)}` : ''}
      </div>
    </div>

    <section class="r-section">
      <h2>Genel Bakış</h2>
      <div class="r-summary-grid">
        <div class="r-summary-cell"><span class="r-summary-value">${fmt(results.locationCount)}</span><span class="r-summary-label">Sayılan Lokasyon</span></div>
        <div class="r-summary-cell"><span class="r-summary-value">${fmt(results.users.length)}</span><span class="r-summary-label">Kullanıcı</span></div>
        <div class="r-summary-cell"><span class="r-summary-value">${fmt(meta.validCount)}</span><span class="r-summary-label">Geçerli Okutma</span></div>
        <div class="r-summary-cell"><span class="r-summary-value">${results.overallSpeed.itemsPerSecond > 0 ? fmt(1 / results.overallSpeed.itemsPerSecond, 2) : '—'}</span><span class="r-summary-label">Ürün Başına Ortalama Saniye</span></div>
      </div>
      ${buildNarrative(results, meta)}
    </section>

    ${buildUserTable(results.userStats)}
    ${userLegend}

    <div class="r-footer">Sayım Akışı ile oluşturulmuştur · Bu rapor tamamen tarayıcınızda üretildi, hiçbir veri sunucuya gönderilmedi.</div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      alert('Rapor sekmesi açılamadı. Tarayıcınızın açılır pencere engelleyicisini kontrol edin.');
    }
    // Blob URL'i biraz gecikmeyle serbest bırak (yeni sekme içeriği yükleyene kadar bekle)
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  return { generateAndOpen };

})();

window.Report = Report;
