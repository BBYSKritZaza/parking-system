import serial
import requests
import time
import threading

# CONFIGURATION
# Update this URL to point to your Node.js server
API_URL = "http://localhost:3000/api/parking/update" 
COM_PORT = "COM3" 
BAUD_RATE = 115200

def read_arduino():
    try:
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
        time.sleep(2)
        print(f"[Reader] Connected to Arduino on {COM_PORT}")
    except Exception as e:
        print(f"[Reader] Serial connection error: {e}")
        return

    while True:
        try:
            line = ser.readline().decode(errors="ignore").strip()
            if line.isdigit():
                val = int(line)
                print(f"[Reader] Sensor Raw Value: {val}")

                # Logic: 1 = Occupied (Red), 0 = Empty (Green)
                # Based on your request: "0 is 1 is not empty" -> If sensor sends 1, it's NOT empty (Occupied).
                # Adjust this logic if your sensor behaves differently.
                # Map to spot_status
                spot_status = "มีรถเล็ก" if val == 1 else "ว่าง"

                payload = {
                    "slot_number": "Slot 1",
                    "spot_status": spot_status
                }
                
                try:
                    res = requests.post(API_URL, json=payload, timeout=3)
                    print(f"[API] Sent: {payload} | Response: {res.status_code}")
                except Exception as e:
                    print(f"[API] Error sending data: {e}")

            elif line != "":
                print(f"[Arduino Debug] {line}")
                
        except Exception as e:
            print(f"[Error] Loop error: {e}")
            
        time.sleep(0.2)

if __name__ == "__main__":
    print("Starting Arduino Reader...")
    read_arduino()
