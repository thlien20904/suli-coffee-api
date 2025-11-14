// dashboard.js - realtime with Socket.IO
const socket = io();
const logBody = document.getElementById('logBody');
const status = document.getElementById('status');
let counter = 0;

function addRow(r, highlight = false) {
  const tr = document.createElement('tr');
  if (highlight) tr.classList.add('highlight');
  tr.innerHTML = `
    <td>${++counter}</td>
    <td>${r.timestamp || ''}</td>
    <td>${r['document-uri'] || r['document_url'] || ''}</td>
    <td>${r['violated-directive'] || ''}</td>
    <td>${r['blocked-uri'] || ''}</td>
  `;
  logBody.prepend(tr);
  if (highlight) {
    setTimeout(() => tr.classList.remove('highlight'), 1200);
  }
}

socket.on('connect', () => {
  status.textContent = '✅ Kết nối realtime thành công';
});

socket.on('initLogs', (logs) => {
  counter = 0;
  logBody.innerHTML = '';
  logs.forEach(r => addRow(r));
  status.textContent = `📁 Tổng ${logs.length} vi phạm đã ghi nhận.`;
});

socket.on('newViolation', (r) => {
  addRow(r, true);
  status.textContent = `🚨 Vi phạm mới! Tổng: ${counter}`;
});

socket.on('disconnect', () => {
  status.textContent = '⚠️ Mất kết nối realtime';
});
