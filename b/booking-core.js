/* 오셔요 온라인 예약 페이지 — 화면과 상관없는 순수 함수 모음 (2026-11-08)
   b/index.html 과 _tests/booking/core.test.mjs 가 같이 쓴다. DOM, fetch 를 만지지 않는다. */
(function (root) {
  "use strict";

  var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  var REF_RE = /^[2-9A-HJKMNP-Z]{8}$/;

  // ── 주소에서 매장, 예약번호, 구글 토큰 꺼내기 ──
  //  /b/?s=yeonhui-nail   /b/yeonhui-nail   /b/?ref=K7M2QX9A   ...&rwg_token=...
  function parseEntry(href) {
    var u;
    try { u = new URL(href); } catch (e) { return { slug: null, ref: null, rwg: null }; }
    var q = u.searchParams;
    var slug = (q.get("s") || "").trim().toLowerCase();
    if (!slug) {
      var m = u.pathname.match(/^\/b\/([^/?#]+)\/?$/);
      if (m) slug = decodeURIComponent(m[1]).toLowerCase();
    }
    var ref = (q.get("ref") || "").trim().toUpperCase();
    var rwg = q.get("rwg_token");
    return {
      slug: SLUG_RE.test(slug) ? slug : null,
      ref: REF_RE.test(ref) ? ref : null,
      rwg: rwg && rwg.length <= 512 ? rwg : null
    };
  }

  // ── 전화번호 ──
  function phoneDigits(s) {
    var d = String(s == null ? "" : s).replace(/[^0-9]/g, "");
    if (/^8210[0-9]{7,8}$/.test(d)) d = "0" + d.slice(2);
    return d;
  }
  function isValidPhone(s, country) {
    var d = phoneDigits(s);
    if ((country || "KR") === "KR") return /^01[016789][0-9]{7,8}$/.test(d);
    return /^[0-9]{8,15}$/.test(d);
  }
  function formatPhoneKR(s) {
    var d = phoneDigits(s);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7, 11);
  }

  function validateForm(f, country, lang) {
    var e = {};
    var name = String(f.name || "").trim();
    if (!name) e.name = t(lang, "errNameEmpty");
    else if (name.length > 30) e.name = t(lang, "errNameLong");
    if (!isValidPhone(f.phone, country)) e.phone = t(lang, "errPhone");
    if (String(f.note || "").length > 200) e.note = t(lang, "errNote");
    if (!f.agree) e.agree = t(lang, "errAgree");
    return e;
  }

  // 재시도해도 예약이 하나만 생기게 하는 요청 ID
  function requestId(rand) {
    var bytes = new Uint8Array(12);
    (rand || globalThis.crypto.getRandomValues.bind(globalThis.crypto))(bytes);
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += ("0" + bytes[i].toString(16)).slice(-2);
    return "web-" + s;
  }

  // ── 구글 예약(Actions Center) 전환 추적 ──
  // 구글에서 들어오면 주소에 rwg_token 이 붙는다. 30일 동안 매장 ID 와 함께 보관하고,
  // 같은 매장에서 예약이 끝나면 구글에 전환을 알린다(merchant_changed=2: 원래 매장에서 완료).
  var RWG_COOKIE = "_rwg_token", RWG_MERCHANT = "_rwg_merchant", RWG_MAXAGE = 2592000;
  function rwgCookies(token, entityId) {
    var tail = ";max-age=" + RWG_MAXAGE + ";path=/;SameSite=Lax;Secure";
    return [RWG_COOKIE + "=" + encodeURIComponent(token) + tail,
            RWG_MERCHANT + "=" + encodeURIComponent(entityId || "") + tail];
  }
  function readCookie(cookieStr, name) {
    var parts = String(cookieStr || "").split(/;\s*/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.indexOf(name + "=") === 0) { try { return decodeURIComponent(p.slice(name.length + 1)); } catch (e) { return null; } }
    }
    return null;
  }
  function rwgFor(cookieStr, entityId) {
    var tok = readCookie(cookieStr, RWG_COOKIE), m = readCookie(cookieStr, RWG_MERCHANT);
    return tok && m && m === entityId ? tok : null;
  }
  function conversionBody(partnerId, token) {
    if (!partnerId || !token) return null;
    return JSON.stringify({ conversion_partner_id: String(partnerId), rwg_token: token, merchant_changed: "2" });
  }

  // ── 날짜 ──
  function addDays(ymd, n) {
    var p = ymd.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function weekday(ymd) {
    var p = ymd.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }
  // 오늘(매장 시간대) 'YYYY-MM-DD'
  function todayIn(tz, now) {
    var f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(now || new Date());
  }
  // API 의 dates[] 를 빈 날 포함 연속된 날짜 칸으로 펼친다
  function dayStrip(fromYmd, count, apiDates) {
    var map = {};
    (apiDates || []).forEach(function (d) { map[d.date] = d.times || []; });
    var out = [];
    for (var i = 0; i < count; i++) {
      var ymd = addDays(fromYmd, i);
      out.push({ date: ymd, dow: weekday(ymd), day: Number(ymd.slice(8, 10)), month: Number(ymd.slice(5, 7)), times: map[ymd] || [] });
    }
    return out;
  }
  // 시간 칸을 오전, 오후, 저녁으로 나눈다
  function groupTimes(times) {
    var g = { am: [], pm: [], eve: [] };
    (times || []).forEach(function (hm) {
      var h = Number(hm.slice(0, 2));
      (h < 12 ? g.am : h < 17 ? g.pm : g.eve).push(hm);
    });
    return g;
  }

  // ── 표기 ──
  function fmtPrice(n, currency, lang) {
    var v = Number(n) || 0;
    if (!v) return "";
    if ((currency || "KRW") === "KRW") return v.toLocaleString("ko-KR") + (lang === "ko" ? "원" : " KRW");
    try { return new Intl.NumberFormat(lang === "ko" ? "ko-KR" : "en-US", { style: "currency", currency: currency }).format(v); }
    catch (e) { return v + " " + currency; }
  }
  function fmtDuration(min, lang) {
    var m = Number(min) || 0;
    if (!m) return "";
    var h = Math.floor(m / 60), r = m % 60;
    if (lang === "ko") return (h ? h + "시간" : "") + (h && r ? " " : "") + (r ? r + "분" : "");
    return (h ? h + "h" : "") + (h && r ? " " : "") + (r ? r + "m" : "");
  }
  var DOW = { ko: ["일", "월", "화", "수", "목", "금", "토"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
  function fmtWhen(localStart, lang) { // 'YYYY-MM-DD HH:MM'
    var ymd = localStart.slice(0, 10), hm = localStart.slice(11, 16);
    var mo = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10)), w = weekday(ymd);
    var h = Number(hm.slice(0, 2)), mi = hm.slice(3, 5);
    if (lang === "ko") {
      var ap = h < 12 ? "오전" : "오후", h12 = h % 12 === 0 ? 12 : h % 12;
      return mo + "월 " + d + "일(" + DOW.ko[w] + ") " + ap + " " + h12 + ":" + mi;
    }
    var ap2 = h < 12 ? "AM" : "PM", h2 = h % 12 === 0 ? 12 : h % 12;
    return DOW.en[w] + ", " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mo - 1] + " " + d + ", " + h2 + ":" + mi + " " + ap2;
  }

  // ── 문구 ──
  var STR = {
    ko: {
      loading: "불러오는 중…", pickService: "시술을 골라 주세요", pickTime: "날짜와 시간을 골라 주세요",
      yourInfo: "예약하실 분", name: "이름", phone: "휴대폰 번호", note: "요청사항 (선택)",
      notePh: "예: 길이는 짧게 해주세요", agree: "예약 확인과 안내를 위해 이름과 휴대폰 번호를 매장에 전달하는 것에 동의합니다.",
      privacy: "개인정보 처리방침", submit: "예약 요청하기", submitAuto: "예약하기", sending: "보내는 중…",
      noSlots: "이날은 예약 가능한 시간이 없어요", am: "오전", pm: "오후", eve: "저녁", change: "변경",
      doneReqTitle: "예약 요청을 보냈어요", doneReqText: "원장님이 확인하면 예약이 확정돼요. 확정되면 문자로 알려드릴 수 있어요.",
      doneOkTitle: "예약이 확정됐어요", doneOkText: "예약 시간에 맞춰 와 주세요. 바뀌면 매장으로 연락해 주세요.",
      refLabel: "예약번호", keepRef: "예약번호와 휴대폰 끝 4자리로 예약을 확인하거나 취소할 수 있어요.",
      viewMine: "내 예약 보기", call: "매장에 전화", map: "지도 보기", another: "다른 예약 하기",
      statusTitle: "내 예약 확인", phone4: "휴대폰 번호 끝 4자리", check: "확인", cancel: "예약 취소",
      cancelConfirm: "이 예약을 취소할까요?", cancelled: "예약을 취소했어요", tooLate: "시작 1시간 전부터는 매장으로 전화해 주세요.",
      st_requested: "확정 대기", st_confirmed: "확정", st_done: "완료", st_cancelled: "취소됨",
      notFoundTitle: "예약 페이지를 찾을 수 없어요", notFoundText: "주소를 다시 확인하거나 매장에 문의해 주세요.",
      errorTitle: "잠시 후 다시 시도해 주세요", errorText: "인터넷 연결을 확인해 주세요.", retry: "다시 시도",
      inapp: "카카오톡 안에서 열렸어요. 버튼이 안 되면 다른 브라우저로 열어 주세요.", openExternal: "브라우저로",
      errNameEmpty: "이름을 입력해 주세요", errNameLong: "이름은 30자까지 입력할 수 있어요", errPhone: "휴대폰 번호를 확인해 주세요",
      errNote: "요청사항은 200자까지 입력할 수 있어요", errAgree: "동의가 필요해요",
      e_slot_unavailable: "방금 다른 분이 그 시간을 예약했어요. 다른 시간을 골라 주세요.",
      e_too_many: "같은 번호로 오늘 예약이 너무 많아요. 매장에 전화로 문의해 주세요.",
      e_busy: "지금 예약이 몰려 있어요. 잠시 후 다시 시도해 주세요.",
      e_bad_phone: "휴대폰 번호를 확인해 주세요", e_bad_name: "이름을 확인해 주세요",
      e_service_not_found: "선택한 시술을 지금은 예약할 수 없어요.", e_not_found: "예약을 찾을 수 없어요. 번호를 확인해 주세요.",
      e_generic: "예약하지 못했어요. 잠시 후 다시 시도해 주세요.",
      poweredBy: "오셔요 예약", minutes: "소요"
    },
    en: {
      loading: "Loading…", pickService: "Choose a service", pickTime: "Choose a date and time",
      yourInfo: "Your details", name: "Name", phone: "Mobile number", note: "Note (optional)",
      notePh: "e.g. Keep it short, please", agree: "I agree to share my name and mobile number with the shop to confirm this booking.",
      privacy: "Privacy policy", submit: "Request booking", submitAuto: "Book now", sending: "Sending…",
      noSlots: "No times available on this day", am: "Morning", pm: "Afternoon", eve: "Evening", change: "Change",
      doneReqTitle: "Booking request sent", doneReqText: "The shop will confirm your booking. You may get a text once it's confirmed.",
      doneOkTitle: "You're booked", doneOkText: "See you then. Contact the shop if anything changes.",
      refLabel: "Booking code", keepRef: "Use your booking code and the last 4 digits of your number to check or cancel.",
      viewMine: "View my booking", call: "Call the shop", map: "Map", another: "Book another",
      statusTitle: "Check my booking", phone4: "Last 4 digits of your mobile", check: "Check", cancel: "Cancel booking",
      cancelConfirm: "Cancel this booking?", cancelled: "Booking cancelled", tooLate: "Within 1 hour of the start, please call the shop.",
      st_requested: "Awaiting confirmation", st_confirmed: "Confirmed", st_done: "Completed", st_cancelled: "Cancelled",
      notFoundTitle: "Booking page not found", notFoundText: "Check the link or contact the shop.",
      errorTitle: "Please try again shortly", errorText: "Check your internet connection.", retry: "Try again",
      inapp: "Opened inside KakaoTalk. If buttons don't work, open in your browser.", openExternal: "Open in browser",
      errNameEmpty: "Enter your name", errNameLong: "Up to 30 characters", errPhone: "Check your mobile number",
      errNote: "Up to 200 characters", errAgree: "Please agree to continue",
      e_slot_unavailable: "Someone just booked that time. Please choose another.",
      e_too_many: "Too many bookings from this number today. Please call the shop.",
      e_busy: "Lots of bookings right now. Please try again shortly.",
      e_bad_phone: "Check your mobile number", e_bad_name: "Check your name",
      e_service_not_found: "That service can't be booked right now.", e_not_found: "Booking not found. Check the code and digits.",
      e_generic: "Couldn't book. Please try again shortly.",
      poweredBy: "Booked with OSEYO", minutes: "Duration"
    }
  };
  function pickLang(navLangs) {
    var l = (navLangs && navLangs[0]) || "ko";
    return /^ko/i.test(l) ? "ko" : "en";
  }
  function t(lang, key) { var d = STR[lang] || STR.ko; return d[key] != null ? d[key] : (STR.ko[key] || key); }
  function errorText(code, lang) { var k = "e_" + code; return STR.ko[k] != null ? t(lang, k) : t(lang, "e_generic"); }

  var api = {
    parseEntry: parseEntry, phoneDigits: phoneDigits, isValidPhone: isValidPhone, formatPhoneKR: formatPhoneKR,
    validateForm: validateForm, requestId: requestId, rwgCookies: rwgCookies, readCookie: readCookie, rwgFor: rwgFor,
    conversionBody: conversionBody, addDays: addDays, weekday: weekday, todayIn: todayIn, dayStrip: dayStrip,
    groupTimes: groupTimes, fmtPrice: fmtPrice, fmtDuration: fmtDuration, fmtWhen: fmtWhen, pickLang: pickLang,
    t: t, errorText: errorText, DOW: DOW, SLUG_RE: SLUG_RE, REF_RE: REF_RE, STR: STR
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BookingCore = api;
})(typeof self !== "undefined" ? self : this);
