const { app, BrowserWindow } = require('electron');
const path = require('node:path');


function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 640,
    resizable: false,          
    backgroundColor: '#111111',
    autoHideMenuBar: true,     
    webPreferences: {
      contextIsolation: true,  
      nodeIntegration: false   
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});