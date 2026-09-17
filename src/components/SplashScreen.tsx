export function SplashScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex size-16 items-center justify-center rounded-full border border-[var(--border)] text-2xl font-semibold">
          P
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-[0.08em]">PORTABLE.AI</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Private local intelligence</p>
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
        </div>
      </div>
    </div>
  )
}
