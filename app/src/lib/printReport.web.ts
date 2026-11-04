// Web: the browser's print window, where "Save as PDF" makes the file. The report is printed from a
// hidden frame, so the app itself stays as it is.
export async function shareReport(html: string, name: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  // Some browsers name the PDF after the page's title, not the frame's.
  const title = document.title;
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
  const win = frame.contentWindow!;
  document.title = name;
  const done = () => {
    document.title = title;
    setTimeout(() => frame.remove(), 1000);
  };
  win.addEventListener('afterprint', done, { once: true });
  win.focus();
  win.print();
  setTimeout(done, 60_000); // in case "afterprint" never comes
}
