const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fileManager = require('./utils/fileManager');

// Check if development mode
const isDev = process.argv.includes('--dev');

// Path for storing notes
const NOTES_DIR = path.join(os.homedir(), 'Documents', 'XNotes');
const SETTINGS_FILE = path.join(NOTES_DIR, 'settings.conf');

// Default settings
const defaultSettings = {
  theme: 'light',
  showLineNumbers: true,
  showVerticalLines: true,
  automaticIndentation: true,
  spacesPerTab: 2,
  fontSize: '0.9rem',
  fontFamily: 'Arial',
  copyAsMarkdown: true,
  folderColors: {}, // Store folder color preferences
  noteColors: {} // Store note color preferences
};

let mainWindow;
let settings = defaultSettings;

// Ensure notes directory exists
function ensureNotesDirectory() {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }
}

// Load settings
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      settings = JSON.parse(data);
    } else {
      saveSettings(defaultSettings);
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = defaultSettings;
  }
  return settings;
}

// Save settings
function saveSettings(newSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
    settings = newSettings;
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 950,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.png'),
    backgroundColor: settings.theme === 'dark' ? '#222222' : '#ffffff',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: true // Ensure DevTools is enabled
    }
  });

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  // Only in development mode
  if (isDev) {
    // Open DevTools in development mode
    mainWindow.webContents.openDevTools();
    console.log('DevTools opened (development mode)');
    
    // Hot reload in development
    try {
      require('electron-reload')(__dirname, {
        electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron')
      });
    } catch (err) {
      console.log('electron-reload not available');
    }
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  ensureNotesDirectory();
  // Load settings before creating the window to ensure theme is applied from the start
  settings = loadSettings();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Communication
// Get all notes
ipcMain.handle('get-notes', async () => {
  try {
    ensureNotesDirectory();
    return fileManager.scanDirectory(NOTES_DIR);
  } catch (error) {
    console.error('Error getting notes:', error);
    return { error: error.message };
  }
});

// Read note content
ipcMain.handle('read-note', async (event, filePath) => {
  try {
    console.log('Reading note from:', filePath);
    
    if (!filePath) {
      console.error('No file path provided');
      return { error: 'No file path provided' };
    }
    
    if (fs.existsSync(filePath)) {
      console.log('File exists, reading content...');
      const content = fs.readFileSync(filePath, 'utf8');
      console.log('File read successful, content length:', content.length);
      
      // Get file stats for metadata
      const stats = fs.statSync(filePath);
      
      return {
        content: content,
        metadata: {
          creationDate: stats.birthtime,
          modificationDate: stats.mtime,
          size: stats.size,
          filename: path.basename(filePath)
        }
      };
    } else {
      console.error('File does not exist:', filePath);
      return { error: 'File does not exist' };
    }
  } catch (error) {
    console.error('Error reading note:', error);
    return { error: error.message };
  }
});

// Save note content
ipcMain.handle('save-note', async (event, { path: filePath, content }) => {
  console.log('Saving note to path:', filePath);
  
  try {
    if (!filePath) {
      console.error('No file path provided for save');
      return { success: false, error: 'No file path provided' };
    }
    
    if (!content) {
      console.warn('Empty content being saved to:', filePath);
      // We'll continue with the save even if content is empty
    }
    
    ensureDirectoryExistence(path.dirname(filePath));
    
    // Create backup of existing file if it exists
    try {
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.bak`;
        fs.copyFileSync(filePath, backupPath);
        console.log('Created backup at:', backupPath);
      }
    } catch (backupError) {
      console.warn('Failed to create backup:', backupError);
      // Continue with save even if backup fails
    }
    
    // Write the file
    fs.writeFileSync(filePath, content);
    console.log('Successfully wrote file:', filePath);
    
    return { success: true };
  } catch (error) {
    console.error('Error saving note:', error);
    return { success: false, error: error.message };
  }
});

// Ensure directory exists
function ensureDirectoryExistence(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Create new note
ipcMain.handle('create-note', async (event, { dirPath, name }) => {
  try {
    // Auto-numbering for notes with the same name
    let baseName = name;
    let counter = 0;
    let fileName = `${baseName}.html`;
    let notePath = path.join(dirPath, fileName);
    
    // Eğer aynı isimde dosya varsa numaralandırma ekle
    while (fs.existsSync(notePath)) {
      counter++;
      fileName = `${baseName} (${counter}).html`;
      notePath = path.join(dirPath, fileName);
    }
    
    // Yeni not dosyasını oluştur
    fs.writeFileSync(notePath, '<html><body></body></html>');
    console.log(`Note created at: ${notePath}`);
    
    return { path: notePath, success: true };
  } catch (error) {
    console.error('Error creating note:', error);
    return { error: error.message };
  }
});

// Create new directory
ipcMain.handle('create-directory', async (event, { parentDir, name }) => {
  try {
    // Auto-numbering for folders with the same name
    let baseName = name;
    let counter = 0;
    let folderName = baseName;
    let dirPath = path.join(parentDir, folderName);
    
    // Eğer aynı isimde klasör varsa numaralandırma ekle
    while (fs.existsSync(dirPath)) {
      counter++;
      folderName = `${baseName} (${counter})`;
      dirPath = path.join(parentDir, folderName);
    }
    
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Directory created at: ${dirPath}`);
    
    return { path: dirPath, success: true };
  } catch (error) {
    console.error('Error creating directory:', error);
    return { error: error.message };
  }
});

// Delete note or directory
ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    const stats = fs.statSync(itemPath);
    
    if (stats.isDirectory()) {
      fs.rmdirSync(itemPath, { recursive: true });
    } else {
      fs.unlinkSync(itemPath);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting item:', error);
    return { error: error.message };
  }
});

