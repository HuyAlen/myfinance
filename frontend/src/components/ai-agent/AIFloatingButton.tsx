"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

type AIFloatingButtonProps = {
  onClick: () => void;
};

const STORAGE_KEY = "myfinance_ai_floating_position";
const BUTTON_SIZE = 56;

type Position = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultPosition(): Position {
  const safeBottom = window.innerWidth >= 1024 ? 24 : 112;

  return {
    x: window.innerWidth - BUTTON_SIZE - 20,
    y: window.innerHeight - BUTTON_SIZE - safeBottom,
  };
}

function getClampedPosition(position: Position): Position {
  const bottomSafeArea = window.innerWidth >= 1024 ? 16 : 104;

  return {
    x: clamp(position.x, 12, window.innerWidth - BUTTON_SIZE - 12),
    y: clamp(position.y, 76, window.innerHeight - BUTTON_SIZE - bottomSafeArea),
  };
}

function readStoredPosition(): Position {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPosition();

    const saved = JSON.parse(raw) as Partial<Position>;

    if (typeof saved.x !== "number" || typeof saved.y !== "number") {
      return getDefaultPosition();
    }

    return getClampedPosition({ x: saved.x, y: saved.y });
  } catch {
    return getDefaultPosition();
  }
}

function saveStoredPosition(position: Position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // ignore localStorage errors
  }
}

export default function AIFloatingButton({ onClick }: AIFloatingButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPosition(readStoredPosition());
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function handleResize() {
      setPosition((current) => {
        if (!current) return current;

        const next = getClampedPosition(current);
        saveStoredPosition(next);

        return next;
      });
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    dragRef.current = {
      dragging: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.dragging) return;

    const dx = Math.abs(event.clientX - dragRef.current.startX);
    const dy = Math.abs(event.clientY - dragRef.current.startY);

    if (dx > 4 || dy > 4) {
      dragRef.current.moved = true;
    }

    const next = getClampedPosition({
      x: event.clientX - dragRef.current.offsetX,
      y: event.clientY - dragRef.current.offsetY,
    });

    setPosition(next);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.dragging) return;

    dragRef.current.dragging = false;

    if (position) saveStoredPosition(position);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore pointer capture errors
    }

    if (!dragRef.current.moved) onClick();
  }

  if (!position) return null;

  return (
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current.dragging = false;
      }}
      aria-label="Mở AI Finance Agent"
      className={[
        "fixed z-90 flex size-14 touch-none select-none items-center justify-center rounded-3xl",
        "bg-linear-to-br from-blue-600 via-cyan-500 to-emerald-400",
        "text-white shadow-2xl shadow-blue-500/30 ring-1 ring-white/40",
        "transition-transform duration-150 hover:scale-105 active:scale-95",
        "cursor-grab active:cursor-grabbing",
      ].join(" ")}
      style={{ left: position.x, top: position.y }}
    >
      <span className="absolute inset-0 rounded-3xl bg-white/20 blur-sm" />
      <Sparkles size={24} className="relative" />
      <span className="absolute -right-1 -top-1 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm">
        AI
      </span>
    </button>
  );
}
