import { Injectable } from '@angular/core';

// Self-contained print stylesheet injected into the isolated print document.
// The invoice markup itself is reused (rendered InvoiceDocumentComponent clone)
// so the printed output matches the document shown in the modal.
const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .invoice-document { width: 100%; }
  .invoice-document table { width: 100%; border-collapse: collapse; }
  .invoice-document thead { display: table-header-group; }
  .invoice-document tr { page-break-inside: avoid; break-inside: avoid; }
  .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
`;

@Injectable({ providedIn: 'root' })
export class InvoicePrintService {
  /**
   * Prints the given element in isolation: a hidden same-origin iframe receives
   * a copy of the current document's styles plus a clone of the element, so the
   * CRM shell (navbar, sidebar, modal chrome) is never printed and the live
   * page/modal state is left untouched.
   */
  print(element: HTMLElement): void {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
      visibility: 'hidden',
    });

    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      iframe.remove();
    };

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      cleanup();
      return;
    }

    // Reuse the app's compiled styles so Tailwind/component classes render.
    document
      .querySelectorAll('link[rel="stylesheet"], style')
      .forEach((node) => doc.head.appendChild(node.cloneNode(true)));

    const printStyle = doc.createElement('style');
    printStyle.textContent = PRINT_CSS;
    doc.head.appendChild(printStyle);

    doc.body.appendChild(element.cloneNode(true));

    win.addEventListener('afterprint', cleanup);
    // Fallback in case `afterprint` never fires (some browsers).
    window.setTimeout(cleanup, 60000);

    // Resources referenced by cloned <link> tags are already cached by the
    // parent document, so a frame is enough for layout before printing.
    const runPrint = (): void => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    };
    if (doc.readyState === 'complete') {
      window.requestAnimationFrame(() => window.setTimeout(runPrint, 60));
    } else {
      win.addEventListener('load', () => window.setTimeout(runPrint, 60));
    }
  }
}
