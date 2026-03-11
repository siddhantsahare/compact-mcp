import React, { useState, useEffect, useRef } from 'react';

interface Props {
  initialSeconds: number;
  onExpire: () => void;
}

export function CountdownTimer({ initialSeconds, onExpire }: Props) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const onExpireRef = useRef(onExpire);

  // Keep the ref up-to-date without restarting the interval
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setIsRunning(false);
          onExpireRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [isRunning]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="text-6xl font-mono tabular-nums">
        {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setIsRunning((r) => !r)}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          {isRunning ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => {
            setIsRunning(false);
            setSeconds(initialSeconds);
          }}
          className="px-4 py-2 border rounded"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
