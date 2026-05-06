// ============================================================
// Top Glamour Viagens — Captura de Leads
// Google Apps Script Web App
// Evento: Feira 2026-03-29
// ============================================================
//
// INSTRUÇÕES DE DEPLOY:
// 1. Acesse script.google.com → Novo Projeto
// 2. Cole este código
// 3. Clique em "Implantar" → "Nova implantação"
// 4. Tipo: App da web
// 5. Executar como: Eu mesmo
// 6. Quem tem acesso: Qualquer pessoa
// 7. Copie a URL gerada e cole em script.js (variável GAS_WEB_APP_URL)
// ============================================================

// CONFIGURAÇÃO: Cole o ID da sua planilha aqui após criá-la
// (ou deixe vazio para criar automaticamente na 1ª execução)
const SPREADSHEET_ID = '1XAamyN3H29ASqU5MfUb5wnXEWaIHr_ZQyRPtDlZQUfg';
const SHEET_NAME = 'Leads';
const BACKUP_SHEET_NAME = 'Forms-Backup';
const SUBMIT_TOKEN = 'tg2026feira'; // deve coincidir com script.js

// ─────────────────────────────────────────────────────────────
// ENDPOINT PRINCIPAL — recebe dados do formulário HTML
// ─────────────────────────────────────────────────────────────
// Sanitiza valor para prevenir formula injection no Google Sheets
function sanitizeCell(value) {
  const s = String(value == null ? '' : value).trim();
  return /^[=+\-@|]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : '';
    if (!raw) throw new Error('Payload vazio');

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error('Payload malformado');
    }

    // Validação de token anti-spam
    // NOTA: token visível publicamente por design do GAS/no-cors — rotacionar após cada evento
    if (data.token !== SUBMIT_TOKEN) {
      throw new Error('Token inválido');
    }

    // Validação dos campos obrigatórios
    const required = ['nome', 'whatsapp', 'email', 'cidade', 'autoriza'];
    for (const field of required) {
      if (!data[field] || data[field].toString().trim() === '') {
        throw new Error('Campo obrigatorio ausente: ' + field);
      }
    }

    // Validação de formato (backend — não confiar só no frontend)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(data.email.trim())) {
      throw new Error('E-mail invalido');
    }
    const waDigits = data.whatsapp.replace(/\D/g, '');
    if (waDigits.length < 10 || waDigits.length > 11) {
      throw new Error('WhatsApp invalido');
    }

    // LockService — evita IDs duplicados em submits simultâneos
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(8000);
    } catch (_lockErr) {
      throw new Error('Sistema ocupado — tente novamente em instantes');
    }

    let nextId;
    try {
      const sheet = getOrCreateSheet(SHEET_NAME);
      // Conta IDs reais na coluna A (ignora linhas vazias e formatação residual)
      const colA = sheet.getRange('A2:A').getValues().flat();
      const count = colA.filter(function(v) { return v !== '' && v !== null && String(v).trim() !== ''; }).length;
      nextId = count + 1;
      const timestamp = Utilities.formatDate(
        new Date(),
        'America/Sao_Paulo',
        'dd/MM/yyyy HH:mm:ss'
      );

      sheet.appendRow([
        nextId,
        timestamp,
        sanitizeCell(data.nome),
        sanitizeCell(data.whatsapp),
        sanitizeCell(data.email),
        sanitizeCell(data.cidade),
        sanitizeCell(data.sonha || ''),
        sanitizeCell(data.autoriza),
        data.promoWhatsapp === 'Sim' ? 'Sim' : 'Nao',
        data.promoEmail    === 'Sim' ? 'Sim' : 'Nao',
        'HTML'
      ]);

      // Formatar linha recém-inserida (linhas alternadas)
      const row = sheet.getLastRow();
      if (row % 2 === 0) {
        sheet.getRange(row, 1, 1, 11).setBackground('#EEF0FF');
      }
    } finally {
      lock.releaseLock();
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', id: nextId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Erro no doPost: ' + error.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────────────────────────
// TRIGGER DO GOOGLE FORMS — adiciona #Sorteio sequencial
// ─────────────────────────────────────────────────────────────
function onFormSubmit(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(BACKUP_SHEET_NAME);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    const idCol   = sheet.getLastColumn() + 1;

    // Cabeçalho primeiro (se ainda não existe)
    if (sheet.getRange(1, idCol).getValue() === '') {
      sheet.getRange(1, idCol).setValue('#Sorteio');
    }

    // ID sequencial descontando o cabeçalho
    const id = lastRow - 1;
    sheet.getRange(lastRow, idCol).setValue(id);

  } catch (error) {
    Logger.log('Erro no trigger Forms: ' + error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER — busca ou cria a planilha de destino
// ─────────────────────────────────────────────────────────────
function getOrCreateSheet(sheetName) {
  let ss;
  const savedId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const effectiveId = SPREADSHEET_ID || savedId;

  if (effectiveId) {
    ss = SpreadsheetApp.openById(effectiveId);
  } else {
    ss = SpreadsheetApp.create('Leads - Top Glamour Feira 2026-03-29');
    const newId = ss.getId();
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', newId);
    Logger.log('Nova planilha criada. ID: ' + newId + ' | Salve este ID em SPREADSHEET_ID no código.');
  }

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    setupHeaders(sheet);
  }

  return sheet;
}

// ─────────────────────────────────────────────────────────────
// HELPER — formata cabeçalhos da planilha
// ─────────────────────────────────────────────────────────────
function setupHeaders(sheet) {
  const headers = [
    '#Sorteio', 'Data/Hora', 'Nome Completo', 'WhatsApp',
    'E-mail', 'Cidade/Estado', 'Proximo Destino dos Sonhos',
    'Autoriza Contato', 'Promo WhatsApp', 'Promo E-mail', 'Origem'
  ];

  sheet.appendRow(headers);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#161DA1');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');

  sheet.setFrozenRows(1);

  // Larguras das colunas
  const widths = [80, 160, 200, 130, 200, 150, 180, 150, 130, 130, 80];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO DE TESTE — execute manualmente para verificar
// ─────────────────────────────────────────────────────────────
function testDoPost() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        nome: 'Maria Teste Santos',
        whatsapp: '(71) 99999-8888',
        email: 'maria@teste.com',
        cidade: 'Salvador/BA',
        sonha: 'Paris, França',
        autoriza: 'Sim',
        promoWhatsapp: 'Sim',
        promoEmail: 'Não',
        token: 'tg2026feira'
      })
    }
  };

  const result = doPost(mockEvent);
  Logger.log('Resultado: ' + result.getContent());
}
