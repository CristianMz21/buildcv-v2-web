import 'server-only';

/**
 * Applies a saved theme choice before the browser paints anything.
 *
 * WITHOUT THIS THE PAGE FLASHES. Server-rendered HTML carries no `data-theme`, so somebody who chose
 * light on a dark desktop — or the reverse — sees the wrong palette for one frame on every navigation
 * that reloads the document. It is a small thing that reads as a bug, and it is worst for the person
 * who cared enough to change the setting.
 *
 * A COOKIE WOULD ALSO WORK AND IS WORSE HERE. Reading it server-side would put a rendering
 * dependency on a request header for a preference that is nobody's business but the reader's — and it
 * would send that preference to the server on every request forever, to save a script of four lines.
 * `localStorage` keeps it on the machine that holds it.
 *
 * `beforeInteractive` is the whole point: it runs before hydration and before first paint. Any later
 * and it is a toggle rather than a fix.
 *
 * IT WRITES NOTHING WHEN THE CHOICE IS "system", deliberately. The CSS already answers that case with
 * `prefers-color-scheme`, so leaving the attribute off means the palette follows the desktop live —
 * including somebody whose desktop switches at sunset while this tab is open. Stamping a resolved
 * value here would freeze it at page load.
 */
export function ThemeScript() {
  const apply = `
    try {
      var choice = localStorage.getItem('buildcv.theme');
      if (choice === 'dark' || choice === 'light') {
        document.documentElement.setAttribute('data-theme', choice);
      }
    } catch (e) {}
  `;

  // `dangerouslySetInnerHTML` is how a script tag carries a body in React, and the content is a
  // constant in this file — no interpolation, nothing from a request, nothing from a user.
  return <script dangerouslySetInnerHTML={{ __html: apply }} />;
}
