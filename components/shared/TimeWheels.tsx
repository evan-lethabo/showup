'use client';

import { useLayoutEffect, useRef } from 'react';
import { createWheelTimePicker, type WheelTimePicker } from '@/lib/ui/time-wheel-picker';

type WheelDescriptor = {
  key: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (minutes: number) => void;
};

function TimeWheel({ wheel }: { wheel: WheelDescriptor }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<WheelTimePicker | null>(null);
  const onChangeRef = useRef(wheel.onChange);
  const valueRef = useRef(wheel.value);
  onChangeRef.current = wheel.onChange;
  valueRef.current = wheel.value;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const picker = createWheelTimePicker(host, {
      value: valueRef.current,
      step: 15,
      min: wheel.min,
      max: wheel.max,
      label: wheel.label,
      onChange: (minutes) => onChangeRef.current(minutes),
    });
    pickerRef.current = picker;
    return () => {
      picker.destroy();
      pickerRef.current = null;
    };
  }, [wheel.label, wheel.min, wheel.max]);

  useLayoutEffect(() => {
    pickerRef.current?.set(wheel.value);
  }, [wheel.value]);

  return (
    <div className="time-picker-field">
      <p className="time-picker-label">{wheel.label}</p>
      <div className="time-picker-host" ref={hostRef} />
    </div>
  );
}

export default function TimeWheels({ wheels }: { wheels: WheelDescriptor[] }) {
  return (
    <div className="time-pickers">
      {(wheels || []).map((wheel) => (
        <TimeWheel key={wheel.key} wheel={wheel} />
      ))}
    </div>
  );
}
