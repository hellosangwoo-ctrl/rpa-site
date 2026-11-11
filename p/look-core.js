/* 오셔요 손님용 포트폴리오(/p/)와 감사 페이지(/t/)의 순수 함수 (2026-11-11)
   p/index.html, t/index.html 과 vione-ios-app 의 tests/web/look-core.test.mjs 가 같이 쓴다. DOM, fetch 를 만지지 않는다. */
(function (root) {
  "use strict";

  var SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  var TOKEN_RE = /^[0-9A-Za-z]{10}$/;
  var CATS = { c: "색", l: "길이, 모양", d: "디자인", m: "분위기" };

  // /p/?s=<slug>, /p/<slug>
  function parseSlug(href) {
    var u; try { u = new URL(href); } catch (e) { return null; }
    var s = (u.searchParams.get("s") || "").trim().toLowerCase();
    if (!s) { var m = u.pathname.match(/^\/p\/([^/?#]+)\/?$/); if (m) s = decodeURIComponent(m[1]).toLowerCase(); }
    return SLUG_RE.test(s) ? s : null;
  }
  // /t/?t=<토큰>, /t/<토큰>. 토큰은 대소문자를 가린다.
  function parseToken(href) {
    var u; try { u = new URL(href); } catch (e) { return null; }
    var t = (u.searchParams.get("t") || "").trim();
    if (!t) { var m = u.pathname.match(/^\/t\/([^/?#]+)\/?$/); if (m) t = decodeURIComponent(m[1]); }
    return TOKEN_RE.test(t) ? t : null;
  }

  function tagLabel(t) { return String(t || "").replace(/^[cdlm]:/, ""); }
  function tagCat(t) { var m = /^([cdlm]):/.exec(t || ""); return m ? m[1] : null; }

  // 사진 설명: "젤 원컬러, 누드 베이지" (최대 30자, 예약 메모에 들어간다)
  function lookOf(item) {
    var bits = [];
    if (item && item.service_name) bits.push(item.service_name);
    ((item && item.tags) || []).filter(function (t) { return /^[cd]:/.test(t); }).slice(0, 2).forEach(function (t) { bits.push(tagLabel(t)); });
    return bits.join(", ").slice(0, 30);
  }

  // 예약 페이지 주소. 매장 주소가 없으면 null(전화로 안내).
  function bookHref(slug, item, staffName) {
    if (!slug || !SLUG_RE.test(slug)) return null;
    var q = [];
    if (item && item.service_id && item.bookable !== false) q.push("svc=" + encodeURIComponent(item.service_id));
    var look = lookOf(item); if (look) q.push("look=" + encodeURIComponent(look));
    if (staffName) q.push("who=" + encodeURIComponent(String(staffName).slice(0, 20)));
    return "/b/" + slug + (q.length ? "?" + q.join("&") : "");
  }

  // 포트폴리오 거르기: 디자이너, 시술 이름
  function filterItems(items, staffId, service) {
    return (items || []).filter(function (it) {
      if (staffId && it.staff_id !== staffId) return false;
      if (service && it.service_name !== service) return false;
      return true;
    });
  }
  function serviceNames(items) {
    var out = []; (items || []).forEach(function (it) { if (it.service_name && out.indexOf(it.service_name) < 0) out.push(it.service_name); });
    return out;
  }
  function staffName(staff, id) {
    for (var i = 0; i < (staff || []).length; i++) if (staff[i].id === id) return staff[i].name;
    return null;
  }

  function publicUrl(base, path) {
    if (!path) return null;
    return base.replace(/\/$/, "") + "/storage/v1/object/public/portfolio/" + String(path).split("/").map(encodeURIComponent).join("/");
  }

  function fmtWon(n) {
    if (n == null || isNaN(n)) return "";
    return Number(n).toLocaleString("ko-KR") + "원부터";
  }

  // 추천 이유 한 줄
  function whyText(r, lang) {
    if (r && r.wish) return lang === "ko" ? "지난번에 해보고 싶다고 하신 스타일" : "The style you wanted to try";
    var m = ((r && r.matched) || []).map(tagLabel).slice(0, 3);
    if (m.length) return (lang === "ko" ? "겹치는 스타일: " : "Similar: ") + m.join(", ");
    return lang === "ko" ? "같은 시술" : "Same service";
  }

  // 사진 상태 → 손님에게 보일 안내와 버튼
  function photoView(state, live) {
    if (!live) return { text: "링크 기간이 지나 이 화면에서는 고를 수 없어요. 매장에 말씀해 주세요.", actions: state === "public" ? ["withdraw"] : [] };
    switch (state) {
      case "pending": return { text: null, actions: ["decline", "consent"] };
      case "public": return { text: "포트폴리오에 올렸어요. 고마워요.", actions: ["withdraw"] };
      case "declined": return { text: "올리지 않기로 했어요. 사진은 매장 차트에만 남아요.", actions: ["consent"] };
      case "withdrawn": return { text: "포트폴리오에서 내렸어요.", actions: ["consent"] };
      default: return { text: null, actions: [] };
    }
  }

  var api = {
    SLUG_RE: SLUG_RE, TOKEN_RE: TOKEN_RE, CATS: CATS, parseSlug: parseSlug, parseToken: parseToken, tagLabel: tagLabel, tagCat: tagCat,
    lookOf: lookOf, bookHref: bookHref, filterItems: filterItems, serviceNames: serviceNames, staffName: staffName,
    publicUrl: publicUrl, fmtWon: fmtWon, whyText: whyText, photoView: photoView
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LookCore = api;
})(typeof self !== "undefined" ? self : this);
