// checkbox-functions.js
// Onay kutusu işlemleri için yardımcı fonksiyonlar

// Onay kutusu olaylarını ayarlar
function setupCheckboxHandlers(quill) {
  // Editör içinde onay kutularına tıklamayı dinle
  quill.root.addEventListener('click', function(event) {
    const target = event.target;
    
    // Eğer tıklanan öğe bir onay kutusu ise
    if (target.classList.contains('checkbox')) {
      event.preventDefault();
      event.stopPropagation();
      
      // Onay kutusunun üst bloğunu bul
      const checkboxBlot = target.closest('.checkbox-blot');
      if (!checkboxBlot) return;
      
      // Bloğun indeksini bul
      const blotIndex = quill.getIndex(quill.find(checkboxBlot));
      if (blotIndex === -1) return;
      
      // Mevcut durumunu kontrol et
      const isChecked = target.classList.contains('checked');
      
      // Durumu tersine çevir
      quill.formatAt(blotIndex, 1, 'checkbox', isChecked ? 'unchecked' : 'checked');
      
      // Format değişikliğiyle tetiklenen text-change olayına yardımcı olmak için
      // değişikliği Quill'e bildir
      quill.update();
    }
  });
}

// Toolbar butonunu tanımlar ve ekler
function addCheckboxButton(quill) {
  // Toolbar'ı bul
  const toolbar = quill.getModule('toolbar');
  if (!toolbar || !toolbar.container) return;
  
  // Onay kutusu butonu için yeni bir span oluştur
  const checkboxButton = document.createElement('span');
  checkboxButton.className = 'ql-checkbox';
  checkboxButton.title = 'Onay Kutusu Ekle';
  
  // Toolbar'a ekle
  toolbar.container.appendChild(checkboxButton);
  
  // Tıklama işlevini ekle
  checkboxButton.addEventListener('click', function() {
    // Geçerli imleç konumunu al
    const range = quill.getSelection(true);
    if (range) {
      // Onay kutusu ekle - varsayılan olarak işaretsiz
      quill.insertText(range.index, '\n', Quill.sources.USER);
      quill.insertEmbed(range.index + 1, 'checkbox', 'unchecked', Quill.sources.USER);
      quill.setSelection(range.index + 2, Quill.sources.SILENT);
    }
  });
}

// HTML içinde onay kutularını işleyen fonksiyon
function processCheckboxesInHTML(html) {
  // HTML içerisindeki checkbox-blot öğelerini işle
  return html.replace(/<div class="checkbox-blot">[\s\S]*?<\/div>/g, function(match) {
    // İşaretli mi yoksa işaretsiz mi olduğunu belirle
    const isChecked = match.includes('checkbox checked');
    
    // İçeriği çıkar
    let content = '';
    const contentMatch = match.match(/<div class="checkbox-content">([\s\S]*?)<\/div>/);
    if (contentMatch && contentMatch[1]) {
      content = contentMatch[1].trim();
    }
    
    // Markdown benzeri bir format olarak dönüştür
    return `<p>${isChecked ? '[x]' : '[ ]'} ${content}</p>`;
  });
}

// Markdown formatındaki onay kutularını HTML'e dönüştür
function convertMarkdownCheckboxesToHTML(markdown) {
  // [ ] veya [x] ile başlayan satırları checkbox-blot olarak dönüştür
  return markdown.replace(/^(\s*)-?\s*\[([ xX])\]\s+(.*?)$/gm, function(match, indent, checked, content) {
    const isChecked = checked.toLowerCase() === 'x';
    return `<div class="checkbox-blot">
      <div class="checkbox-container">
        <span class="checkbox ${isChecked ? 'checked' : 'unchecked'}">${isChecked ? '&#10003;' : ''}</span>
        <div class="checkbox-content">${content.trim()}</div>
      </div>
    </div>`;
  });
}

module.exports = {
  setupCheckboxHandlers,
  addCheckboxButton,
  processCheckboxesInHTML,
  convertMarkdownCheckboxesToHTML
};