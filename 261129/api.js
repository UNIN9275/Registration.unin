/* =====================================================================
   서버 연결 (index.html · admin.html 공용)
   - CONFIG.API_URL 이 있으면 구글 Apps Script(구글 시트)로 보냅니다.
   - 비어 있으면 시험 모드: 이 브라우저(localStorage)에 저장합니다.
   - 시험 모드 규칙은 apps-script/Code.gs 와 같게 맞춰 두었습니다.
   ===================================================================== */
(function () {
  var C = window.CONFIG || {};
  var DEMO = !C.API_URL;
  var KEY = 'ksp202612-demo-regs';
  var TYPES = ['개원의', '봉직의', '수련병원', '전공의'];
  var DUES = ['연회비 납부', '연회비 미납부'];
  var STATUSES = ['입금대기', '입금확인', '등록완료', '취소'];

  function digits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp() {
    var d = new Date(Date.now() + 9 * 3600 * 1000); // KST
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }
  function feeOf(dues, senior, type) { return senior ? 0 : (dues === '연회비 납부' ? 0 : ((C.FEES || {})[type] || 0)); }
  function maskLic(s) { s = String(s || ''); return s.length <= 2 ? s : s.slice(0, 2) + s.slice(2).replace(/./g, '*'); }
  function maskMail(s) { s = String(s || ''); var i = s.indexOf('@'); return i < 1 ? s : s.charAt(0) + '***' + s.slice(i); }
  function pub(o) {
    return { regNo: o.regNo, at: o.at, name: o.name, type: o.type, dues: o.dues, senior: o.senior, lic: maskLic(o.lic), org: o.org,
      tel: o.tel, mail: maskMail(o.mail), fee: o.fee, payer: o.payer, paydate: o.paydate, status: o.status };
  }
  function t(v) { return String(v == null ? '' : v).trim().slice(0, 200); }

  /* ---------- 시험 모드 저장소 ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }

  function demo(action, p) {
    var all = load(), now = stamp(), r;
    switch (action) {
      case 'register':
        if (Date.now() > Date.parse(C.DEADLINE)) return { ok: false, code: 'closed', msg: '온라인 사전등록이 마감되었습니다.' };
        var need = ['name', 'type', 'dues', 'lic', 'org', 'tel', 'mail'];
        for (var i = 0; i < need.length; i++) if (!t(p[need[i]])) return { ok: false, msg: '필수 항목이 비어 있습니다.' };
        if (!p.agree) return { ok: false, msg: '개인정보 수집·이용에 동의해 주세요.' };
        if (TYPES.indexOf(p.type) < 0 || DUES.indexOf(p.dues) < 0) return { ok: false, msg: '구분 또는 연회비 납부 여부를 확인해 주세요.' };
        var tel = digits(p.tel), name = t(p.name);
        if (tel.length < 10 || tel.length > 11) return { ok: false, msg: '핸드폰번호를 확인해 주세요.' };
        var dup = all.filter(function (x) { return x.name === name && digits(x.tel) === tel && x.status !== '취소'; })[0];
        if (dup) return { ok: false, code: 'dup', regNo: dup.regNo, msg: '이미 같은 성명·핸드폰번호로 등록되어 있습니다. (등록번호 ' + dup.regNo + ')' };
        var senior = !!p.senior, fee = feeOf(p.dues, senior, p.type);
        var max = all.reduce(function (m, x) { return Math.max(m, parseInt(digits(x.regNo), 10) || 0); }, 0);
        var o = { regNo: 'KSP-' + ('000' + (max + 1)).slice(-4), at: now, name: name, type: p.type, dues: p.dues, senior: senior ? '예' : '아니오',
          lic: t(p.lic), org: t(p.org), tel: t(p.tel), mail: t(p.mail), fee: String(fee), payer: fee ? (t(p.payer) || name) : '',
          paydate: fee ? t(p.paydate) : '', status: fee ? '입금대기' : '등록완료', updated: now, memo: '', agree: '동의 ' + now };
        all.push(o);
        if (!save(all)) return { ok: false, msg: '이 브라우저에 저장할 수 없습니다.' };
        return { ok: true, reg: pub(o) };
      case 'lookup':
        var tl = digits(p.tel), nm = t(p.name);
        return { ok: true, cancelOpen: Date.now() < Date.parse(C.CANCEL_UNTIL),
          items: all.filter(function (x) { return x.name === nm && digits(x.tel) === tl; }).reverse().map(pub) };
      case 'cancel':
        r = all.filter(function (x) { return x.regNo === p.regNo && x.name === t(p.name) && digits(x.tel) === digits(p.tel); })[0];
        if (!r) return { ok: false, msg: '등록 내역을 찾을 수 없습니다.' };
        if (r.status === '취소') return { ok: true };
        if (Date.now() >= Date.parse(C.CANCEL_UNTIL)) return { ok: false, msg: '행사 시작 이후에는 온라인으로 취소할 수 없습니다. 사무국으로 연락해 주세요.' };
        if (r.status === '입금확인') r.memo = (r.memo ? r.memo + ' / ' : '') + '본인 취소 - 환불 확인 필요';
        r.status = '취소'; r.updated = now; save(all);
        return { ok: true };
      case 'adminList':
        if (p.pw !== C.DEMO_ADMIN_PW) return { ok: false, code: 'auth', msg: '관리자 비밀번호가 맞지 않습니다.' };
        return { ok: true, rows: all };
      case 'adminUpdate':
        if (p.pw !== C.DEMO_ADMIN_PW) return { ok: false, code: 'auth', msg: '관리자 비밀번호가 맞지 않습니다.' };
        r = all.filter(function (x) { return x.regNo === p.regNo; })[0];
        if (!r) return { ok: false, msg: '등록 내역을 찾을 수 없습니다.' };
        if (p.status !== undefined) { if (STATUSES.indexOf(p.status) < 0) return { ok: false, msg: '상태 값이 올바르지 않습니다.' }; r.status = p.status; }
        if (p.memo !== undefined) r.memo = t(p.memo);
        r.updated = now; save(all);
        return { ok: true, row: r };
    }
    return { ok: false, msg: '알 수 없는 요청입니다.' };
  }

  function call(action, data) {
    var p = Object.assign({ action: action }, data || {});
    if (DEMO) return new Promise(function (res) { setTimeout(function () { res(demo(action, p)); }, 250); });
    /* text/plain 으로 보내야 구글 Apps Script 가 추가 확인 요청 없이 받습니다 */
    return fetch(C.API_URL, { method: 'POST', body: JSON.stringify(p), redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, code: 'net', msg: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }; });
  }

  window.API = { call: call, demo: DEMO, digits: digits, feeOf: feeOf, TYPES: TYPES, STATUSES: STATUSES };
})();
