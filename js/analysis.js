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
   * Genel ortalama okutma hızı — SADECE lokasyon içi sürelere göre hesaplanır.
   *
   * Kayıtlar önce lokasyona göre gruplanır; her lokasyonun kendi süresi
   * (o lokasyondaki ilk ve son okutma arasındaki fark) ve okutma sayısı
   * toplanır. Lokasyonlar arası geçiş/yürüme/mola süresi bu toplama hiç
   * dahil edilmez — çünkü zaten farklı lokasyonlara ait kayıtlar arasında
   * fark alınmıyor. Böylece keyfi bir zaman eşiğine (ör. "10 saniyeden
   * uzun boşluklar mola sayılsın") ihtiyaç kalmaz.
   *
   * itemsPerSecond: toplam (okutma sayısı - lokasyon sayısı) / toplam
   * lokasyon-içi süre. Tek okutmalı lokasyonlar süre/hıza katkı vermez
   * (bkz. computeLocationSpeeds ile aynı kural).
   */
  function computeOverallSpeed(records) {
    if (records.length < 2) {
      return { itemsPerSecond: 0 };
    }

    const locationSpeeds = computeLocationSpeeds(records);

    let totalActiveSeconds = 0;
    let totalActiveCount = 0;
    locationSpeeds.forEach(l => {
      if (l.itemsPerSecond !== null) {
        totalActiveSeconds += l.durationSec;
        totalActiveCount += l.count - 1;
      }
    });

    const itemsPerSecond = totalActiveSeconds > 0 ? totalActiveCount / totalActiveSeconds : 0;

    return { itemsPerSecond };
  }

  /**
   * Kullanıcı bazlı özet istatistikler: lokasyon sayısı, okutma sayısı,
   * lokasyon-içi ortalama hız — kullanıcı karşılaştırma tablosu için.
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
        itemsPerSecond: speed.itemsPerSecond,
      });
    });
    return stats.sort((a, b) => b.recordCount - a.recordCount);
  }

  /**
   * Her kullanıcı için TEK bir en ekstrem bulgu döndürür — ya kendi genel
   * hızının ortalamadan sapması, ya da saydığı lokasyonlardan birinin
   * ortalamadan sapması; hangisi daha büyükse o seçilir. Amaç: "Dikkat
   * çeken noktalar" listesinin kullanıcı sayısıyla orantılı, taranabilir
   * kalması — her kullanıcı için onlarca satır yerine en çarpıcı tek satır.
   *
   * @param {object[]} userStats - summarizeUserStats() çıktısı
   * @param {object[]} locationSpeeds - computeLocationSpeeds() çıktısı
   */
  function detectAnomalies(userStats, locationSpeeds, threshold = 0.3) {
    const usersWithSpeed = userStats.filter(u => u.itemsPerSecond > 0);
    if (usersWithSpeed.length < 2) return [];

    const userAvg = usersWithSpeed.reduce((s, u) => s + u.itemsPerSecond, 0) / usersWithSpeed.length;

    // Lokasyonları kullanıcıya göre grupla, her lokasyon için ortalamadan
    // sapma oranını hesapla (genel lokasyon ortalamasına göre).
    const locsWithSpeed = locationSpeeds.filter(l => l.itemsPerSecond !== null && l.itemsPerSecond > 0);
    const locAvg = locsWithSpeed.length > 0
      ? locsWithSpeed.reduce((s, l) => s + l.itemsPerSecond, 0) / locsWithSpeed.length
      : 0;

    const locsByUser = new Map();
    locsWithSpeed.forEach(l => {
      if (!locsByUser.has(l.userCode)) locsByUser.set(l.userCode, []);
      locsByUser.get(l.userCode).push(l);
    });

    const results = [];

    usersWithSpeed.forEach(u => {
      // Aday 1: kullanıcının genel hızının, kullanıcı ortalamasından sapması
      const userDiff = userAvg > 0 ? (u.itemsPerSecond - userAvg) / userAvg : 0;
      let best = {
        type: 'user-speed',
        userCode: u.userCode,
        color: u.color,
        direction: userDiff >= 0 ? 'fast' : 'slow',
        changePercent: Math.round(userDiff * 100),
        magnitude: Math.abs(userDiff),
      };

      // Aday 2: bu kullanıcının en ekstrem lokasyonu, genel lokasyon
      // ortalamasından sapması. Sadece daha çarpıcıysa (magnitude daha
      // büyükse) aday 1'in yerini alır.
      const userLocs = locsByUser.get(u.userCode) || [];
      if (locAvg > 0 && userLocs.length > 0) {
        let mostExtreme = null;
        userLocs.forEach(l => {
          const diff = (l.itemsPerSecond - locAvg) / locAvg;
          if (!mostExtreme || Math.abs(diff) > Math.abs(mostExtreme.diff)) {
            mostExtreme = { locationCode: l.locationCode, diff };
          }
        });
        if (mostExtreme && Math.abs(mostExtreme.diff) > best.magnitude) {
          best = {
            type: 'location-speed',
            userCode: u.userCode,
            color: u.color,
            locationCode: mostExtreme.locationCode,
            direction: mostExtreme.diff >= 0 ? 'fast' : 'slow',
            changePercent: Math.round(mostExtreme.diff * 100),
            magnitude: Math.abs(mostExtreme.diff),
          };
        }
      }

      if (best.magnitude >= threshold) results.push(best);
    });

    return results.sort((a, b) => b.magnitude - a.magnitude);
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

      locationSpeeds: computeLocationSpeeds(records),

      overallSpeed: computeOverallSpeed(records),
    };
  }

  /**
   * runAllAnalyses çıktısını alıp anomali tespitini de ekleyen sarmalayıcı.
   * Kullanıcı başına en fazla bir bulgu döner (bkz. detectAnomalies).
   */
  function withAnomalies(results) {
    results.anomalies = detectAnomalies(results.userStats, results.locationSpeeds);
    return results;
  }

  return {
    getUserColor,
    groupBy,
    groupByLocation,
    groupByUser,
    countLocations,
    summarizeUsers,
    summarizeUserStats,
    computeLocationSpeeds,
    computeOverallSpeed,
    detectAnomalies,
    runAllAnalyses,
    withAnomalies,
  };

})();

window.Analysis = Analysis;
