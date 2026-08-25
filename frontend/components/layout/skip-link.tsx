/**
 * Keyboard skip link — visually hidden until focused, then jumps to the main
 * content landmark (`#main-content`, rendered by AppShell). Accessibility.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-soft"
    >
      Skip to content
    </a>
  );
}
