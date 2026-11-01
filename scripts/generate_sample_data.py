import cv2
import numpy as np
from pathlib import Path

def create_sample_datasets():
    sample_dir = Path(__file__).resolve().parent.parent / "datasets" / "sample"
    sample_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create person_test.jpg with 2 person silhouettes
    img_person = np.ones((480, 640, 3), dtype=np.uint8) * 240
    # Room floor and whiteboard
    cv2.rectangle(img_person, (50, 50), (590, 200), (220, 220, 220), -1)
    cv2.rectangle(img_person, (0, 380), (640, 480), (180, 160, 140), -1)

    # Person 1 (head + torso + legs)
    cv2.circle(img_person, (220, 220), 30, (50, 50, 50), -1)
    cv2.rectangle(img_person, (185, 250), (255, 360), (40, 80, 180), -1)
    cv2.rectangle(img_person, (190, 360), (250, 440), (30, 30, 30), -1)

    # Person 2 (head + torso + legs)
    cv2.circle(img_person, (420, 210), 30, (50, 50, 50), -1)
    cv2.rectangle(img_person, (385, 240), (455, 350), (180, 40, 60), -1)
    cv2.rectangle(img_person, (390, 350), (450, 430), (30, 30, 30), -1)

    cv2.imwrite(str(sample_dir / "person_test.jpg"), img_person)
    print(f"[*] Generated: {sample_dir / 'person_test.jpg'}")

    # 2. Create empty_room.jpg with 0 persons
    img_empty = np.ones((480, 640, 3), dtype=np.uint8) * 240
    cv2.rectangle(img_empty, (50, 50), (590, 200), (220, 220, 220), -1)
    cv2.rectangle(img_empty, (0, 380), (640, 480), (180, 160, 140), -1)
    cv2.imwrite(str(sample_dir / "empty_room.jpg"), img_empty)
    print(f"[*] Generated: {sample_dir / 'empty_room.jpg'}")

    # 3. Create classroom_sample.mp4 (5 seconds, 15 FPS = 75 frames)
    video_path = sample_dir / "classroom_sample.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(video_path), fourcc, 15.0, (640, 480))

    for f in range(75):
        frame = np.ones((480, 640, 3), dtype=np.uint8) * 240
        # Background
        cv2.rectangle(frame, (50, 50), (590, 200), (220, 220, 220), -1)
        cv2.rectangle(frame, (0, 380), (640, 480), (180, 160, 140), -1)

        # Walking person moving across frame
        x_pos = int(100 + f * 5.0)
        cv2.circle(frame, (x_pos, 220), 28, (60, 60, 60), -1)
        cv2.rectangle(frame, (x_pos - 25, 250), (x_pos + 25, 360), (40, 120, 180), -1)
        cv2.rectangle(frame, (x_pos - 20, 360), (x_pos + 20, 430), (30, 30, 30), -1)

        out.write(frame)

    out.release()
    print(f"[*] Generated: {video_path}")

if __name__ == "__main__":
    create_sample_datasets()

