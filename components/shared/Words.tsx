// Word-by-word entrance (styles/transitions.css .su-word). Keyed by position so re-renders with new text
// reuse the same elements and the animation only plays when the words first mount.
import type { CSSProperties } from 'react';

export default function Words({ text, start = 0 }: { text: string; start?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 ? ' ' : null}
          <span className="su-word" style={{ '--i': start + i } as CSSProperties}>
            {w}
          </span>
        </span>
      ))}
    </>
  );
}
