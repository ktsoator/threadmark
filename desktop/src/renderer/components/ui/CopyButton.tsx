import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import IconButton from './IconButton';

export default function CopyButton({
  text,
  label,
}: {
  text: string | (() => string);
  label: string;
}) {
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <IconButton
      label={status || label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            typeof text === 'function' ? text() : text,
          );
          setStatus('Copied');
        } catch {
          setStatus('Could not copy');
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus(''), 1600);
      }}
    >
      {status === 'Copied' ? <Check size={14} /> : <Copy size={14} />}
    </IconButton>
  );
}
