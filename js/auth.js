// js/auth.js — Supabase 이메일/비밀번호 로그인 (전 페이지 공용)
//
// Kakao/Google/Gemini 키와 달리 이 publishable(anon) 키는 브라우저에 노출되도록
// 설계된 키다. 실제 접근 제어는 Supabase 쪽 RLS/Auth 정책이 담당하므로
// server.js/api 프록시 없이 여기서 supabase-js를 직접 호출한다.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://gppnctirycvkewokjumi.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oJFvstKca7MGPDp6pghCDQ_o8-ffwld';
  var MYPAGE_URL = window.JEOMMETU_MYPAGE_URL || '';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[auth] supabase-js가 로드되지 않았습니다.');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  var currentUser = null;
  var initialResolved = false; // getSession()/onAuthStateChange의 첫 응답이 아직 안 왔는지 구분용
  var listeners = [];
  var els = {};

  function notify() {
    listeners.forEach(function (cb) {
      cb(currentUser);
    });
  }

  function setUser(user) {
    currentUser = user;
    initialResolved = true;
    renderWidget();
    notify();
  }

  function mapError(err) {
    var msg = (err && err.message) || '';
    if (/already registered|already exists/i.test(msg)) return '이미 가입된 이메일이에요.';
    if (/invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않아요.';
    if (/password should be at least/i.test(msg)) return '비밀번호는 6자 이상이어야 해요.';
    if (/unable to validate email|invalid email/i.test(msg)) return '이메일 형식이 올바르지 않아요.';
    if (/email not confirmed/i.test(msg)) return '이메일 인증이 필요한 상태예요. 관리자에게 문의해주세요.';
    return '문제가 발생했어요. 잠시 후 다시 시도해주세요.';
  }

  function injectMarkup() {
    var widget = document.createElement('div');
    widget.className = 'auth-widget';
    widget.innerHTML =
      (MYPAGE_URL ? '<a href="' + MYPAGE_URL + '" class="mypage-btn dot" id="mypageLink" hidden>마이페이지</a>' : '') +
      '<button type="button" class="auth-btn dot" id="authTriggerBtn">로그인</button>';
    document.body.appendChild(widget);

    var overlay = document.createElement('div');
    overlay.className = 'auth-modal-overlay';
    overlay.id = 'authModalOverlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="auth-modal">' +
        '<button type="button" class="auth-modal-close" id="authModalClose" aria-label="닫기">×</button>' +
        '<h2 class="dot">로그인 / 회원가입</h2>' +
        '<p class="auth-context dot" id="authContext" hidden></p>' +
        '<form id="authForm">' +
          '<div class="auth-field">' +
            '<label for="authEmail">이메일</label>' +
            '<input type="email" id="authEmail" autocomplete="email" required>' +
          '</div>' +
          '<div class="auth-field">' +
            '<label for="authPassword">비밀번호</label>' +
            '<input type="password" id="authPassword" autocomplete="current-password" required>' +
          '</div>' +
          '<div class="auth-actions">' +
            '<button type="submit" class="btn" id="authSignInBtn">로그인</button>' +
            '<button type="button" class="btn" id="authSignUpBtn">회원가입</button>' +
          '</div>' +
          '<p class="auth-msg" id="authMsg"></p>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);

    els.triggerBtn = document.getElementById('authTriggerBtn');
    els.overlay = document.getElementById('authModalOverlay');
    els.closeBtn = document.getElementById('authModalClose');
    els.form = document.getElementById('authForm');
    els.email = document.getElementById('authEmail');
    els.password = document.getElementById('authPassword');
    els.signInBtn = document.getElementById('authSignInBtn');
    els.signUpBtn = document.getElementById('authSignUpBtn');
    els.msg = document.getElementById('authMsg');
    els.context = document.getElementById('authContext');
    els.mypageLink = document.getElementById('mypageLink');

    els.triggerBtn.addEventListener('click', function () {
      if (currentUser) {
        handleSignOut();
      } else {
        openModal();
      }
    });
    els.closeBtn.addEventListener('click', closeModal);
    els.overlay.addEventListener('click', function (e) {
      if (e.target === els.overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.overlay.hidden) closeModal();
    });
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSignIn(els.email.value.trim(), els.password.value);
    });
    els.signUpBtn.addEventListener('click', function () {
      handleSignUp(els.email.value.trim(), els.password.value);
    });
  }

  function renderWidget() {
    if (!els.triggerBtn) return;
    els.triggerBtn.textContent = currentUser ? '로그아웃' : '로그인';
    if (els.mypageLink) els.mypageLink.hidden = !currentUser;
  }

  function setMsg(text, kind) {
    els.msg.textContent = text || '';
    els.msg.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function setBusy(busy) {
    els.signInBtn.disabled = busy;
    els.signUpBtn.disabled = busy;
  }

  function openModal(contextText) {
    els.email.value = '';
    els.password.value = '';
    setMsg('');
    els.context.textContent = contextText || '';
    els.context.hidden = !contextText;
    els.overlay.hidden = false;
    els.email.focus();
  }

  function closeModal() {
    els.overlay.hidden = true;
  }

  function handleSignIn(email, password) {
    if (!email || !password) {
      setMsg('이메일과 비밀번호를 입력해주세요.', 'is-error');
      return;
    }
    setBusy(true);
    client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      setBusy(false);
      if (res.error) {
        setMsg(mapError(res.error), 'is-error');
        return;
      }
      setUser(res.data.user);
      closeModal();
    });
  }

  function handleSignUp(email, password) {
    if (!email || !password) {
      setMsg('이메일과 비밀번호를 입력해주세요.', 'is-error');
      return;
    }
    setBusy(true);
    client.auth.signUp({ email: email, password: password }).then(function (res) {
      setBusy(false);
      if (res.error) {
        setMsg(mapError(res.error), 'is-error');
        return;
      }
      if (res.data.session) {
        setUser(res.data.user);
        closeModal();
      } else {
        setMsg('이메일 인증이 필요한 상태예요. 관리자에게 문의해주세요.', 'is-error');
      }
    });
  }

  function handleSignOut() {
    client.auth.signOut().then(function () {
      setUser(null);
    });
  }

  injectMarkup();

  client.auth.getSession().then(function (res) {
    setUser(res.data.session ? res.data.session.user : null);
  });
  client.auth.onAuthStateChange(function (_event, session) {
    setUser(session ? session.user : null);
  });

  window.JeommetuAuth = {
    getUser: function () {
      return currentUser;
    },
    onChange: function (cb) {
      listeners.push(cb);
      // getSession()의 첫 응답이 스크립트 실행 순서보다 먼저 끝나버리면(세션이 캐시돼 있어
      // 빠르게 resolve되는 경우 등), 뒤늦게 로드되는 스크립트의 onChange 구독이 그 최초
      // 알림을 영영 놓친다. 이미 상태 확인이 끝난 뒤에 구독하면 현재 값을 즉시 한 번
      // 재생해줘서 이 경합을 없앤다. 아직 확인 전이면(currentUser가 아직 확정되지 않음)
      // 재생하지 않고 원래대로 곧 오는 notify()를 기다린다.
      if (initialResolved) cb(currentUser);
    },
    requireLogin: function (contextText) {
      if (currentUser) return true;
      openModal(contextText);
      return false;
    },
    openModal: openModal,
    getClient: function () {
      return client;
    }
  };
})();
