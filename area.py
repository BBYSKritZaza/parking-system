import serial
import matplotlib.pyplot as plt
from collections import deque
import time
import numpy as np

# ---------- ตั้งค่า ----------
PORT = "COM4"
BAUD = 115200
MAX_POINTS = 300
window_size = 80
# ----------------------------

ser = serial.Serial(PORT, BAUD, timeout=1)
time.sleep(2)

delta_data = deque(maxlen=MAX_POINTS)
template = None
area = None

plt.ion()
fig, ax = plt.subplots()

ax.set_title("Delta Magnetic Field (Area Chart)")
ax.set_xlabel("Sample")
ax.set_ylabel("Δ|B|")
ax.grid(True)

ax.set_xlim(0, MAX_POINTS)
ax.set_ylim(0, 500)

detect_text = ax.text(10, 450, "", fontsize=12, color="red")

try:
    while True:
        raw = ser.readline().decode(errors="ignore").strip()
        if not raw:
            continue

        parts = raw.split(",")
        if len(parts) != 5:
            continue

        try:
            _, _, _, _, delta = map(float, parts)
        except ValueError:
            continue

        delta_data.append(delta)

        # -----------------------------
        # ตรวจจับรถด้วย Pattern Matching
        # -----------------------------
        if len(delta_data) >= window_size:
            current_window = np.array(list(delta_data)[-window_size:])

            # บันทึก template ครั้งแรกเมื่อสัญญาณแรงพอ
            if template is None and max(current_window) > 200:
                template = current_window.copy()
                print("บันทึก Template รถแล้ว")

            if template is not None:
                corr = np.corrcoef(current_window, template)[0, 1]

                if corr > 0.75:
                    detect_text.set_text("🚗 Car Detected")
                else:
                    detect_text.set_text("Monitoring...")
        else:
            detect_text.set_text("Collecting Data...")

        # -----------------------------
        # วาดกราฟ
        # -----------------------------
        x_axis = list(range(len(delta_data)))

        if area:
            area.remove()

        area = ax.fill_between(
            x_axis,
            delta_data,
            0,
            alpha=0.5
        )

        plt.pause(0.01)

except KeyboardInterrupt:
    print("หยุดการทำงาน")

finally:
    ser.close()