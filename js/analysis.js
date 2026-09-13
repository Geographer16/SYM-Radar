/**
 * analysis.js
 * ---------------------------------------------------------------------------
 * StockParser.parseFileContent() çıktısındaki kayıtlar (records) üzerinde
 * çalışan tüm analiz fonksiyonları burada toplanır. Her fonksiyon saf veri
 * döndürür; ekrana basma işini charts.js / ui.js üstlenir.
 *
 * Birden fazla dosya yüklendiğinde tüm kayıtlar tek bir listede birleştirilip
 * (main.js tarafında) buraya öyle gelir — dosya sınırı analiz açısından önemli
 * değildir, kullanıcı kodu tüm veri setinde tekildir.
 * ---------------------------------------------------------------------------
 */

const Analysis = (() => {

  // Kullanıcılara atanacak sabit renk paleti — teal/amber marka rengiyle
  // uyumlu ama birbirinden net ayırt edilebilir 10 renk. 10'dan fazla
  // kullanıcı olursa paleti tekrar kullanır (hash ile dağıtılır).
  const USER_COLOR_PALETTE = [
    '#1B7A6B', // teal (ana marka)
    '#C97A1F', // amber
    '#3B6FB6', // mavi
    '#A6473C', // kiremit kırmızı
    '#6B4FA0', // mor
    '#3F8F4F', // yeşil
    '#B0793A', // hardal
    '#4F8FA6', // camgöbeği
    '#8C5B8C', // mor-pembe
    '#5C6B3F', // zeytin
  ];

  /**
   * Kullanıcı koduna deterministik (her zaman aynı) bir renk atar.
   * Aynı kullanıcı kodu her analizde ve her grafikte hep aynı rengi alır.
   */
  function getUserColor(userCode) {
    let hash = 0;
    const str = String(userCode);
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return USER_COLOR_PALETTE[hash % USER_COLOR_PALETTE.length];
  }

  /**
   * Verilen bir anahtar fonksiyonuna göre kayıtları gruplar, her grubu kendi
   * içinde timestamp'e göre sıralar (eşitlik durumunda scanOrder ikincil
   * anahtar olur).
   */
  function groupBy(records, keyFn) {
    const map = new Map();
    records.forEach(rec => {
      const key = keyFn(rec);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(rec);
    });
    map.forEach(list => {
      list.sort((a, b) => {
        const t = a.timestamp - b.timestamp;
        if (t !== 0) return t;
        return Number(a.scanOrder) - Number(b.scanOrder);
      });
    });
    return map;
  }

  function groupByLocation(records) {
    return groupBy(records, r => r.locationCode);
  }

  function groupByUser(records) {
    return groupBy(records, r => r.userCode);
  }

  /** Benzersiz lokasyon sayısı. */
  function countLocations(records) {
    return new Set(records.map(r => r.locationCode)).size;
  }

  /**
   * Kullanıcı bazlı özet: her kullanıcı kodu, kaç okutma yapmış ve kendisine
   * atanan renk. Okutma sayısına göre büyükten küçüğe sıralı döner.
   */
  function summarizeUsers(records) {
    const map = new Map();
    records.forEach(rec => {
      map.set(rec.userCode, (map.get(rec.userCode) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([userCode, count]) => ({ userCode, count, color: getUserColor(userCode) }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Zamana göre lokasyon akışı: her lokasyonun İLK okutma zamanını baz alarak
   * kronolojik sırayla listeler. Birden fazla kullanıcı aynı lokasyonu
   * saymışsa (nadir ama mümkün), o lokasyon için baskın kullanıcı (en çok
   * okutma yapan) rengiyle işaretlenir.
   */
  function buildLocationTimeline(records) {
    const grouped = groupByLocation(records);
    const entries = [];

    grouped.forEach((list, locationCode) => {
      const userCounts = new Map();
      list.forEach(r => userCounts.set(r.userCode, (userCounts.get(r.userCode) || 0) + 1));
      const dominantUser = Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

      entries.push({
        locationCode,
        firstScan: list[0].timestamp,
        lastScan: list[list.length - 1].timestamp,
        count: list.length,
        userCode: dominantUser,
        color: getUserColor(dominantUser),
      });
    });

    entries.sort((a, b) => a.firstScan - b.firstScan);
    entries.forEach((e, idx) => { e.visitOrder = idx + 1; });
    return entries;
  }

  /**
   * Lokasyon bazlı okutma hızı: (okutma sayısı - 1) / (son-ilk okutma
   * arasındaki saniye). Tek okutmalı lokasyonlarda hız hesaplanamaz (null).
   * Her satıra, o lokasyonu sayan baskın kullanıcının kodu ve rengi eklenir.
   */
  function computeLocationSpeeds(records) {
    const grouped = groupByLocation(records);
    const result = [];

    grouped.forEach((list, locationCode) => {
      const count = list.length;

      const userCounts = new Map();
      list.forEach(r => userCounts.set(r.userCode, (userCounts.get(r.userCode) || 0) + 1));
      const dominantUser = Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];

      if (count < 2) {
        result.push({
          locationCode, count, durationSec: 0, itemsPerSecond: null,
          userCode: dominantUser, color: getUserColor(dominantUser),
        });
        return;
      }
      const durationSec = (list[count - 1].timestamp - list[0].timestamp) / 1000;
      const itemsPerSecond = durationSec > 0 ? (count - 1) / durationSec : null;
      result.push({
        locationCode, count, durationSec, itemsPerSecond,
        userCode: dominantUser, color: getUserColor(dominantUser),
      });
    });

    return Array.from(result).sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  }

  /**
   * Lokasyon hızlarını histogram bucket'larına dönüştürür: x ekseni sabit
   * sayıda hız aralığı (0-0.5, 0.5-1, 1-1.5 ürün/sn gibi), y ekseni o
   * aralığa düşen lokasyon sayısıdır. Yüzlerce lokasyon olsa bile grafik
   * sabit sayıda bar ile okunabilir kalır.
   *
   * Her bucket, kullanıcı bazlı kırılımını da taşır (stacked bar için):
   * bucket.byUser = [{ userCode, color, count }, ...]
   *
   * Hız hesaplanamayan (tek okutmalı) lokasyonlar ayrı bir "Tek okutma"
   * bucket'ında toplanır, sayısal aralıkların dışında tutulur.
   *
   * @param {object[]} locationSpeeds - computeLocationSpeeds() çıktısı
   * @param {number} bucketSize - her aralığın genişliği (ürün/sn), varsayılan 0.25
   */
  function buildLocationSpeedHistogram(locationSpeeds, bucketSize = 0.25) {
    const withSpeed = locationSpeeds.filter(l => l.itemsPerSecond !== null);
    const singleScan = locationSpeeds.filter(l => l.itemsPerSecond === null);

    if (withSpeed.length === 0) {
      return {
        buckets: [],
        singleScanCount: singleScan.length,
        bucketSize,
      };
    }

    const maxSpeed = Math.max(...withSpeed.map(l => l.itemsPerSecond));
    const bucketCount = Math.max(1, Math.ceil((maxSpeed + 0.0001) / bucketSize));

    // Bucket iskeletini oluştur
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const from = i * bucketSize;
      const to = from + bucketSize;
      return {
        from,
        to,
        label: `${from.toFixed(2)}–${to.toFixed(2)}`,
        total: 0,
        byUser: new Map(), // userCode -> count (geçici, sonra diziye çevrilecek)
      };
    });

    withSpeed.forEach(l => {
      let idx = Math.floor(l.itemsPerSecond / bucketSize);
      if (idx >= bucketCount) idx = bucketCount - 1; // üst sınır güvenliği
      const bucket = buckets[idx];
      bucket.total += 1;
      bucket.byUser.set(l.userCode, (bucket.byUser.get(l.userCode) || 0) + 1);
    });

    // Map'leri diziye çevir, rengi ekle
    const finalBuckets = buckets.map(b => ({
      from: b.from,
      to: b.to,
      label: b.label,
      total: b.total,
      byUser: Array.from(b.byUser.entries()).map(([userCode, count]) => ({
        userCode, count, color: getUserColor(userCode),
      })),
    }));

    return {
      buckets: finalBuckets,
      singleScanCount: singleScan.length,
      bucketSize,
    };
  }

  /**
   * Genel ortalama okutma hızı — iki farklı bakış açısıyla:
   *
   * - itemsPerSecond: ilk okutmadan son okutmaya kadar geçen TÜM süreye göre
   *   (lokasyonlar arası yürüme/bekleme dahil).
   * - activeItemsPerSecond: sadece ardışık okutmalar arasındaki süre 10
   *   saniyeyi AŞMADIĞI durumlar toplanarak hesaplanır (10sn+ boşluklar
   *   "lokasyon değişti/mola verildi" kabul edilip hariç tutulur).
   */
  function computeOverallSpeed(records) {
    if (records.length < 2) {
      return { itemsPerSecond: 0, totalSeconds: 0, activeItemsPerSecond: 0, activeSeconds: 0 };
    }
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const totalSeconds = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 1000;
    const itemsPerSecond = totalSeconds > 0 ? (records.length - 1) / totalSeconds : 0;

    const GAP_THRESHOLD_SEC = 10;
    let activeSeconds = 0;
    let activeCount = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].timestamp - sorted[i - 1].timestamp) / 1000;
      if (gap <= GAP_THRESHOLD_SEC) {
        activeSeconds += gap;
        activeCount++;
      }
    }
    const activeItemsPerSecond = activeSeconds > 0 ? activeCount / activeSeconds : 0;

    return { itemsPerSecond, totalSeconds, activeItemsPerSecond, activeSeconds };
  }

  /**
   * Zaman içindeki hız trendini hesaplar: ardışık okutmalar arasındaki
   * saniye farkından anlık hız (1 / delta) türetilir, ardından pencere
   * ortalaması (moving average) ile düzeltilir. Belirgin artış/azalış
   * bölgelerini basit bir eşik kuralıyla işaretler.
   *
   * @param {object[]} records - tek bir seri için kayıtlar (genel veya tek kullanıcı)
   * @param {number} windowSize - hareketli ortalama pencere genişliği
   */
  function computeSpeedTrend(records, windowSize = 5) {
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const points = [];

    for (let i = 1; i < sorted.length; i++) {
      const deltaSec = (sorted[i].timestamp - sorted[i - 1].timestamp) / 1000;
      const instSpeed = deltaSec > 0 ? Math.min(1 / deltaSec, 10) : 10;
      points.push({
        index: i,
        timestamp: sorted[i].timestamp,
        instantSpeed: instSpeed,
      });
    }

    const smoothed = points.map((p, idx) => {
      const start = Math.max(0, idx - windowSize + 1);
      const slice = points.slice(start, idx + 1);
      const avg = slice.reduce((sum, s) => sum + s.instantSpeed, 0) / slice.length;
      return { ...p, smoothedSpeed: avg };
    });

    const flags = [];
    const flagWindow = Math.max(windowSize * 2, 8);
    for (let i = flagWindow; i < smoothed.length; i += flagWindow) {
      const prevSlice = smoothed.slice(i - flagWindow, i - flagWindow / 2);
      const currSlice = smoothed.slice(i - flagWindow / 2, i);
      if (!prevSlice.length || !currSlice.length) continue;

      const prevAvg = prevSlice.reduce((s, p) => s + p.smoothedSpeed, 0) / prevSlice.length;
      const currAvg = currSlice.reduce((s, p) => s + p.smoothedSpeed, 0) / currSlice.length;
      if (prevAvg === 0) continue;

      const change = (currAvg - prevAvg) / prevAvg;
      if (Math.abs(change) >= 0.4) {
        flags.push({
          atIndex: i,
          timestamp: smoothed[i].timestamp,
          direction: change > 0 ? 'rise' : 'fall',
          changePercent: Math.round(change * 100),
        });
      }
    }

    return { points: smoothed, flags };
  }

  /**
   * Kullanıcı bazlı hız trend serileri: her kullanıcı için ayrı bir
   * computeSpeedTrend sonucu, rengiyle birlikte. Multi-line grafikte
   * kullanılır.
   */
  function computeSpeedTrendByUser(records) {
    const grouped = groupByUser(records);
    const series = [];
    grouped.forEach((list, userCode) => {
      if (list.length < 2) return; // trend hesaplamak için en az 2 okutma gerekir
      const trend = computeSpeedTrend(list);
      series.push({ userCode, color: getUserColor(userCode), ...trend });
    });
    return series.sort((a, b) => a.userCode.localeCompare(b.userCode));
  }

  /**
   * Kullanıcı bazlı lokasyon timeline'ı: her kullanıcının kendi ziyaret
   * ettiği lokasyonları, kendi kronolojik sırasıyla döndürür.
   */
  function buildTimelineByUser(records) {
    const grouped = groupByUser(records);
    const series = [];
    grouped.forEach((list, userCode) => {
      const timeline = buildLocationTimeline(list);
      series.push({ userCode, color: getUserColor(userCode), entries: timeline });
    });
    return series.sort((a, b) => a.userCode.localeCompare(b.userCode));
  }

  /**
   * Kullanıcı bazlı özet istatistikler: lokasyon sayısı, okutma sayısı,
   * aktif hız — kullanıcı karşılaştırma tablosu/kartları için.
   */
  function summarizeUserStats(records) {
    const grouped = groupByUser(records);
    const stats = [];
    grouped.forEach((list, userCode) => {
      const locationCount = new Set(list.map(r => r.locationCode)).size;
      const speed = computeOverallSpeed(list);
      stats.push({
        userCode,
        color: getUserColor(userCode),
        recordCount: list.length,
        locationCount,
        activeItemsPerSecond: speed.activeItemsPerSecond,
      });
    });
    return stats.sort((a, b) => b.recordCount - a.recordCount);
  }

  /**
   * Tüm analizleri tek seferde çalıştırır — main.js bunu çağırıp sonucu
   * ilgili UI/chart fonksiyonlarına dağıtır. Genel analizlerin yanında
   * kullanıcı bazlı kırılımlar da (byUser alanları) döner.
   */
  function runAllAnalyses(records) {
    return {
      locationCount: countLocations(records),
      users: summarizeUsers(records),
      userStats: summarizeUserStats(records),

      timeline: buildLocationTimeline(records),
      timelineByUser: buildTimelineByUser(records),

      locationSpeeds: computeLocationSpeeds(records),
      locationSpeedHistogram: buildLocationSpeedHistogram(computeLocationSpeeds(records)),

      overallSpeed: computeOverallSpeed(records),

      speedTrend: computeSpeedTrend(records),
      speedTrendByUser: computeSpeedTrendByUser(records),
    };
  }

  return {
    getUserColor,
    groupBy,
    groupByLocation,
    groupByUser,
    countLocations,
    summarizeUsers,
    summarizeUserStats,
    buildLocationTimeline,
    buildTimelineByUser,
    computeLocationSpeeds,
    buildLocationSpeedHistogram,
    computeOverallSpeed,
    computeSpeedTrend,
    computeSpeedTrendByUser,
    runAllAnalyses,
  };

})();

window.Analysis = Analysis;
