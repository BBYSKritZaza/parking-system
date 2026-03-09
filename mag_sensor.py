import serial
import math
import time
import statistics
import requests
import argparse
import sys

# CONFIGURATION DEFAULTS
DEFAULT_PORT = "COM3"
DEFAULT_BAUD = 115200
DEFAULT_API_URL = "http://localhost:3000/api/parking/update"
DEFAULT_SLOT = "Slot 1"

window_size = 50
median_buffer = []
baseline = None
period_count = 0

def send_status_to_server(api_url, slot_number, status, sensor_id=None):
    payload = {
        "slot_number": slot_number,
        "spot_status": status,
        "sensor_id": sensor_id
    }
    try:
        response = requests.post(api_url, json=payload, timeout=2)
        if response.status_code == 200:
            target = sensor_id if sensor_id else slot_number
            print(f"✅ Server updated [{target}]: {status}")
        else:
            print(f"❌ Server Error: {response.status_code} - {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"⚠️ Connection Error: {e}")

def main():
    global baseline, period_count, median_buffer
    
    parser = argparse.ArgumentParser(description='Magnetic Parking Sensor Reader')
    parser.add_argument('--port', type=str, default=DEFAULT_PORT, help='Serial port (e.g., COM3)')
    parser.add_argument('--slot', type=str, default=DEFAULT_SLOT, help='Parking Slot ID (e.g., "Slot 1", "A01")')
    parser.add_argument('--sensor-id', type=str, default="SENSOR_01", help='Unique Sensor ID (e.g., SENSOR_01)')
    parser.add_argument('--baud', type=int, default=DEFAULT_BAUD, help='Baud rate')
    parser.add_argument('--url', type=str, default=DEFAULT_API_URL, help='API URL')
    
    args = parser.parse_args()
    
    print(f"Starting Sensor Reader...")
    print(f"Sensor ID: {args.sensor_id}")
    print(f"Target Slot (Fallback): {args.slot}")
    print(f"Serial Port: {args.port} @ {args.baud}")
    print(f"API URL: {args.url}")
    print("-" * 30)

    while True:
        ser = None
        try:
            print(f"Attempting to connect to {args.port}...")
            ser = serial.Serial(args.port, args.baud, timeout=1)
            time.sleep(2)  # Wait for Arduino reset
            print(f"Connected to {args.port}.")
            print("Beginning data collection...")
            
            buffer = []
            
            while True:
                try:
                    line = ser.readline().decode(errors="ignore").strip()

                    if not line:
                        continue

                    parts = line.split(",")
                    if len(parts) != 3:
                        continue

                    x, y, z = map(int, parts)

                    # 1) Calculate magnitude
                    mag = math.sqrt(x*x + y*y + z*z)

                    # 2) Median Filter
                    median_buffer.append(mag)
                    if len(median_buffer) > 5:
                        median_buffer.pop(0)
                    filtered_mag = statistics.median(median_buffer)

                    # 3) Cutoff spikes
                    if filtered_mag < 100 or filtered_mag > 10000:
                        continue

                    # 4) Windowing
                    buffer.append(filtered_mag)

                    if len(buffer) >= window_size:
                        current_mean = sum(buffer) / len(buffer)
                        period_count += 1
                        
                        print(f"\nPeriod {period_count}: Mean = {current_mean:.2f}")

                        # 5) Baseline Logic
                        if baseline is None:
                            baseline = current_mean
                            print("Baseline set.")
                            send_status_to_server(args.url, args.slot, "ว่าง", args.sensor_id)
                        else:
                            diff = abs(current_mean - baseline)
                            print(f"Diff: {diff:.2f}")

                            # 6) Detection Logic
                            status_to_send = "ไม่ใช่รถ"
                            if diff <= 5:
                                print(">> No Car")
                                baseline = current_mean 
                                status_to_send = "ว่าง"
                            elif 50 <= diff <= 150:
                                print(">> High Car/Big Car detected")
                                status_to_send = "มีรถใหญ่"
                            elif 200 <= diff <= 800:
                                print(">> Low Car/Small Car detected")
                                status_to_send = "มีรถเล็ก"
                            else:
                                print(">> Not a car")
                                status_to_send = "ไม่ใช่รถ"
                            
                            send_status_to_server(args.url, args.slot, status_to_send, args.sensor_id)

                        buffer.clear()

                except serial.SerialException as e:
                    print(f"Serial Read Error: {e}")
                    break # Break inner loop to reconnect

        except serial.SerialException as e:
            print(f"Connection Failed: {e}")
            print("Retrying in 2 seconds...")
            time.sleep(2)
            
        except KeyboardInterrupt:
            print("\nExiting program by user.")
            break
            
        except Exception as e:
            print(f"Unexpected Error: {e}")
            time.sleep(2)
            
        finally:
            if ser and ser.is_open:
                ser.close()

if __name__ == "__main__":
    main()