// Delete note specifically
ipcMain.handle('delete-note', async (event, { path: notePath }) => {
  try {
    if (!fs.existsSync(notePath)) {
      return { success: false, error: 'Note does not exist' };
    }
    
    fs.unlinkSync(notePath);
    return { success: true };
  } catch (error) {
    console.error('Error deleting note:', error);
    return { success: false, error: error.message };
  }
});

// Delete directory specifically
ipcMain.handle('delete-directory', async (event, { path: dirPath, recursive }) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    
    fs.rmdirSync(dirPath, { recursive: recursive === true });
    return { success: true };
  } catch (error) {
    console.error('Error deleting directory:', error);
    return { success: false, error: error.message };
  }
});

// Rename note
ipcMain.handle('rename-note', async (event, { path: notePath, newName }) => {
  try {
    if (!fs.existsSync(notePath)) {
      return { success: false, error: 'Note does not exist' };
    }
    
    const dirPath = path.dirname(notePath);
    const newNoteName = newName.endsWith('.html') ? newName : `${newName}.html`;
    const newNotePath = path.join(dirPath, newNoteName);
    
    // Check if the new path already exists
    if (fs.existsSync(newNotePath)) {
      return { success: false, error: 'A note with this name already exists' };
    }
    
    fs.renameSync(notePath, newNotePath);
    return { success: true, newPath: newNotePath };
  } catch (error) {
    console.error('Error renaming note:', error);
    return { success: false, error: error.message };
  }
});

// Rename directory
ipcMain.handle('rename-directory', async (event, { path: dirPath, newName }) => {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    
    const parentDir = path.dirname(dirPath);
    const newDirPath = path.join(parentDir, newName);
    
    // Check if the new path already exists
    if (fs.existsSync(newDirPath)) {
      return { success: false, error: 'A directory with this name already exists' };
    }
    
    fs.renameSync(dirPath, newDirPath);
    return { success: true, newPath: newDirPath };
  } catch (error) {
    console.error('Error renaming directory:', error);
    return { success: false, error: error.message };
  }
});

// Get file stats
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }
    
    const stats = fs.statSync(filePath);
    return {
      success: true,
      birthtime: stats.birthtime,
      mtime: stats.mtime,
      size: stats.size
    };
  } catch (error) {
    console.error('Error getting file stats:', error);
    return { success: false, error: error.message };
  }
});

// Get settings
ipcMain.handle('get-settings', () => {
  return settings;
});

// Save settings
ipcMain.handle('save-settings', (event, newSettings) => {
  saveSettings(newSettings);
  return { success: true };
});

// Save expanded folders for next launch
ipcMain.handle('save-expanded-folders', (event, expandedFolders) => {
  try {
    // Store expanded folders in settings
    settings.expandedFolders = expandedFolders;
    saveSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving expanded folders:', error);
    return { success: false, error: error.message };
  }
});

// Save folder color
ipcMain.handle('save-folder-color', (event, { folderPath, color }) => {
  try {
    if (!settings.folderColors) {
      settings.folderColors = {};
    }
    
    if (color === 'default') {
      delete settings.folderColors[folderPath];
    } else {
      settings.folderColors[folderPath] = color;
    }
    
    saveSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving folder color:', error);
    return { success: false, error: error.message };
  }
});

// Save note color
ipcMain.handle('save-note-color', (event, { notePath, color }) => {
  try {
    if (!settings.noteColors) {
      settings.noteColors = {};
    }
    
    if (color === 'default') {
      delete settings.noteColors[notePath];
    } else {
      settings.noteColors[notePath] = color;
    }
    
    saveSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('Error saving note color:', error);
    return { success: false, error: error.message };
  }
});

// Duplicate note
ipcMain.handle('duplicate-note', async (event, notePath) => {
  try {
    if (!fs.existsSync(notePath)) {
      return { success: false, error: 'Note does not exist' };
    }

    // Read the original note content
    const content = fs.readFileSync(notePath, 'utf8');
    
    // Generate new name with "(copy)" suffix
    const dir = path.dirname(notePath);
    const ext = path.extname(notePath);
    const baseName = path.basename(notePath, ext);
    
    let copyNumber = 1;
    let newName = `${baseName} (copy)${ext}`;
    let newPath = path.join(dir, newName);
    
    // Find an available name if copy already exists
    while (fs.existsSync(newPath)) {
      copyNumber++;
      newName = `${baseName} (copy ${copyNumber})${ext}`;
      newPath = path.join(dir, newName);
    }
    
    // Write the duplicate note
    fs.writeFileSync(newPath, content, 'utf8');
    
    return { success: true, path: newPath };
  } catch (error) {
    console.error('Error duplicating note:', error);
    return { success: false, error: error.message };
  }
});

