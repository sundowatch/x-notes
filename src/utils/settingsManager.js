const fs = require('fs');
const path = require('path');
const { getSettingsPath } = require('./fileManager');

/**
 * Settings management for XNotes
 */

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
  lastOpenedNote: null // Path to the last opened note
};

/**
 * Load settings from file
 * @returns {Object} - Current settings
 */
function loadSettings() {
  const settingsPath = getSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    } else {
      saveSettings(defaultSettings);
      return defaultSettings;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    return defaultSettings;
  }
}

/**
 * Save settings to file
 * @param {Object} newSettings - New settings to save
 * @returns {Object} - Updated settings
 */
function saveSettings(newSettings) {
  const settingsPath = getSettingsPath();
  try {
    const mergedSettings = { ...defaultSettings, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));
    return mergedSettings;
  } catch (error) {
    console.error('Error saving settings:', error);
    return defaultSettings;
  }
}

/**
 * Update a single setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @returns {Object} - Updated settings
 */
function updateSetting(key, value) {
  const currentSettings = loadSettings();
  currentSettings[key] = value;
  return saveSettings(currentSettings);
}

module.exports = {
  defaultSettings,
  loadSettings,
  saveSettings,
  updateSetting
};