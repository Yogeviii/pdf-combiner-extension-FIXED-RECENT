(() => {
  if (window.__commboxPdfPickerLoaded) return;
  window.__commboxPdfPickerLoaded = true;

  let armed = false;
  let overlay = null;
  let coolButton = null;

  const PDF_RE = /\.pdf(?:[?#].*)?$/i;
  const FILE_RE = /\.(?:pdf|jpe?g|png|gif|webp|bmp|tiff?)(?:[?#].*)?$/i;

  function showOverlay(text) {
    removeOverlay();
    overlay = document.createElement("div");
    overlay.textContent = text;
    Object.assign(overlay.style, {
      position: "fixed",
      zIndex: "2147483647",
      left: "50%",
      top: "16px",
      transform: "translateX(-50%)",
      background: "#111",
      color: "#fff",
      padding: "10px 14px",
      borderRadius: "10px",
      font: "13px/1.4 Arial, sans-serif",
      boxShadow: "0 6px 22px rgba(0,0,0,.25)",
      pointerEvents: "none"
    });
    document.documentElement.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function addCoolButton() {
    if (coolButton) return;

    coolButton = document.createElement("button");
    coolButton.type = "button";
    coolButton.textContent = "cool button";
    coolButton.title = "cool button";
    Object.assign(coolButton.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      border: "0",
      borderRadius: "999px",
      padding: "12px 18px",
      background: "linear-gradient(135deg, #00d2ff, #3a7bd5)",
      color: "#fff",
      font: "700 14px/1 Arial, sans-serif",
      letterSpacing: "0",
      boxShadow: "0 10px 24px rgba(0, 91, 187, .35)",
      cursor: "pointer",
      transition: "transform .16s ease, box-shadow .16s ease, filter .16s ease"
    });

    coolButton.addEventListener("mouseenter", () => {
      coolButton.style.transform = "translateY(-2px) scale(1.03)";
      coolButton.style.boxShadow = "0 14px 30px rgba(0, 91, 187, .45)";
      coolButton.style.filter = "brightness(1.05)";
    });

    coolButton.addEventListener("mouseleave", () => {
      coolButton.style.transform = "";
      coolButton.style.boxShadow = "0 10px 24px rgba(0, 91, 187, .35)";
      coolButton.style.filter = "";
    });

    coolButton.addEventListener("click", () => {
      showOverlay("cool button");
      window.setTimeout(removeOverlay, 1400);
    });

    document.documentElement.appendChild(coolButton);
  }

  function sanitizeName(value, fallback = "file") {
    return String(value || fallback)
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || fallback;
  }

  function getHref(anchor) {
    const href = anchor?.getAttribute?.("href") || "";
    return href.trim();
  }

  function isPdfAnchor(anchor) {
    if (!anchor) return false;
    const href = getHref(anchor);
    const text = anchor.textContent || "";
    return PDF_RE.test(href) || /\.pdf(?:\s|$)/i.test(text);
  }

  function isFileAnchor(anchor) {
    if (!anchor) return false;
    const href = getHref(anchor);
    const text = anchor.textContent || "";
    return FILE_RE.test(href) || /\.(?:pdf|jpe?g|png|gif|webp|bmp|tiff?)(?:\s|$)/i.test(text);
  }

  function fullUrl(anchor) {
    return new URL(getHref(anchor), location.origin).href;
  }

  function absoluteUrl(value) {
    if (!value || /^data:/i.test(value)) return "";
    try {
      return new URL(value, location.href).href;
    } catch (error) {
      return "";
    }
  }

  function fileNameFromUrl(url, fallback) {
    try {
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || "");
      return sanitizeName(name, fallback);
    } catch (error) {
      return fallback;
    }
  }

  function extensionFromUrl(url) {
    const match = String(url || "").match(/\.(pdf|jpe?g|png|gif|webp|bmp|tiff?)(?:[?#].*)?$/i);
    return match ? `.${match[1].toLowerCase()}` : "";
  }

  function ensureFileExtension(name, url, fallbackName) {
    const sanitized = sanitizeName(name, fallbackName);
    if (FILE_RE.test(sanitized)) return sanitized;

    const extension = extensionFromUrl(url) || extensionFromUrl(fallbackName);
    return extension ? `${sanitized}${extension}` : sanitized;
  }

  function imageUrlFromElement(img) {
    const src =
      img.currentSrc ||
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-url");

    const url = absoluteUrl(src);
    if (!url || /\.svg(?:[?#].*)?$/i.test(url)) return "";

    const width = img.naturalWidth || img.width || img.clientWidth;
    const height = img.naturalHeight || img.height || img.clientHeight;
    if (width && height && (width < 40 || height < 40)) return "";

    return url;
  }

  function getConversationRoot(startNode) {
    const start = startNode?.nodeType === Node.ELEMENT_NODE
      ? startNode
      : startNode?.parentElement;

    if (!start) return document.body;

    const exactRoot =
      start.closest('[id^="divWrapperChilds_"]') ||
      start.closest('[id^="objectResponseBox_"]');

    if (exactRoot) return exactRoot;

    const likelyRoot =
      start.closest('.wrapperChildScroll') ||
      start.closest('.WrapperChildsScroll') ||
      start.closest('[class*="WrapperChilds"]') ||
      start.closest('[class*="wrapperChild"]');

    if (likelyRoot) return likelyRoot;

    // Fallback: climb ancestors and choose the closest ancestor containing at least one file.
    let node = start;
    let lastUseful = start;
    while (node && node !== document.body && node !== document.documentElement) {
      const fileCount =
        [...node.querySelectorAll?.('a[href]') || []].filter(isFileAnchor).length +
        [...node.querySelectorAll?.('img') || []].filter(imageUrlFromElement).length;
      if (fileCount > 0) lastUseful = node;
      node = node.parentElement;
    }

    return lastUseful || document.body;
  }

  function collectFiles(root) {
    const map = new Map();
    const addFile = (url, rawName, fallbackName) => {
      if (!url || !/^https?:|^blob:/i.test(url)) return;
      const name = rawName || fileNameFromUrl(url, fallbackName);

      map.set(url, {
        url,
        rawName: ensureFileExtension(name, url, fallbackName)
      });
    };

    const anchors = [...root.querySelectorAll('a[href]')].filter(isFileAnchor);
    for (const a of anchors) {
      const url = fullUrl(a);
      const rawName =
        (a.textContent || "").trim().split('/').pop() ||
        decodeURIComponent(new URL(url).pathname.split('/').pop()) ||
        "commbox-file";

      addFile(url, rawName, PDF_RE.test(url) ? "commbox-file.pdf" : "commbox-image.jpg");
    }

    let imageIndex = 1;
    const images = [...root.querySelectorAll('img')];
    for (const img of images) {
      const url = imageUrlFromElement(img);
      if (!url) continue;

      const nameFromPage =
        img.getAttribute("alt") ||
        img.getAttribute("title") ||
        img.closest?.('[aria-label]')?.getAttribute("aria-label") ||
        `commbox-image-${String(imageIndex).padStart(2, "0")}.jpg`;

      addFile(url, nameFromPage, `commbox-image-${String(imageIndex).padStart(2, "0")}.jpg`);
      imageIndex += 1;
    }

    return [...map.values()];
  }

  function getConversationId(root) {
    const id = root?.id || root?.closest?.('[id]')?.id || "conversation";
    const number = String(id).match(/\d{6,}/)?.[0];
    return sanitizeName(number || id || "conversation");
  }

  function prepareDownloadFiles(files, root) {
    const conversationId = getConversationId(root);
    const stamp = new Date().toISOString().slice(0, 10);

    return files.map((file, index) => {
      const prefix = String(index + 1).padStart(2, "0");
      const name = sanitizeName(file.rawName || `file-${prefix}`);
      return {
        url: file.url,
        filename: `Commbox Files/${conversationId}_${stamp}/${prefix}_${name}`
      };
    });
  }

  function armPicker() {
    armed = true;
    showOverlay("File picker active: click one PDF, image, or message in the target conversation. Hold Alt while clicking to open files in tabs instead of downloading.");
  }

  function disarmPicker() {
    armed = false;
    removeOverlay();
  }

  function handleClick(event) {
    if (!armed) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const clickedElement = event.target instanceof Element ? event.target : event.target?.parentElement;
    const clickedFile = clickedElement?.closest?.('a[href]');
    const anchorPoint = isFileAnchor(clickedFile) ? clickedFile : clickedElement;
    const root = getConversationRoot(anchorPoint);
    const filesToDownload = collectFiles(root);

    disarmPicker();

    if (!filesToDownload.length) {
      alert("No PDFs or images found in the selected conversation area.");
      return;
    }

    if (event.altKey) {
      chrome.runtime.sendMessage({
        type: "OPEN_COMMB0X_PDFS",
        urls: filesToDownload.map(file => file.url)
      });
      alert(`Opening ${filesToDownload.length} file(s) in background tabs.`);
      return;
    }

    const files = prepareDownloadFiles(filesToDownload, root);
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_COMMB0X_PDFS",
      files
    });

    alert(`Downloading ${files.length} file(s) from this conversation.`);
  }

  document.addEventListener("click", handleClick, true);
  addCoolButton();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ARM_COMMB0X_PDF_PICKER") {
      armPicker();
    }
  });
})();
