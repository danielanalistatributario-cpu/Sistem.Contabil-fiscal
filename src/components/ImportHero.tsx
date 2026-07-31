type TitlePart = string | { text: string; accent?: boolean };

export function ImportHero({
  eyebrow,
  titleParts,
  description,
  badges,
}: {
  eyebrow: string;
  titleParts: TitlePart[];
  description: string;
  badges: string[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep text-white px-7 py-8 sm:px-9 sm:py-10">
      <div className="brand-arcs" />
      <div className="relative z-10">
        <p className="font-mono text-[11px] tracking-widest uppercase text-white/50 mb-3">— {eyebrow}</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight max-w-2xl">
          {titleParts.map((part, i) =>
            typeof part === 'string' ? (
              <span key={i}>{part} </span>
            ) : (
              <em key={i} className={`not-italic italic ${part.accent ? 'text-accent' : 'text-white/90'}`}>
                {part.text}{' '}
              </em>
            )
          )}
        </h1>
        <p className="text-white/70 text-sm mt-4 max-w-xl">{description}</p>
        <div className="flex flex-wrap gap-2 mt-6">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1 text-[11px] font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-lime shrink-0" />
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ImportTrustNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
      <span className="w-4 h-4 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
      </span>
      {text}
    </div>
  );
}
