/* AI·검색 유입 측정 — 외부 리퍼러나 utm_source 가 있을 때만, 세션·페이지당 한 번.
   보내는 것: 리퍼러 도메인, 경로(쿼리 제외), utm_source. 쿠키·식별자 없음. */
(function () {
  try {
    var ref = document.referrer, host = '';
    if (ref) { try { host = new URL(ref).hostname; } catch (e) {} }
    var utm = (location.search.match(/[?&]utm_source=([^&#]+)/) || [])[1] || '';
    if (host === location.hostname) host = '';
    if (!host && !utm) return;
    var key = 'geoRef:' + location.pathname;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    var body = JSON.stringify({ h: host, p: location.pathname, u: decodeURIComponent(utm).slice(0, 60) });
    var url = 'https://awnumaschuictuclucmt.supabase.co/functions/v1/geo-beacon';
    var blob = new Blob([body], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, blob))) {
      fetch(url, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } });
    }
  } catch (e) {}
})();
