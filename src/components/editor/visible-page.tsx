"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Keep the lightweight page shell in layout for scrolling, selection and hit testing.
// One observer serves all page shells, including transformed canvas pages.
const listeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

export function VisiblePage({ children }: { children: ReactNode | (() => ReactNode) }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin: "200px" });
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    listeners.set(element, (isVisible) => {
      clearTimeout(hideTimer);
      if (isVisible) setVisible(true);
      else hideTimer = setTimeout(() => setVisible(false), 600);
    });
    observer.observe(element);
    return () => {
      clearTimeout(hideTimer);
      observer?.unobserve(element);
      listeners.delete(element);
      if (!listeners.size) { observer?.disconnect(); observer = undefined; }
    };
  }, []);
  return <div ref={ref} className="absolute inset-0">{visible ? (typeof children === "function" ? children() : children) : <div className="absolute inset-0 bg-white" />}</div>;
}
