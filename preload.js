const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoro', {
  getState: () => ipcRenderer.invoke('timer:get'),
  start: (minutes, label) => ipcRenderer.invoke('timer:start', minutes, label),
  pause: () => ipcRenderer.invoke('timer:pause'),
  reset: () => ipcRenderer.invoke('timer:reset'),
  retrySave: () => ipcRenderer.invoke('timer:retry'),
  close: () => ipcRenderer.invoke('window:close'),
  getPosition: () => ipcRenderer.invoke('window:position'),
  setPosition: (x, y) => ipcRenderer.invoke('window:move', x, y),
  resize: height => ipcRenderer.invoke('window:resize', height),
  onState: callback => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('timer:state', listener);
    return () => ipcRenderer.removeListener('timer:state', listener);
  }
});
