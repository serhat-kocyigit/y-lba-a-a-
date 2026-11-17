# Dilek A�ac�

Node.js 22.13+ ile proje k�k�nde `node server.mjs` �al��t�r�p http://localhost:8787 adresini a�. Ek paket kurulumu gerekmez. Yerel SQLite dosyas� ilk a��l��ta olu�ur.

Bir hesap olu�tur, payla��m linkini kopyala ve gizli pencerede a�. Ziyaret�i ad�n� ve mektubunu girer. Hesap sahibi kendi a�ac�nda s�se veya gelen mektuplara t�klayarak g�ndereni ve mesaj� g�r�r.

## GitHub Pages yay�n�

1. Bu klas�rdeki dosyalar� repoya koy. GitHub repo ayarlar�nda Pages kayna�� olarak `main` ve `/docs` klas�r�n� se�.
2. `server.mjs` dosyas�n� Node 22.13+ ve kal�c� disk destekleyen bir HTTPS bar�nd�rma ortam�nda �al��t�r. Ba�lang�� komutu `node server.mjs`. Ortam de�i�kenlerine `HOST=0.0.0.0`, `ALLOWED_ORIGIN=https://KULLANICI.github.io` ve `DB_PATH` i�in kal�c� diskteki SQLite dosyas�n�n mutlak yolunu yaz. Sa�lay�c�n�n verdi�i `PORT` de�eri kullan�l�r. Bir sunucu �rne�i �al��t�r.
3. `docs/config.js` i�indeki `DILEK_API` de�erine HTTPS API k�k adresini yaz ve repoya g�nder. �rnek: `https://api.ornek.com`. HTTPS API'yi sa�lay�c�n�n TLS katman� �zerinden sun.

GitHub Pages �n y�z� sunar. Hesaplar ve ziyaret�i mektuplar� HTTPS API'nin SQLite veritaban�nda saklan�r. Yerel ba�lant�lar yaln�zca yerel deneme i�indir. Uygulama tek sunucu �rne�i ve k���k gruplar i�in tasarland�. Ters vekil arkas�nda h�z s�n�r� vekilin ba�lant� adresine uygulan�r. Bu s�r�mde �ifre s�f�rlama bulunmuyor.