// Move item (file or folder)
ipcMain.handle('move-item', async (event, { sourcePath, targetPath }) => {
  try {
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source path does not exist' };
    }

    // Check if source and target are the same
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
      console.log('Source and target are the same, no move needed');
      return { success: true }; // No error, just don't move
    }

    // Check if trying to move a directory into itself
    const resolvedSource = path.resolve(sourcePath);
    const resolvedTarget = path.resolve(targetPath);
    if (resolvedTarget.startsWith(resolvedSource + path.sep) || resolvedTarget === resolvedSource) {
      console.log('Cannot move directory into itself');
      return { success: true }; // No error, just don't move
    }

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Check if item is a directory to handle color migration
    const isDirectory = fs.statSync(sourcePath).isDirectory();

    // Move colors from old path to new path
    if (isDirectory && settings.folderColors) {
      // Move the folder's own color
      if (settings.folderColors[sourcePath]) {
        const color = settings.folderColors[sourcePath];
        delete settings.folderColors[sourcePath];
        settings.folderColors[targetPath] = color;
        console.log(`Moved folder color from ${sourcePath} to ${targetPath}`);
      }

      // Move colors of all subfolders and files
      const sourcePathLength = sourcePath.length;
      const updatedColors = {};
      let hasUpdates = false;

      // Update folder colors
      Object.keys(settings.folderColors).forEach(folderPath => {
        if (folderPath.startsWith(sourcePath + path.sep)) {
          const relativePath = folderPath.substring(sourcePathLength);
          const newPath = targetPath + relativePath;
          updatedColors[newPath] = settings.folderColors[folderPath];
          delete settings.folderColors[folderPath];
          hasUpdates = true;
          console.log(`Moved subfolder color from ${folderPath} to ${newPath}`);
        } else {
          updatedColors[folderPath] = settings.folderColors[folderPath];
        }
      });

      if (hasUpdates) {
        settings.folderColors = updatedColors;
      }

      // Update note colors within moved folder
      if (settings.noteColors) {
        const updatedNoteColors = {};
        let hasNoteUpdates = false;

        Object.keys(settings.noteColors).forEach(notePath => {
          if (notePath.startsWith(sourcePath + path.sep)) {
            const relativePath = notePath.substring(sourcePathLength);
            const newPath = targetPath + relativePath;
            updatedNoteColors[newPath] = settings.noteColors[notePath];
            delete settings.noteColors[notePath];
            hasNoteUpdates = true;
            console.log(`Moved note color from ${notePath} to ${newPath}`);
          } else {
            updatedNoteColors[notePath] = settings.noteColors[notePath];
          }
        });

        if (hasNoteUpdates) {
          settings.noteColors = updatedNoteColors;
        }
      }

      if (hasUpdates || (settings.noteColors && Object.keys(settings.noteColors).length > 0)) {
        saveSettings(settings);
      }
    } else if (!isDirectory && settings.noteColors && settings.noteColors[sourcePath]) {
      const color = settings.noteColors[sourcePath];
      delete settings.noteColors[sourcePath];
      settings.noteColors[targetPath] = color;
      saveSettings(settings);
      console.log(`Moved note color from ${sourcePath} to ${targetPath}`);
    }

    fs.renameSync(sourcePath, targetPath);
    return { success: true };
  } catch (error) {
    console.error('Error moving item:', error);
    return { success: false, error: error.message };
  }
});

// Reorder item within its parent directory
ipcMain.handle('reorder-item', async (event, { itemPath, newIndex }) => {
  try {
    const parentDir = path.dirname(itemPath);
    const itemName = path.basename(itemPath);
    
    // Get current order configuration
    const orderConfig = fileManager.loadOrderConfig(parentDir);
    
    // Remove item from current position if it exists
    const currentIndex = orderConfig.order.indexOf(itemName);
    if (currentIndex !== -1) {
      orderConfig.order.splice(currentIndex, 1);
    }
    
    // Insert at new position
    orderConfig.order.splice(newIndex, 0, itemName);
    
    // Save updated configuration
    fileManager.saveOrderConfig(parentDir, orderConfig);
    
    return { success: true };
  } catch (error) {
    console.error('Error reordering item:', error);
    return { success: false, error: error.message };
  }
});

// Window controls
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  
  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      break;
    case 'close':
      // Pencere kapatılmadan önce renderer'a haber ver
      // böylece expanded klasörleri kaydedebilir
      mainWindow.webContents.send('app-closing');
      mainWindow.close();
      break;
    default:
      break;
  }
});