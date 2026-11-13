const { app, BrowserWindow } = require('electron');
const path = require('node:path');


function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    resizable: true,           // canvas scales with the window (see index.html)
    fullscreenable: true,
    minWidth: 480,             // do not let the window shrink to an unusable size
    minHeight: 320,
    backgroundColor: '#111111',
    autoHideMenuBar: true,     
    webPreferences: {
      contextIsolation: true,  
      nodeIntegration: false   
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
    // F11 toggles fullscreen, Esc leaves it. Handled here in the main process
  // because Electron's default menu also binds F11; preventDefault makes sure
  // only this handler reacts, so the window never toggles twice.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      event.preventDefault();
      win.setFullScreen(false);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});