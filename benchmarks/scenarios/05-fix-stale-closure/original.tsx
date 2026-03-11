import React, { useState, useEffect, useRef } from 'react';

interface Props {
  initialSeconds: number;
  onExpire: () => void;
}

export function CountdownTimer({ initialSeconds, onExpire }: Props) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return;

    // Bug: the interval callback closes over the initial value of `seconds`
    // and `onExpire` from the first render. When seconds reaches 0, the
    // comparison `seconds === 0` always sees the stale initial value.
    const id = setInterval(() => {
      setSeconds(seconds - 1);
      if (seconds === 0) {
        clearInterval(id);
        setIsRunning(false);
        onExpire(); // stale closure — may never fire
      }
    }, 1000);

    return () => clearInterval(id);
  }, [isRunning]); // missing seconds and onExpire

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
