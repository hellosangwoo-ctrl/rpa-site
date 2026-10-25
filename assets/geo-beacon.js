/* AI·검색 유입과 스토어 버튼 클릭 측정 — 쿠키·식별자 없음.
   1) 유입: 외부 리퍼러나 utm_source 가 있을 때만, 세션·페이지당 한 번. 보내는 것: 리퍼러 도메인, 경로(쿼리 제외), utm_source.
   2) 스토어 클릭: App Store / Google Play / /app 버튼을 누르면 한 번. 보내는 것: 어느 스토어, 누른 페이지, 세션 첫 페이지와 그 유입 출처. */
(function () {
  var URL_ = 'https://awnumaschuictuclucmt.supabase.co/functions/v1/geo-beacon';
  function send(obj) {
    try {
      var body = JSON.stringify(obj);
      var blob = new Blob([body], { type: 'text/plain' });
      if (!(navigator.sendBeacon && navigator.sendBeacon(URL_, blob))) {
        fetch(URL_, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } });
      }
    } catch (e) {}
  }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  var ref = document.referrer, host = '';
  if (ref) { try { host = new URL(ref).hostname; } catch (e) {} }
  if (host === location.hostname) host = '';
  var utm = (location.search.match(/[?&]utm_source=([^&#]+)/) || [])[1] || '';
  try { utm = decodeURIComponent(utm).slice(0, 60); } catch (e) { utm = ''; }

  /* 세션 첫 페이지와 그 유입 출처를 기억해 둔다(스토어 클릭이 어디서 온 손님인지 알기 위해) */
  if (!store('geoSess')) store('geoSess', JSON.stringify({ h: host, u: utm, l: location.pathname }));

  if (host || utm) {
    var key = 'geoRef:' + location.pathname;
    if (!store(key)) { store(key, '1'); send({ h: host, p: location.pathname, u: utm }); }
  }

  function storeOf(href) {
    if (!href) return null;
    if (/^https?:\/\/apps\.apple\.com\//i.test(href)) return 'ios';
    if (/^https?:\/\/play\.google\.com\/store\//i.test(href)) return 'android';
    try { var u = new URL(href, location.href); if (u.hostname === location.hostname && /^\/app\/?$/.test(u.pathname)) return 'app_page'; } catch (e) {}
    return null;
  }
  window.__geoStoreOf = storeOf;

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var s = storeOf(a.getAttribute('href'));
    if (!s) return;
    var sess = {};
    try { sess = JSON.parse(store('geoSess') || '{}') || {}; } catch (e) {}
    send({ k: 'store', s: s, p: location.pathname, l: sess.l || '', h: sess.h || '', u: sess.u || '' });
  }, true);
})();
