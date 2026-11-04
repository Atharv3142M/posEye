import { useEffect, useState } from "react";

type Item = { id: number; text: string; kind: string };

let emit: (text: string, kind: string) => void = () => {};

export function toast(text: string, kind = "ok") {
  emit(text, kind);
}

export default function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    emit = (text, kind) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { id, text, kind }]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 3200);
    };
    return () => {
      emit = () => {};
    };
  }, []);

  return (
    <div className="toast-host">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>{item.text}</div>
      ))}
    </div>
  );
}
