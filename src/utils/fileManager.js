const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * File system utilities for XNotes application
 */

// Base notes directory
const NOTES_DIR = path.join(os.homedir(), 'Documents', 'XNotes');

/**
 * Ensures that the notes directory exists
 */
function ensureNotesDirectory() {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }
  return NOTES_DIR;
}

/**
 * Gets the path to the settings file
 */
function getSettingsPath() {
  return path.join(NOTES_DIR, 'settings.conf');
}

/**
 * Ensures that a directory exists
 * @param {string} dirPath - Path to the directory
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Creates a new note file
 * @param {string} dirPath - Directory to create the note in
 * @param {string} name - Name of the note
 * @returns {string} - Path to the created note
 */
function createNote(dirPath, name) {
  const notePath = path.join(dirPath, `${name}.html`);
  const initialContent = '<!DOCTYPE html><html><head><title>' + name + '</title></head><body><p>New note</p></body></html>';
  
  fs.writeFileSync(notePath, initialContent);
  return notePath;
}

/**
 * Creates a new directory
 * @param {string} parentDir - Parent directory
 * @param {string} name - Name of the directory
 * @returns {string} - Path to the created directory
 */
function createDirectory(parentDir, name) {
  const dirPath = path.join(parentDir, name);
  ensureDirectoryExists(dirPath);
  return dirPath;
}

/**
 * Deletes a file or directory
 * @param {string} itemPath - Path to the item to delete
 */
function deleteItem(itemPath) {
  const stats = fs.statSync(itemPath);
  
  if (stats.isDirectory()) {
    fs.rmSync(itemPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(itemPath);
  }
}

/**
 * Reads a note file
 * @param {string} filePath - Path to the note file
 * @returns {string} - Content of the note
 */
function readNote(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Saves a note file
 * @param {string} filePath - Path to the note file
 * @param {string} content - Content to save
 */
function saveNote(filePath, content) {
  const dir = path.dirname(filePath);
  ensureDirectoryExists(dir);
  fs.writeFileSync(filePath, content);
}

/**
 * Gets the path to the order configuration file for a directory
 * @param {string} dirPath - Directory path
 * @returns {string} - Path to the order file
 */
function getOrderFilePath(dirPath) {
  return path.join(dirPath, '.xnotes-order.json');
}

/**
 * Loads the order configuration for a directory
 * @param {string} dirPath - Directory path
 * @returns {Object} - Order configuration
 */
function loadOrderConfig(dirPath) {
  const orderFilePath = getOrderFilePath(dirPath);
  
  try {
    if (fs.existsSync(orderFilePath)) {
      const data = fs.readFileSync(orderFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading order config for ${dirPath}:`, error);
  }
  
  return { order: [] };
}

/**
 * Saves the order configuration for a directory
 * @param {string} dirPath - Directory path
 * @param {Object} orderConfig - Order configuration
 */
function saveOrderConfig(dirPath, orderConfig) {
  const orderFilePath = getOrderFilePath(dirPath);
  
  try {
    ensureDirectoryExists(dirPath);
    fs.writeFileSync(orderFilePath, JSON.stringify(orderConfig, null, 2));
  } catch (error) {
    console.error(`Error saving order config for ${dirPath}:`, error);
  }
}

/**
 * Updates the order of items in a directory
 * @param {string} dirPath - Directory path
 * @param {Array} orderedItems - Array of item names in desired order
 */
function updateItemOrder(dirPath, orderedItems) {
  const orderConfig = { order: orderedItems };
  saveOrderConfig(dirPath, orderConfig);
}

/**
 * Reorders an item within its parent directory
 * @param {string} itemPath - Path to the item to reorder
 * @param {number} newIndex - New index position
 */
function reorderItem(itemPath, newIndex) {
  const parentDir = path.dirname(itemPath);
  const itemName = path.basename(itemPath);
  const orderConfig = loadOrderConfig(parentDir);
  
  // Remove item from current position
  const currentIndex = orderConfig.order.indexOf(itemName);
  if (currentIndex !== -1) {
    orderConfig.order.splice(currentIndex, 1);
  }
  
  // Insert at new position
  orderConfig.order.splice(newIndex, 0, itemName);
  
  saveOrderConfig(parentDir, orderConfig);
}

/**
 * Scans a directory for notes and subdirectories
 * @param {string} dir - Directory to scan
 * @returns {Object} - Tree structure of notes and directories
 */
function scanDirectory(dir) {
  const result = {
    path: dir,
    name: path.basename(dir),
    type: 'directory',
    children: []
  };

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const orderConfig = loadOrderConfig(dir);
    
    // Create a map for quick lookup
    const itemMap = new Map();
    
    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      
      // Skip order configuration files
      if (item.name === '.xnotes-order.json') {
        continue;
      }
      
      let childItem;
      if (item.isDirectory()) {
        childItem = scanDirectory(itemPath);
      } else if (path.extname(item.name) === '.html') {
        childItem = {
          path: itemPath,
          name: path.basename(item.name, '.html'),
          type: 'file'
        };
      }
      
      if (childItem) {
        itemMap.set(item.name, childItem);
      }
    }
    
    // Apply ordering
    const orderedChildren = [];
    
    // First, add items in the specified order
    for (const itemName of orderConfig.order) {
      if (itemMap.has(itemName)) {
        orderedChildren.push(itemMap.get(itemName));
        itemMap.delete(itemName);
      }
    }
    
    // Then add any remaining items that weren't in the order config
    const remainingItems = Array.from(itemMap.values());
    remainingItems.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    result.children = [...orderedChildren, ...remainingItems];
    
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return result;
}

/**
 * Moves a file or folder to a new location
 * @param {string} sourcePath - Path to the file or folder to move
 * @param {string} destinationPath - Path to the destination folder
 */
function moveItem(sourcePath, destinationPath) {
  const itemName = path.basename(sourcePath);
  const targetPath = path.join(destinationPath, itemName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }

  ensureDirectoryExists(destinationPath);
  fs.renameSync(sourcePath, targetPath);
}

module.exports = {
  NOTES_DIR,
  ensureNotesDirectory,
  getSettingsPath,
  ensureDirectoryExists,
  createNote,
  createDirectory,
  deleteItem,
  readNote,
  saveNote,
  scanDirectory,
  moveItem,
  loadOrderConfig,
  saveOrderConfig,
  updateItemOrder,
  reorderItem
};