/**
 * Turns an on-screen A4 document (invoice, transfer receipt) into a
 * downloadable PDF by rasterising it, so the file matches the page exactly.
 *
 * Both libraries are heavy and only needed on demand, so they are imported
 * lazily to keep them out of the initial bundle.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export async function downloadElementAsPdf(element: HTMLElement, filename: string) {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
    ]);

    const canvas = await html2canvas(element, {
        // 2x keeps text legible without producing an unreasonably large file.
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const imageData = canvas.toDataURL('image/jpeg', 0.95);

    const pageHeightPx = (canvas.width * A4_HEIGHT_MM) / A4_WIDTH_MM;
    const renderedHeightMm = (canvas.height * A4_WIDTH_MM) / canvas.width;

    if (canvas.height <= pageHeightPx + 1) {
        pdf.addImage(imageData, 'JPEG', 0, 0, A4_WIDTH_MM, renderedHeightMm);
    } else {
        // Taller than one page: shift the same image up by a page each time and
        // clip it to the sheet, which avoids re-rasterising per page.
        const pages = Math.ceil(canvas.height / pageHeightPx);
        for (let page = 0; page < pages; page++) {
            if (page > 0) pdf.addPage();
            pdf.addImage(imageData, 'JPEG', 0, -page * A4_HEIGHT_MM, A4_WIDTH_MM, renderedHeightMm);
        }
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function printElement() {
    window.print();
}
