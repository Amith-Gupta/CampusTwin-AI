# CampusTwin AI — Vision-Powered Smart Campus Intelligence System

<div align="center">
  <h3><em>"See Your Campus. Understand Its Usage. Optimize Its Resources."</em></h3>
  <p>An intelligent, vision-driven campus monitoring and predictive analytics platform powered by Ultralytics YOLOv8, Scikit-learn Machine Learning, OpenCV, Flask, and React TypeScript.</p>
</div>

---

## 1. Project Abstract & Objectives

**CampusTwin AI** is an advanced, privacy-first smart campus digital twin designed for modern academic institutions. Modern universities struggle with inefficient classroom allocation, overcrowding safety hazards, and unscheduled after-hours facility usage.

CampusTwin AI solves these challenges by combining:
1. **Edge Computer Vision**: Real-time person detection and unique centroid tracking using pretrained **Ultralytics YOLOv8n** (filtered strictly for class `#0: person` with dynamic confidence thresholding).
2. **Occupancy Intelligence**: Real-time capacity utilization monitoring, low/normal/high/full status categorization, and live seating availability.
3. **Machine Learning Occupancy Forecasting**: Chronologically evaluated **Scikit-learn Random Forest Regressor** predicting upcoming 24-hour and 48-hour occupancy with confidence interval upper/lower bounds.
4. **Anomaly & Hazard Detection**: **Scikit-learn Isolation Forest** combined with deterministic safety rules flagging overcapacity fire hazards and after-hours facility access.
5. **Smart Space Recommendations**: Rule-based cross-facility reallocation engine identifying space swaps and underutilized zones.
6. **Modern Executive Dashboard**: Designed in alignment with the Figma Smart Campus OS specification featuring glassmorphic telemetry cards, smooth spline occupancy analytics, and a 30-60 FPS live vision HUD.

---

## 2. System Architecture

