import { Activity, useState } from 'react';
import { FantasyTabActivationContext } from '../../context/FantasyTabVisibility.js';

/** Keep visited UI, suspend hidden effects, and freeze hidden route props. */
export default function FantasyTabPanel({ active, children }) {
  const [pane, setPane] = useState(() => ({ active, content: active ? children : null, activation: 0 }));
  if (pane.active !== active || (active && pane.content !== children)) {
    setPane({
      active,
      content: active ? children : pane.content,
      activation: active && !pane.active ? pane.activation + 1 : pane.activation,
    });
  }
  if (!pane.content) return null;
  return (
    <FantasyTabActivationContext.Provider value={pane.activation}>
      <Activity mode={active ? 'visible' : 'hidden'}>
        {active ? children : pane.content}
      </Activity>
    </FantasyTabActivationContext.Provider>
  );
}
