// checkbox-blot.js
// Quill için özel bir onay kutusu bloğu tanımlar

const Quill = require('quill');
const Parchment = Quill.import('parchment');
const Block = Quill.import('blots/block');

// CheckboxBlot sınıfı tanımı
class CheckboxBlot extends Block {
  static create(value) {
    // Yeni bir checkbox bloğu oluştur
    const node = super.create();
    node.classList.add('checkbox-item');
    
    // Checkbox ve metin içeriğini düzenleyen bir div oluştur
    const checkboxContainer = document.createElement('div');
    checkboxContainer.classList.add('checkbox-container');
    
    // Onay kutusunu oluştur
    const checkbox = document.createElement('span');
    checkbox.classList.add('checkbox');
    
    // Değere göre işaretli veya işaretsiz olarak ayarla
    if (value === 'checked') {
      checkbox.classList.add('checked');
      checkbox.innerHTML = '&#10003;'; // Tik işareti
    } else {
      checkbox.classList.add('unchecked');
      checkbox.innerHTML = '';
    }
    
    // Tıklama olayını ekle
    checkbox.contentEditable = 'false'; // Düzenlenebilir olmasını önle
    
    // İçerik div'ini oluştur
    const content = document.createElement('div');
    content.classList.add('checkbox-content');
    content.contentEditable = 'true';
    
    // Checkbox container'a öğeleri ekle
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(content);
    node.appendChild(checkboxContainer);
    
    return node;
  }

  static formats(node) {
    const checkbox = node.querySelector('.checkbox');
    return checkbox && checkbox.classList.contains('checked') ? 'checked' : 'unchecked';
  }

  format(name, value) {
    if (name === 'checkbox' && value !== this.statics.formats(this.domNode)) {
      const checkbox = this.domNode.querySelector('.checkbox');
      
      if (value === 'checked') {
        checkbox.classList.remove('unchecked');
        checkbox.classList.add('checked');
        checkbox.innerHTML = '&#10003;'; // Tik işareti
      } else {
        checkbox.classList.remove('checked');
        checkbox.classList.add('unchecked');
        checkbox.innerHTML = '';
      }
    } else {
      super.format(name, value);
    }
  }
  
  // İçerik öğesini döndür
  get contentNode() {
    return this.domNode.querySelector('.checkbox-content');
  }
  
  // İçeriği al
  text() {
    return this.contentNode.innerText;
  }
  
  // İçeriği ayarla
  insertAt(index, value, def) {
    if (typeof value === 'string' && index === 0) {
      this.contentNode.innerText = value;
    } else {
      super.insertAt(index, value, def);
    }
  }
}

// Blot özelliklerini tanımla
CheckboxBlot.blotName = 'checkbox';
CheckboxBlot.tagName = 'div';
CheckboxBlot.className = 'checkbox-blot';

// Quill'e kaydet
Quill.register(CheckboxBlot);

module.exports = CheckboxBlot;
