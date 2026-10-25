/* sw.js - EXAM-STUDENT (GitHub Pages)
   Letakkan SEFOLDER dengan index.html (mis. /examcbt/sw.js).

   Prinsip:
   - HANYA menyimpan "kerangka" aplikasi (index.html + aset statis CDN).
   - TIDAK pernah menyentuh panggilan ke Apps Script (POST fetch ke script.google.com):
     soal, token, dan nilai selalu langsung ke server, tidak pernah tersimpan di sini.
   - index.html memakai "jaringan dulu": revisi baru langsung terpakai saat online,
     dan kalau WiFi putus/lemah (mis. siswa menekan F5 di tengah ujian) halaman
     tetap terbuka dari cache. Draf jawaban sudah aman di localStorage.
   - Versi baru SW TIDAK memaksa aktif (tanpa skipWaiting otomatis), supaya tidak
     ada pergantian di tengah ujian. Aktif sendiri saat semua tab ditutup.
*/
const VERSI = 'v134-1';                       // naikkan bila daftar SHELL_FILES berubah
const CACHE_SHELL = 'examcbt-shell-' + VERSI;
const CACHE_CDN = 'examcbt-cdn-v1';
const SHELL_FILES = ['./', './index.html'];
const TIMEOUT_JARINGAN_MS = 4000;

const HOST_CDN = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];
const HOST_API = ['script.google.com', 'script.googleusercontent.com'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).catch(function () {})
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n.indexOf('examcbt-shell-') === 0 && n !== CACHE_SHELL) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Tombol manual (mis. dari panel admin, di luar jam ujian): postMessage('SKIP_WAITING')
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function bolehDisimpan(res) {
  return res && (res.ok || res.type === 'opaque');
}

// Jaringan dulu (batas waktu), cadangan dari cache.
function jaringanDulu(req, namaCache) {
  return caches.open(namaCache).then(function (cache) {
    var batas = new Promise(function (_, tolak) {
      setTimeout(function () { tolak(new Error('timeout')); }, TIMEOUT_JARINGAN_MS);
    });
    return Promise.race([fetch(req), batas]).then(function (res) {
      if (bolehDisimpan(res)) cache.put(req, res.clone());
      return res;
    }).catch(function (err) {
      return cache.match(req, { ignoreSearch: true })
        .then(function (hit) { return hit || cache.match('./index.html'); })
        .then(function (hit) { if (hit) return hit; throw err; });
    });
  });
}

// Pakai cache langsung, sambil memperbarui diam-diam di belakang.
function cacheLaluSegarkan(req, namaCache) {
  return caches.open(namaCache).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var dariJaringan = fetch(req).then(function (res) {
        if (bolehDisimpan(res)) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || dariJaringan;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;            // POST ke Apps Script lewat begitu saja

  var url = new URL(req.url);
  if (HOST_API.indexOf(url.hostname) !== -1) return;   // jangan pernah menyimpan API

  if (url.origin === self.location.origin) {
    var halamanUtama = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);
    event.respondWith(halamanUtama ? jaringanDulu(req, CACHE_SHELL) : cacheLaluSegarkan(req, CACHE_SHELL));
    return;
  }

  if (HOST_CDN.indexOf(url.hostname) !== -1) {
    event.respondWith(cacheLaluSegarkan(req, CACHE_CDN));
  }
});