```
                        ┌────────────────────────────────────────────────────────┐
                        │        Web Client (React 18 + Vite + TypeScript)       │
                        │   - Live Laptop Webcam Feed (Canvas HUD Overlay)       │
                        │   - Recorded Video Upload Dropzone (MP4/AVI/WebM)      │
                        │   - Real-Time Recharts Analytics & KPI Dashboards      │
                        │   - Dynamic YOLO Confidence Slider (20% - 85%)         │
                        │   - Forensic Evidence Snapshot & CSV Exporter          │
                        └───────────────────────────┬────────────────────────────┘
                                                    │
                                   Base64 Frame / Multipart Video
                                                    │
                                                    ▼
                        ┌────────────────────────────────────────────────────────┐
                        │                 Flask REST API Backend                 │
                        │   - MIME & 50MB Upload Restriction Guards              │
                        │   - OpenCV Frame Decode & BGR Standardization          │
                        │   - Persistent YOLOv8n Singleton Detector              │
                        │   - SQLAlchemy Scoped Sessions (NullPool for SQLite)   │
                        └─────────────┬────────────────────────────┬─────────────┘
                                      │                            │
                     Frame Inference  ▼                            ▼  Relational Storage
        ┌─────────────────────────────────────────┐   ┌───────────────────────────────┐
        │        Computer Vision Pipeline         │   │         SQLite Database       │
        │   - Ultralytics YOLOv8n Pretrained      │   │   - `rooms` Table             │
        │   - Strict Person Class (#0) Filter     │   │   - `occupancy` Readings      │
        │   - Euclidean Centroid Tracker          │   │   - `equipment` Specifications│
        │   - Real-Time HUD Bounding Boxes        │   │   - `alerts` & `model_metrics`│
        └─────────────────────┬───────────────────┘   └───────────────┬───────────────┘
                              │                                       │
                              ▼                                       │
        ┌─────────────────────────────────────────────────────────┐   │
        │               Machine Learning Engines                  │   │
        │   - Scikit-learn Random Forest Forecaster (MAE: 1.28)   │◄──┘
        │   - Chronological Train/Test Split (No Future Leakage)  │
        │   - Scikit-learn Isolation Forest Anomaly Detector      │
        └─────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts, Axios.
- **Backend**: Python 3.10+, Flask, Flask-CORS, SQLAlchemy, SQLite.
- **Computer Vision**: Ultralytics YOLOv8n (pretrained person detection), OpenCV (Headless).
- **Machine Learning**: Scikit-learn (Random Forest Regressor, Isolation Forest), NumPy, Pandas, Joblib.
- **Testing**: Pytest automated suite covering all 19 operational test cases.

---

## 4. Configured Campus Classrooms (Initial Seed)

| Building | Room Number | Room Type | Capacity | Camera Source | Operating Hours |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Science Block** | `SCI-101` | Lecture Hall | 60 seats | `webcam_0` (Laptop Cam) | 08:00 - 18:00 |
| **Engineering Wing** | `ENG-204` | Computer Lab | 45 seats | `uploaded_video` | 08:00 - 20:00 |
| **Main Library** | `LIB-3A` | Study Lounge | 30 seats | `demo_feed` | 08:00 - 22:00 |
| **Academic Block B** | `AUD-B` | Grand Auditorium | 150 seats | `demo_feed` | 09:00 - 18:00 |
| **Management Block** | `MBA-12` | Executive Seminar | 35 seats | `webcam_0` | 08:30 - 17:30 |

---

## 5. Machine Learning Models & Evaluation

### A. Classroom Occupancy Forecaster
- **Algorithm**: Scikit-learn `RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42)`.
- **Feature Set**: `hour` (0–23), `day_of_week` (0–6), `is_weekend`, `is_operating_hours`, `room_capacity`, `lag_1h`, `lag_2h`.
- **Validation**: Strict **Chronological Train/Test Split** (80% historical train, 20% future holdout). No accidental future data leakage.
- **Evaluation Metrics**:
  - **Mean Absolute Error (MAE)**: `1.28 people`
  - **Root Mean Squared Error (RMSE)**: `3.12 people`
  - **Variance Score ($R^2$)**: `0.971`
  - **Training Set Size**: `1,440 hourly observations`
  - **Holdout Test Size**: `360 hourly observations`

### B. Anomaly Detection
- **Algorithm**: Scikit-learn `IsolationForest(n_estimators=100, contamination=0.05)`.
- **Rule Layer**:
  - *Overcapacity*: People count > Room fire capacity.
  - *After-Hours Occupancy*: People count $\ge 5$ outside configured operating window.
  - *Sudden Occupancy Spikes*: Deviation beyond calibrated confidence envelopes.

---

## 6. Verified Test Suite Results

All **19 unit and integration tests** pass:
```bash
tests/test_campustwin.py::test_health_endpoint PASSED                    [  5%]
tests/test_campustwin.py::test_system_status_endpoint PASSED             [ 10%]
tests/test_campustwin.py::test_create_room PASSED                        [ 15%]
tests/test_campustwin.py::test_get_rooms_and_details PASSED              [ 21%]
tests/test_campustwin.py::test_update_room PASSED                        [ 26%]
tests/test_campustwin.py::test_occupancy_percentage_calculation PASSED   [ 31%]
tests/test_campustwin.py::test_camera_lifecycle PASSED                   [ 36%]
tests/test_campustwin.py::test_person_detection_pipeline PASSED          [ 42%]
tests/test_campustwin.py::test_empty_room_detection PASSED               [ 47%]
tests/test_campustwin.py::test_video_file_analysis PASSED                [ 52%]
tests/test_campustwin.py::test_invalid_video_upload_rejected PASSED      [ 57%]
tests/test_campustwin.py::test_energy_calculation_formula PASSED         [ 63%]
tests/test_campustwin.py::test_record_meter_reading PASSED               [ 68%]
tests/test_campustwin.py::test_forecaster_training_and_chronological_split PASSED [ 73%]
tests/test_campustwin.py::test_forecaster_future_projections PASSED      [ 78%]
tests/test_campustwin.py::test_anomaly_detection_rules PASSED            [ 84%]
tests/test_campustwin.py::test_alert_acknowledgement PASSED              [ 89%]
tests/test_campustwin.py::test_forecaster_empty_dataset_rejection PASSED [ 94%]
tests/test_campustwin.py::test_delete_room PASSED                        [100%]
============================= 19 passed in 15.47s =============================
```

---

## 7. Quickstart & Demonstration Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Start Flask Backend
```bash
cd backend
.\venv\Scripts\activate       # On Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
python app.py
```
Backend runs on `http://127.0.0.1:5000`. On first launch, it automatically seeds 5 classrooms with 14 days of realistic hourly history.

### 2. Start Frontend Dev Server
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **[http://localhost:5173/](http://localhost:5173/)** in your browser.

### 3. Step-by-Step College Demonstration
1. **Overview Dashboard**: Review live KPI cards (campus occupancy %, available seats, average room utilization, active anomalies).
2. **Live Vision Testing**:
   - Navigate to the **Live Vision** tab.
   - Click **Start Live Camera** to stream your laptop webcam at smooth 30–60 FPS.
   - Observe live glowing cyan bounding boxes drawing around detected people with track IDs, live FPS, and confidence %.
   - Adjust the **YOLO Confidence Threshold Slider** (20% – 85%) to dynamically tune detector sensitivity.
   - Click **Save Evidence** to export a forensic snapshot.
   - Or switch to **Upload Campus Video** and drop in `datasets/sample/classroom_sample.mp4` to inspect the timeline person count.
3. **Classroom Management**: Add a custom classroom, configure room capacity, filter by building, and download the full classroom inventory via **Export CSV Report**.
4. **Predictive Analytics & Forecasting**:
   - Switch to **Analytics & Forecast**.
   - Inspect the **Random Forest 24h & 48h Occupancy Projections** with shaded 90% confidence bounds.
   - Click **Retrain** to trigger real-time refitting of the trees on historical observations.
5. **Anomaly Alerts**:
   - Switch to **Alerts** to review flagged overcapacity and after-hours facility access.
   - Click **Acknowledge** on an alert to test the resolution workflow.
