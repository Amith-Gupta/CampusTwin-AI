import os
import cv2
import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from app.config import Config

logger = logging.getLogger(__name__)

class PersonDetectionResult:
    """Encapsulates person detection and tracking outputs for a frame or clip."""
    def __init__(
        self,
        person_count: int,
        detections: List[Dict[str, Any]],
        annotated_image: Optional[np.ndarray] = None,
        confidence_avg: float = 0.0,
        model_used: str = "YOLOv8n",
        is_fallback: bool = False
    ):
        self.person_count = person_count
        self.detections = detections
        self.annotated_image = annotated_image
        self.confidence_avg = confidence_avg
        self.model_used = model_used
        self.is_fallback = is_fallback

    def to_dict(self) -> Dict[str, Any]:
        return {
            "person_count": self.person_count,
            "detections": self.detections,
            "confidence_avg": round(self.confidence_avg, 3),
            "model_used": self.model_used,
            "is_fallback": self.is_fallback
        }


class CentroidTracker:
    """Lightweight Euclidean centroid tracker to track unique people across frames."""
    def __init__(self, max_disappeared: int = 15):
        self.next_object_id = 1
        self.objects: Dict[int, Tuple[int, int]] = {}  # id -> (cX, cY)
        self.disappeared: Dict[int, int] = {}  # id -> frames_missed
        self.max_disappeared = max_disappeared

    def register(self, centroid: Tuple[int, int]) -> int:
        obj_id = self.next_object_id
        self.objects[obj_id] = centroid
        self.disappeared[obj_id] = 0
        self.next_object_id += 1
        return obj_id

    def deregister(self, object_id: int):
        if object_id in self.objects:
            del self.objects[object_id]
        if object_id in self.disappeared:
            del self.disappeared[object_id]

    def update(self, rects: List[Tuple[int, int, int, int]]) -> Dict[int, Tuple[int, int]]:
        if len(rects) == 0:
            for obj_id in list(self.disappeared.keys()):
                self.disappeared[obj_id] += 1
                if self.disappeared[obj_id] > self.max_disappeared:
                    self.deregister(obj_id)
            return self.objects

        input_centroids = np.zeros((len(rects), 2), dtype="int")
        for i, (startX, startY, endX, endY) in enumerate(rects):
            cX = int((startX + endX) / 2.0)
            cY = int((startY + endY) / 2.0)
            input_centroids[i] = (cX, cY)

        if len(self.objects) == 0:
            for i in range(len(input_centroids)):
                self.register((int(input_centroids[i][0]), int(input_centroids[i][1])))
        else:
            object_ids = list(self.objects.keys())
            object_centroids = list(self.objects.values())

            # Distance matrix between existing centroids and new input centroids
            D = np.linalg.norm(np.array(object_centroids)[:, np.newaxis] - input_centroids, axis=2)
            rows = D.min(axis=1).argsort()
            cols = D.argmin(axis=1)[rows]

            used_rows = set()
            used_cols = set()

            for (row, col) in zip(rows, cols):
                if row in used_rows or col in used_cols:
                    continue
                if D[row, col] > 120:  # Threshold in pixels
                    continue

                obj_id = object_ids[row]
                self.objects[obj_id] = (int(input_centroids[col][0]), int(input_centroids[col][1]))
                self.disappeared[obj_id] = 0
                used_rows.add(row)
                used_cols.add(col)

            unused_rows = set(range(0, D.shape[0])).difference(used_rows)
            unused_cols = set(range(0, D.shape[1])).difference(used_cols)

            for row in unused_rows:
                obj_id = object_ids[row]
                self.disappeared[obj_id] += 1
                if self.disappeared[obj_id] > self.max_disappeared:
                    self.deregister(obj_id)

            for col in unused_cols:
                self.register((int(input_centroids[col][0]), int(input_centroids[col][1])))

        return self.objects


