"use client";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ask-the-lecture:theme";

/**
 * Runs before the first paint so the stored appearance is already applied when
 * the page renders — no flash of the wrong theme. The room is dark unless the
 * system asks for light, since the recording is what should be lit.
 */
export const themeBootstrapScript = `
try {
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var theme = stored === "light" || stored === "dark"
    ? stored
    : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = theme;
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}
`.trim();

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the theme still applies for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark appearance"
      title="Switch appearance"
      className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground"
    >
      {/* Each icon shows the appearance the button switches to. */}
      <svg viewBox="0 0 20 20" className="size-[18px] dark:hidden" aria-hidden="true">
        <path
          d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        viewBox="0 0 20 20"
        className="hidden size-[18px] dark:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 2v1.8M10 16.2V18M18 10h-1.8M3.8 10H2M15.7 4.3l-1.3 1.3M5.6 14.4l-1.3 1.3M15.7 15.7l-1.3-1.3M5.6 5.6 4.3 4.3" />
      </svg>
    </button>
  );
}
