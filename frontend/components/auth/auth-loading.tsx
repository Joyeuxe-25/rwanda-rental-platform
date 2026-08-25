import { Loader2 } from 'lucide-react';

/** Loading state for protected routes — shown while auth is resolving, so
 * private content never flashes before the check completes. */
export function AuthLoading({ label = 'Checking your session…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
