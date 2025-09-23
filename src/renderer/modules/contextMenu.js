// Context Menu Module
// Contains code related to the context menu

export function initializeContextMenu() {
  // ...existing code for initializeContextMenu...
}

export function showContextMenu(e, target) {
  // ...existing code for showContextMenu...
}

export function hideContextMenu() {
  // ...existing code for hideContextMenu...
}

export function handleColorChange(color) {
  console.log('handleColorChange called with color:', color, 'contextTarget:', contextTarget);
  if (!contextTarget) {
    console.log('No context target');
    return;
  }

  // Get required elements before hiding menu
  const isFolder = contextTarget.dataset.type === 'directory';
  const targetIcon = isFolder ? 
    contextTarget.querySelector('.folder-icon') : 
    contextTarget.querySelector('.file-icon');
  const itemPath = contextTarget.dataset.path;

  hideContextMenu();

  // Apply color to icon
  console.log('Found targetIcon:', targetIcon, 'isFolder:', isFolder);
  if (targetIcon) {
    // Remove existing color classes
    targetIcon.classList.remove('color-primary', 'color-success', 'color-warning', 'color-danger', 'color-info', 'color-purple', 'color-orange', 'color-default');

    // Add new color class
    if (color !== 'default') {
      targetIcon.classList.add(`color-${color}`);
      console.log('Added color class:', `color-${color}`);
    }

    // Save color preference
    if (isFolder) {
      saveFolderColor(itemPath, color);
    } else {
      saveNoteColor(itemPath, color);
    }
  }
}

async function saveFolderColor(folderPath, color) {
  try {
    await ipcRenderer.invoke('save-folder-color', { folderPath, color });
    console.log(`Saved folder ${folderPath} color to ${color}`);
  } catch (error) {
    console.error('Error saving folder color:', error);
  }
}

async function saveNoteColor(notePath, color) {
  try {
    await ipcRenderer.invoke('save-note-color', { notePath, color });
    console.log(`Saved note ${notePath} color to ${color}`);
  } catch (error) {
    console.error('Error saving note color:', error);
  }
}
