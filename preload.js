const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meetAPI', {
  // Window controls
  close:    () => ipcRenderer.send('win-close'),
  hide:     () => ipcRenderer.send('win-hide'),
  minimise: () => ipcRenderer.send('win-minimise'),

  // Desktop capturer (screen-source list for audio loopback via LCA pattern)
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  // Block 5 — save transcript to disk via native save dialog (main writes file).
  saveTranscript: (filename, content) =>
    ipcRenderer.invoke('save-transcript', { filename, content }),
});
