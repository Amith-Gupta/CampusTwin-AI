# CampusTwin AI — Datasets & Sample Media

This directory contains test datasets, baseline historical observations, and sample media for evaluating computer vision and machine learning pipelines without requiring live camera hardware.

---

## 1. Sample Media Files (`datasets/sample/`)

| Filename | Description | Purpose |
| :--- | :--- | :--- |
| `classroom_students.jpg` | Real photograph of students seated in a lecture hall. | Verified live person detection with Ultralytics YOLOv8n (conf: 69%, 10 people detected). |
| `classroom_sample.mp4` | 5-second 640x480 MP4 video clip generated at 15 FPS. | Evaluates video frame extraction, timeline person counts, and unique centroid tracking. |
| `person_test.jpg` | Synthetic test image with human silhouettes. | Unit test baseline for bounding box coordinate verification. |
| `empty_room.jpg` | Vacant classroom image with zero human occupants. | Negative control test verifying zero false positives. |

---

## 2. Historical Occupancy Demonstration Dataset

The SQLite database (`backend/campustwin.db`) is automatically seeded with **1,800 hourly observations** across 14 days for 5 representative campus classrooms:
- **Academic Schedule**: Realistic bell curves with morning lectures (09:00 - 12:00), lunch drop (13:00), afternoon classes (14:00 - 17:00), evening quiet hours, and minimal weekend activity.
- **Energy Correlates**: Active equipment wattage combined with occupant thermal metabolic heat (~85W per person).
- **Model Training**: Used for chronological train/test split evaluation of the Random Forest regressor and calibration of the Isolation Forest anomaly detector.
- **Privacy Assurance**: No biometric facial embeddings, facial recognition, or personal identities are extracted or stored.