class CampusVisionDetector:
    """Manages YOLOv8n pretrained person detection with OpenCV HOG fallback."""
    def __init__(self):
        self.model = None
        self.is_loaded = False
        self.model_name = Config.YOLO_MODEL_NAME
        self.conf_threshold = Config.YOLO_CONFIDENCE_THRESHOLD
        self.iou_threshold = Config.YOLO_IOU_THRESHOLD
        self.person_class_id = Config.PERSON_CLASS_ID
        self.tracker = CentroidTracker(max_disappeared=20)
        self.hog_detector = None
        self._init_detector()

    def _init_detector(self):
        """Attempts to load Ultralytics YOLOv8n, fallback to OpenCV HOG if unavailable."""
        try:
            from ultralytics import YOLO
            # Save or load model from backend/models/
            model_path = Config.MODEL_FOLDER / self.model_name
            Config.MODEL_FOLDER.mkdir(parents=True, exist_ok=True)

            logger.info(f"Loading YOLO model from {model_path} or hub...")
            self.model = YOLO(str(model_path) if model_path.exists() else self.model_name)
            self.is_loaded = True
            logger.info("YOLOv8n person detector successfully initialized.")
        except Exception as e:
            logger.warning(f"Could not initialize Ultralytics YOLO ({e}). Initializing OpenCV HOG Person Detector fallback.")
            self.model = None
            self.is_loaded = False
            self.hog_detector = cv2.HOGDescriptor()
            self.hog_detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def detect_image(
        self,
        image: np.ndarray,
        draw_boxes: bool = True,
        conf_threshold: Optional[float] = None
    ) -> PersonDetectionResult:
        """
        Runs person detection on a BGR numpy image frame.
        Filters specifically for person class (id 0) and tracks unique IDs.
        """
        if image is None or image.size == 0:
            return PersonDetectionResult(person_count=0, detections=[], model_used="none")

        effective_conf = float(conf_threshold) if (conf_threshold is not None and 0.05 <= float(conf_threshold) <= 0.95) else self.conf_threshold

        h, w = image.shape[:2]
        detections = []
        confidences = []
        rects_for_tracking = []

        annotated = image.copy() if draw_boxes else None

        if self.is_loaded and self.model is not None:
            # YOLO inference with fast CPU image sizing
            try:
                results = self.model.predict(
                    source=image,
                    conf=effective_conf,
                    iou=self.iou_threshold,
                    classes=[self.person_class_id],
                    imgsz=384,
                    verbose=False
                )

                for r in results:
                    boxes = r.boxes
                    for box in boxes:
                        cls_id = int(box.cls[0].item())
                        if cls_id != self.person_class_id:
                            continue  # Strictly person class

                        conf = float(box.conf[0].item())
                        xyxy = box.xyxy[0].tolist()
                        x1, y1, x2, y2 = [int(v) for v in xyxy]

                        # Clamp to image boundaries
                        x1, y1 = max(0, x1), max(0, y1)
                        x2, y2 = min(w, x2), min(h, y2)

                        detections.append({
                            "box": [x1, y1, x2, y2],
                            "confidence": round(conf, 3),
                            "class": "person"
                        })
                        confidences.append(conf)
                        rects_for_tracking.append((x1, y1, x2, y2))

                # Update centroid tracker
                tracked_objects = self.tracker.update(rects_for_tracking)

                # Match tracked IDs to detections by nearest centroid
                for det in detections:
                    bx1, by1, bx2, by2 = det["box"]
                    det_c = ((bx1 + bx2) // 2, (by1 + by2) // 2)
                    best_id = None
                    best_dist = float("inf")
                    for tid, tc in tracked_objects.items():
                        dist = (det_c[0] - tc[0])**2 + (det_c[1] - tc[1])**2
                        if dist < best_dist:
                            best_dist = dist
                            best_id = tid
                    det["track_id"] = best_id

                if draw_boxes and annotated is not None:
                    for det in detections:
                        x1, y1, x2, y2 = det["box"]
                        conf = det["confidence"]
                        tid = det.get("track_id", "")
                        label = f"Person #{tid} {int(conf * 100)}%" if tid else f"Person {int(conf * 100)}%"

                        # Electric blue bounding box with sleek header
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), (255, 180, 0), 2)  # Cyan/Blue
                        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                        cv2.rectangle(annotated, (x1, max(0, y1 - 20)), (x1 + tw + 6, max(20, y1)), (255, 180, 0), -1)
                        cv2.putText(annotated, label, (x1 + 3, max(15, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (10, 15, 30), 1, cv2.LINE_AA)

                avg_conf = float(np.mean(confidences)) if confidences else 0.0
                return PersonDetectionResult(
                    person_count=len(detections),
                    detections=detections,
                    annotated_image=annotated,
                    confidence_avg=avg_conf,
                    model_used="YOLOv8n Pretrained",
                    is_fallback=False
                )

            except Exception as e:
                logger.error(f"YOLO inference error ({e}). Using OpenCV HOG fallback.")

        # Fallback to OpenCV HOG People Detector
        if self.hog_detector is None:
            self.hog_detector = cv2.HOGDescriptor()
            self.hog_detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        boxes_hog, weights_hog = self.hog_detector.detectMultiScale(
            gray,
            winStride=(8, 8),
            padding=(4, 4),
            scale=1.05
        )

        for (x, y, bw, bh), weight in zip(boxes_hog, weights_hog):
            conf = min(0.95, max(0.40, float(weight)))
            x1, y1, x2, y2 = int(x), int(y), int(x + bw), int(y + bh)
            detections.append({
                "box": [x1, y1, x2, y2],
                "confidence": round(conf, 3),
                "class": "person",
                "track_id": None
            })
            confidences.append(conf)

            if draw_boxes and annotated is not None:
                cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 200, 255), 2)
                cv2.putText(annotated, f"Person (HOG) {int(conf * 100)}%", (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1)

        avg_conf = float(np.mean(confidences)) if confidences else 0.0
        return PersonDetectionResult(
            person_count=len(detections),
            detections=detections,
            annotated_image=annotated,
            confidence_avg=avg_conf,
            model_used="OpenCV HOG Detector (Fallback)",
            is_fallback=True
        )

    def process_video_file(
        self,
        video_path: str,
        sample_fps: float = 2.0,
        max_duration_sec: float = 60.0
    ) -> Dict[str, Any]:
        """
        Processes an uploaded video file, sampling frames at given interval.
        Returns peak occupancy, average occupancy, frame timeline, and total unique persons.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        duration = total_frames / orig_fps

        frame_step = max(1, int(orig_fps / sample_fps))
        frame_idx = 0
        sampled_results = []
        counts = []
        unique_track_ids = set()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            current_sec = frame_idx / orig_fps
            if current_sec > max_duration_sec:
                break

            if frame_idx % frame_step == 0:
                result = self.detect_image(frame, draw_boxes=False)
                counts.append(result.person_count)

                for det in result.detections:
                    if det.get("track_id"):
                        unique_track_ids.add(det["track_id"])

                sampled_results.append({
                    "timestamp_sec": round(current_sec, 2),
                    "person_count": result.person_count,
                    "confidence_avg": result.confidence_avg
                })

            frame_idx += 1

        cap.release()

        avg_count = float(np.mean(counts)) if counts else 0.0
        max_count = int(np.max(counts)) if counts else 0
        unique_estimate = max(len(unique_track_ids), max_count)

        return {
            "video_duration_seconds": round(min(duration, max_duration_sec), 2),
            "total_frames_analyzed": len(sampled_results),
            "average_people_count": round(avg_count, 1),
            "peak_people_count": max_count,
            "estimated_unique_people": unique_estimate,
            "timeline": sampled_results,
            "model_used": "YOLOv8n Pretrained" if self.is_loaded else "OpenCV HOG"
        }
