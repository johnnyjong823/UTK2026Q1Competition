// ===== UTK 揪團點餐 - Google Apps Script Backend =====
const SS = SpreadsheetApp.getActiveSpreadsheet();

// ===== CORS Headers =====
function createCorsOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== GET Requests =====
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    
    if (action === 'getStores') {
      return createCorsOutput({ success: true, data: getAllStores() });
    }
    if (action === 'getOrder') {
      const code = e.parameter.code || '';
      return createCorsOutput({ success: true, data: getOrderByCode(code) });
    }
    if (action === 'getActiveOrders') {
      return createCorsOutput({ success: true, data: getActiveOrders() });
    }
    if (action === 'getAllOrders') {
      return createCorsOutput({ success: true, data: getAllOrders() });
    }
    if (action === 'ping') {
      return createCorsOutput({ success: true, message: 'pong' });
    }
    
    return createCorsOutput({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return createCorsOutput({ success: false, error: err.message });
  }
}

// ===== POST Requests =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || '';
    
    if (action === 'addStore') {
      return createCorsOutput(addStore(data));
    }
    if (action === 'createOrder') {
      return createCorsOutput(createGroupOrder(data));
    }
    if (action === 'submitOrder') {
      return createCorsOutput(submitUserOrder(data));
    }
    if (action === 'closeOrder') {
      return createCorsOutput(closeGroupOrder(data));
    }
    
    return createCorsOutput({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return createCorsOutput({ success: false, error: err.message });
  }
}

// ===== Store Functions =====
function getAllStores() {
  const sheet = SS.getSheetByName('stores');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    // Parse JSON fields
    try { obj.categories = JSON.parse(obj.categories || '[]'); } catch(e) { obj.categories = []; }
    try { obj.items = JSON.parse(obj.items || '[]'); } catch(e) { obj.items = []; }
    return obj;
  });
}

function addStore(data) {
  const sheet = SS.getSheetByName('stores');
  if (!sheet) return { success: false, error: 'stores sheet not found' };
  
  const id = data.id || ('s_' + new Date().getTime());
  sheet.appendRow([
    id,
    data.name || '',
    data.icon || '🏪',
    JSON.stringify(data.categories || []),
    JSON.stringify(data.items || [])
  ]);
  
  return { success: true, id: id };
}

// ===== Group Order Functions =====
function getAllOrders() {
  const sheet = SS.getSheetByName('groupOrders');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    try { obj.orders = JSON.parse(obj.orders || '[]'); } catch(e) { obj.orders = []; }
    if (obj.closed === true || obj.closed === 'TRUE' || obj.closed === 'true') obj.closed = true;
    else obj.closed = false;
    return obj;
  });
}

function getActiveOrders() {
  return getAllOrders().filter(o => !o.closed);
}

function getOrderByCode(code) {
  if (!code) return { error: 'No code provided' };
  const orders = getAllOrders();
  const found = orders.find(o => o.code === code.toUpperCase());
  if (!found) return { error: 'Order not found' };
  return found;
}

function createGroupOrder(data) {
  const sheet = SS.getSheetByName('groupOrders');
  if (!sheet) return { success: false, error: 'groupOrders sheet not found' };
  
  const id = data.id || ('go_' + new Date().getTime());
  const code = (data.code || '').toUpperCase();
  
  sheet.appendRow([
    id,
    data.storeId || '',
    data.creator || '',
    data.payer || '',
    data.payerType || 'creator',
    data.deadline || '',
    code,
    false,
    '[]',
    data.createdAt || new Date().toISOString(),
    data.memo || ''
  ]);
  
  return { success: true, id: id, code: code };
}

function submitUserOrder(data) {
  const sheet = SS.getSheetByName('groupOrders');
  if (!sheet) return { success: false, error: 'groupOrders sheet not found' };
  
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const codeCol = headers.indexOf('code');
  const ordersCol = headers.indexOf('orders');
  const closedCol = headers.indexOf('closed');
  
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][codeCol] === (data.code || '').toUpperCase()) {
      // Check if closed
      if (allData[i][closedCol] === true || allData[i][closedCol] === 'TRUE') {
        return { success: false, error: 'Order is closed' };
      }
      
      let orders = [];
      try { orders = JSON.parse(allData[i][ordersCol] || '[]'); } catch(e) {}
      
      // Check if user already ordered
      const existing = orders.find(o => o.userId === data.userId);
      if (existing) {
        existing.items = [...existing.items, ...data.items];
      } else {
        orders.push({
          userId: data.userId,
          userName: data.userName,
          items: data.items
        });
      }
      
      sheet.getRange(i + 1, ordersCol + 1).setValue(JSON.stringify(orders));
      return { success: true, totalPeople: orders.length };
    }
  }
  
  return { success: false, error: 'Order not found' };
}

function closeGroupOrder(data) {
  const sheet = SS.getSheetByName('groupOrders');
  if (!sheet) return { success: false, error: 'groupOrders sheet not found' };
  
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const codeCol = headers.indexOf('code');
  const closedCol = headers.indexOf('closed');
  
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][codeCol] === (data.code || '').toUpperCase()) {
      sheet.getRange(i + 1, closedCol + 1).setValue(true);
      return { success: true };
    }
  }
  
  return { success: false, error: 'Order not found' };
}
