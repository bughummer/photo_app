const { app, BrowserWindow } = require('electron');
const { server } = require('./server.cjs');
let baseUrl;

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#111217',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadURL(`${baseUrl}/index.html`);
}

app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => server.close());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
