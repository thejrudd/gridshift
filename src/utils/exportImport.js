import html2canvas from 'html2canvas';

// Export predictions as a JSON file download
export const exportAsJSON = (predictions) => {
  const data = JSON.stringify(predictions, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nfl-predictions-2026.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Import predictions from a JSON file
// Returns parsed predictions object or throws on invalid data
export const importFromJSON = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Validate shape: must be an object with team ID keys
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw new Error('Invalid file format: expected a predictions object');
        }

        // Validate each entry has expected fields
        for (const [teamId, record] of Object.entries(data)) {
          if (typeof record !== 'object' || record === null) {
            throw new Error(`Invalid record for team ${teamId}`);
          }
          if (typeof record.wins !== 'number' || typeof record.losses !== 'number') {
            throw new Error(`Missing wins/losses for team ${teamId}`);
          }
        }

        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

// Convert a URL to a base64 data URI
const toBase64 = async (url) => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
};

// Convert all <img> src attributes in an element to base64 data URIs.
// Returns an array of {img, originalSrc} for restoring later.
const inlineAllImages = async (element) => {
  const imgs = Array.from(element.querySelectorAll('img'));
  const originals = [];
  await Promise.all(
    imgs.map(async (img) => {
      if (img.src && !img.src.startsWith('data:')) {
        const originalSrc = img.src;
        try {
          img.src = await toBase64(originalSrc);
          originals.push({ img, originalSrc });
        } catch {
          // skip images that fail to fetch
        }
      }
    })
  );
  return originals;
};

// Freeze computed dimensions onto the clone so html2canvas doesn't need
// to compute flex layout (which it handles poorly). Walks both trees
// in parallel, reading sizes from the original and writing them onto
// the clone.
const freezeDimensions = (orig, clone) => {
  const origChildren = orig.children;
  const cloneChildren = clone.children;

  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    const origEl = origChildren[i];
    const cloneEl = cloneChildren[i];

    if (!(origEl instanceof HTMLElement)) continue;

    const rect = origEl.getBoundingClientRect();
    const style = window.getComputedStyle(origEl);

    // Only freeze elements that use flex sizing (flex-1, min-h-0, etc.)
    // which html2canvas struggles with
    if (style.display === 'flex' || style.display === 'inline-flex' ||
        style.flex !== '0 1 auto' || style.minHeight === '0px') {
      cloneEl.style.width = rect.width + 'px';
      cloneEl.style.height = rect.height + 'px';
      cloneEl.style.minHeight = rect.height + 'px';
      cloneEl.style.maxHeight = rect.height + 'px';
      cloneEl.style.flexShrink = '0';
      cloneEl.style.flexGrow = '0';
      cloneEl.style.flexBasis = 'auto';
    }

    // Recurse into children
    freezeDimensions(origEl, cloneEl);
  }
};

// Export a DOM element as a PNG image download
export const exportAsImage = async (element, { scale = 2 } = {}) => {
  // Inline images as base64 on the live DOM before capture
  const originals = await inlineAllImages(element);

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale,
      useCORS: true,
      logging: false,
      onclone: (_doc, clonedEl) => {
        // Freeze all flex-computed sizes to explicit pixels so
        // html2canvas renders them correctly
        freezeDimensions(element, clonedEl);
      },
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nfl-predictions-2026.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    // Restore original src attributes
    for (const { img, originalSrc } of originals) {
      img.src = originalSrc;
    }
  }
};
