// ============================================================
// Top Glamour Viagens — Captura de Leads
// script.js — Validação, Envio e Transição de Views
// ============================================================

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzYM0kC63PqHK43fpDtxyfWx4DyoKgUNDazta-R2PLKlvb2mLp5TbMy_IGfSPHbGFYgfA/exec';
// NOTA: token anti-spam visível publicamente por design do GAS/no-cors. Rotacionar após cada evento.
const SUBMIT_TOKEN   = 'tg2026feira';

// ─────────────────────────────────────────────────────────────
// Referências DOM
// ─────────────────────────────────────────────────────────────
const form        = document.getElementById('lead-form');
const viewForm    = document.getElementById('view-form');
const viewSuccess = document.getElementById('view-success');
const btnSubmit   = document.getElementById('btn-submit');

// ─────────────────────────────────────────────────────────────
// Submit do formulário
// ─────────────────────────────────────────────────────────────
form.addEventListener('submit', function (e) {
  e.preventDefault();

  if (!validateForm()) {
    // Scroll até o primeiro erro visível
    const firstError = form.querySelector('.field-error:not(:empty)');
    if (firstError) {
      firstError.closest('.field-group').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // Ativar estado de carregamento
  btnSubmit.disabled = true;
  btnSubmit.classList.add('loading');

  // Montar payload
  const payload = {
    nome:          form.nome.value.trim(),
    whatsapp:      form.whatsapp.value.trim(),
    email:         form.email.value.trim(),
    cidade:        form.cidade.value.trim(),
    sonha:         form.sonha.value.trim(),
    autoriza:      (form.querySelector('[name="autoriza"]:checked') || {}).value || '',
    promoWhatsapp: form.promoWhatsapp.checked ? 'Sim' : 'Não',
    promoEmail:    form.promoEmail.checked    ? 'Sim' : 'Não',
    token:         SUBMIT_TOKEN,
  };

  // Buffer local — seguro contra falha de rede em 4G instável (LGPD: removido após envio)
  var storageKey = 'tg_lead_' + Date.now();
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (_storageErr) { /* localStorage indisponível — continuar normalmente */ }

  // Envio com retry (3 tentativas, backoff 3s) — no-cors necessário para GAS Web App
  sendWithRetry(GAS_WEB_APP_URL, JSON.stringify(payload), 3, storageKey);

  // Mostrar tela de sucesso otimisticamente — localStorage é o backup para falhas persistentes
  setTimeout(showSuccess, 1600);
});

// ─────────────────────────────────────────────────────────────
// Envio com retry + limpeza de PII do localStorage
// ─────────────────────────────────────────────────────────────
function sendWithRetry(url, body, attempts, storageKey) {
  fetch(url, {
    method:  'POST',
    mode:    'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body:    body,
  }).then(function () {
    // Sucesso: remove PII do localStorage (LGPD)
    try { localStorage.removeItem(storageKey); } catch (_) {}
  }).catch(function (err) {
    if (attempts > 1) {
      setTimeout(function () {
        sendWithRetry(url, body, attempts - 1, storageKey);
      }, 3000);
    } else {
      console.warn('[Top Glamour] Falha de envio após 3 tentativas — dado preservado em localStorage:', err.message);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Transição para tela de sucesso
// ─────────────────────────────────────────────────────────────
function showSuccess() {
  viewForm.classList.remove('active');
  viewForm.classList.add('exit');

  setTimeout(function () {
    viewForm.style.display = 'none';
    viewSuccess.style.display = 'block';

    // Força reflow antes de adicionar classe
    void viewSuccess.offsetWidth;
    viewSuccess.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 350);
}

// ─────────────────────────────────────────────────────────────
// Validação do formulário
// ─────────────────────────────────────────────────────────────
function validateForm() {
  clearErrors();
  let valid = true;

  // Nome (mínimo 3 chars, dois termos)
  const nome = form.nome.value.trim();
  if (nome.length < 3) {
    setError('nome', 'Informe seu nome completo');
    valid = false;
  } else if (nome.split(/\s+/).length < 2) {
    setError('nome', 'Informe nome e sobrenome');
    valid = false;
  }

  // WhatsApp (10-11 dígitos após remover máscara)
  const wa = form.whatsapp.value.replace(/\D/g, '');
  if (wa.length < 10 || wa.length > 11) {
    setError('whatsapp', 'Informe um WhatsApp válido com DDD');
    valid = false;
  }

  // E-mail
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(form.email.value.trim())) {
    setError('email', 'Informe um e-mail válido');
    valid = false;
  }

  // Cidade
  if (form.cidade.value.trim().length < 2) {
    setError('cidade', 'Informe sua cidade e estado');
    valid = false;
  }

  // Autoriza contato (LGPD — obrigatório)
  const autoriza = form.querySelector('[name="autoriza"]:checked');
  if (!autoriza) {
    setError('autoriza', 'Selecione uma opção para continuar');
    valid = false;
  }

  return valid;
}

function setError(field, message) {
  const input    = form.querySelector('[name="' + field + '"]');
  const errorEl  = document.getElementById('error-' + field);

  if (input)   input.classList.add('invalid');
  if (errorEl) errorEl.textContent = message;
}

function clearErrors() {
  form.querySelectorAll('.field-error').forEach(function (el) { el.textContent = ''; });
  form.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
}

// Remove erro ao digitar
form.addEventListener('input', function (e) {
  const field   = e.target.name;
  const errorEl = document.getElementById('error-' + field);
  if (errorEl) errorEl.textContent = '';
  e.target.classList.remove('invalid');
}, true);

// ─────────────────────────────────────────────────────────────
// Máscara de WhatsApp: (00) 00000-0000
// ─────────────────────────────────────────────────────────────
document.getElementById('whatsapp').addEventListener('input', function () {
  var digits = this.value.replace(/\D/g, '').slice(0, 11);
  var masked = '';

  if (digits.length === 0) {
    masked = '';
  } else if (digits.length <= 2) {
    masked = '(' + digits;
  } else if (digits.length <= 6) {
    masked = '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
  } else if (digits.length <= 10) {
    masked = '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6);
  } else {
    // 11 dígitos — celular com 9
    masked = '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
  }

  this.value = masked;
});
