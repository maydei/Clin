import { zoomAt } from "./geometry";
import type { Camera, Point } from "./types";

export type WheelGesture = {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export function cameraForWheel(camera: Camera, pointer: Point, gesture: WheelGesture): Camera {
  if (gesture.ctrlKey || gesture.metaKey) {
    return zoomAt(camera, pointer, camera.zoom * Math.exp(-gesture.deltaY * 0.009));
  }
  const horizontal = gesture.shiftKey && Math.abs(gesture.deltaX) < 0.1
    ? gesture.deltaY
    : gesture.deltaX;
  return {
    ...camera,
    x: camera.x - horizontal,
    y: camera.y - (gesture.shiftKey ? 0 : gesture.deltaY),
  };
}
