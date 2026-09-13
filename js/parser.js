/**
 * parser.js
 * ---------------------------------------------------------------------------
 * Stok sayım cihazlarından gelen .txt dosyalarını ayrıştırır.
 *
 * Beklenen satır formatı (noktalı virgülle ayrılmış, 8 alan):
 *
 *   8683559344447;0000000001;800014;00776;0; ;1;26.11.2000;13:01:15
 *    [0] Barkod        [1] Sabit-1   [2] Lokasyon  [3] Kullanıcı Kodu
 *    [4] Sabit-2        [5] (bilinmiyor)  [6] Okutma Sırası
 *    [7] Tarih (gg.aa.yyyy)  [8] Saat (ss:dd:ss)
 *
 * NOT: Örnekte 9 alan görünüyor çünkü kullanıcının verdiği ham örnekte
 * boşluk karakterleri de birer alan gibi ayrışabiliyor. Bu modül alan
 * sayısındaki küçük tutarsızlıklara toleranslı çalışacak şekilde
 * tasarlandı: alanlar index'e göre değil, TRIM edilip normalize edilerek
 * eşleştirilir. Gerçek dosya örnekleri geldikçe FIELD_MAP kolayca
 * güncellenebilir.
 * ---------------------------------------------------------------------------
 */

const StockParser = (() => {

  // Alan pozisyonlarını burada tek noktadan yönetiyoruz.
  // Gerçek veri örnekleri ile karşılaştırıp gerekirse index'leri güncelle.
  const FIELD_INDEX = {
    BARCODE: 0,
    CONSTANT_1: 1,
    LOCATION_CODE: 2,
    USER_CODE: 3,
    CONSTANT_2: 4,
    // NOT: örnekte 5. alan (boşluk) ile 6. alan (okutma sırası) arasında
    // belirsizlik var. Şimdilik "son 3 alan" tarih/saat/sıra üçlüsü olarak
    // sondan sayılıyor, böylece baştaki olası boşluk alanları sorun çıkarmaz.
  };

  const MIN_FIELDS = 7; // en az bu kadar alan olmalı, yoksa satır geçersiz sayılır

  /**
   * Tek bir ham satırı yapılandırılmış bir kayda çevirir.
   * @param {string} rawLine
   * @param {number} lineNumber - orijinal dosyadaki satır no (hata raporlama için)
   * @returns {{ valid: boolean, record?: object, error?: string, raw: string, lineNumber: number }}
   */
  function parseLine(rawLine, lineNumber) {
    const line = rawLine.replace(/\r$/, ''); // olası CRLF kalıntısını temizle

    if (!line.trim()) {
      return { valid: false, error: 'Boş satır', raw: rawLine, lineNumber };
    }

    // Alanları ayır, her birinin baş/son boşluklarını temizle
    const fields = line.split(';').map(f => f.trim());

    if (fields.length < MIN_FIELDS) {
      return {
        valid: false,
        error: `Beklenen alan sayısı sağlanamadı (bulunan: ${fields.length}, min: ${MIN_FIELDS})`,
        raw: rawLine,
        lineNumber
      };
    }

    // Sondan sayarak tarih/saat/okutma sırasını güvenilir şekilde yakala
    const total = fields.length;
    const timeStr = fields[total - 1];
    const dateStr = fields[total - 2];
    const scanOrderStr = fields[total - 3];

    const barcode = fields[FIELD_INDEX.BARCODE];
    const constant1 = fields[FIELD_INDEX.CONSTANT_1];
    const locationCode = fields[FIELD_INDEX.LOCATION_CODE];
    const userCode = fields[FIELD_INDEX.USER_CODE];
    const constant2 = fields[FIELD_INDEX.CONSTANT_2];

    // Tarih formatı doğrulama: gg.aa.yyyy
    const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateStr);
    // Saat formatı doğrulama: ss:dd:ss
    const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(timeStr);

    if (!barcode) {
      return { valid: false, error: 'Barkod alanı boş', raw: rawLine, lineNumber };
    }
    if (!dateMatch) {
      return { valid: false, error: `Geçersiz tarih formatı: "${dateStr}"`, raw: rawLine, lineNumber };
    }
    if (!timeMatch) {
      return { valid: false, error: `Geçersiz saat formatı: "${timeStr}"`, raw: rawLine, lineNumber };
    }

    const [, dd, mm, yyyy] = dateMatch;
    const [, hh, min, ss] = timeMatch;

    // JS Date nesnesi oluştur (analiz/sıralama için pratik olacak)
    const timestamp = new Date(
      Number(yyyy), Number(mm) - 1, Number(dd),
      Number(hh), Number(min), Number(ss)
    );

    const record = {
      barcode,
      constant1,
      locationCode,
      userCode,
      constant2,
      scanOrder: scanOrderStr,
      dateStr,
      timeStr,
      timestamp,       // Date nesnesi
      rawFieldCount: total,
      lineNumber
    };

    return { valid: true, record, raw: rawLine, lineNumber };
  }

  /**
   * Tüm dosya içeriğini (string) satır satır ayrıştırır.
   * @param {string} fileContent
   * @returns {{ records: object[], errors: object[], totalLines: number }}
   */
  function parseFileContent(fileContent) {
    // Hem \n hem \r\n satır sonlarını destekle, sondaki boş satırları at
    const lines = fileContent.split(/\r?\n/).filter((_, idx, arr) => {
      // son satır tamamen boşsa (dosya sonunda newline varsa) sayma
      return !(idx === arr.length - 1 && arr[idx].trim() === '');
    });

    const records = [];
    const errors = [];

    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      const result = parseLine(line, lineNumber);
      if (result.valid) {
        records.push(result.record);
      } else {
        errors.push({ lineNumber, error: result.error, raw: result.raw });
      }
    });

    return { records, errors, totalLines: lines.length };
  }

  // Dışa açılan (public) API
  return {
    parseLine,
    parseFileContent
  };

})();

// Tarayıcı ortamında global erişim için (module sistemi kullanılmıyor)
window.StockParser = StockParser;
