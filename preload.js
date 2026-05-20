const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meetAPI', {
  // Window controls
  close:    () => ipcRenderer.send('win-close'),
  hide:     () => ipcRenderer.send('win-hide'),
  minimise: () => ipcRenderer.send('win-minimise'),
});
