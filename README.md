# Dilek Ağacı

Node.js 22.13+ ile proje kökünde `node server.mjs` çalıştırıp http://localhost:8787 adresini aç. Ek paket kurulumu gerekmez. Yerel SQLite dosyası ilk açılışta oluşur.

Bir hesap oluştur, paylaşım linkini kopyala ve gizli pencerede aç. Ziyaretçi adını ve mektubunu girer. Hesap sahibi kendi ağacında süse veya gelen mektuplara tıklayarak göndereni ve mesajı görür.

## GitHub Pages yayını

1. Bu klasördeki dosyaları repoya koy. GitHub repo ayarlarında Pages kaynağı olarak `main` ve `/docs` klasörünü seç.
2. `server.mjs` dosyasını Node 22.13+ ve kalıcı disk destekleyen bir HTTPS barındırma ortamında çalıştır. Başlangıç komutu `node server.mjs`. Ortam değişkenlerine `HOST=0.0.0.0`, `ALLOWED_ORIGIN=https://KULLANICI.github.io` ve `DB_PATH` için kalıcı diskteki SQLite dosyasının mutlak yolunu yaz. Sağlayıcının verdiği `PORT` değeri kullanılır. Bir sunucu örneği çalıştır.
3. `docs/config.js` içindeki `DILEK_API` değerine HTTPS API kök adresini yaz ve repoya gönder. Örnek: `https://api.ornek.com`. HTTPS API'yi sağlayıcının TLS katmanı üzerinden sun.

GitHub Pages ön yüzü sunar. Hesaplar ve ziyaretçi mektupları HTTPS API'nin SQLite veritabanında saklanır. Yerel bağlantılar yalnızca yerel deneme içindir. Uygulama tek sunucu örneği ve küçük gruplar için tasarlandı. Ters vekil arkasında hız sınırı vekilin bağlantı adresine uygulanır. Bu sürümde şifre sıfırlama bulunmuyor.
