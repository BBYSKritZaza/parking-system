import serial
import time
import requests

def main():
    # ตั้งค่าพอร์ต Serial (ต้องแก้ไข 'COM3' ให้ตรงกับพอร์ตที่ต่อจริง)
    SERIAL_PORT = 'COM3' 
    BAUD_RATE = 9600
    API_URL = 'http://localhost:3000/api/parking/update'
    SLOT_NUMBER = 'Slot 1'

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"Connected to {SERIAL_PORT} at {BAUD_RATE} baud.")
    except serial.SerialException as e:
        print(f"Could not open serial port {SERIAL_PORT}: {e}")
        return

    time.sleep(2)
    print("Listening for sensor data...")

    samples = []
    MAX_SAMPLES = 50

    try:
        while True:
            if ser.in_waiting > 0:
                try:
                    line = ser.readline().decode('utf-8').strip()
                    if not line:
                        continue
                    
                    delta = int(line)
                    # เก็บค่าลงใน list
                    samples.append(delta)

                    # ถ้าครบ 50 ค่า ให้เริ่มประมวลผล
                    if len(samples) >= MAX_SAMPLES:
                        car_count = 0
                        
                        for val in samples:
                            if 100 <= val <= 5000:
                                car_count += 1
                        
                        # ตรวจสอบเงื่อนไข: เป็นรถมากกว่า 25 ครั้ง
                        is_car = car_count > 25
                        is_occupied = is_car # สมมติว่าถ้าเป็นรถ คือไม่ว่าง (Occupied)
                        
                        print(f"Stats: {car_count}/{MAX_SAMPLES} samples in range. Is Car? {is_car}")

                        # Map to spot_status
                        spot_status = "มีรถเล็ก" if is_car else "ว่าง"

                        # ส่งค่าไปยัง Server
                        payload = {
                            "slot_number": SLOT_NUMBER,
                            "spot_status": spot_status
                        }

                        try:
                            response = requests.post(API_URL, json=payload)
                            if response.status_code == 200:
                                print(f"Server updated: {payload}")
                            else:
                                print(f"Server Error: {response.text}")
                        except requests.exceptions.RequestException as e:
                            print(f"Connection Error: {e}")

                        # รีเซ็ตค่าหลังจากส่งเสร็จ
                        samples = []
                        
                except ValueError:
                    print(f"Invalid data: {line}")
                except UnicodeDecodeError:
                    print("Received invalid encoding")
                    
    except KeyboardInterrupt:
        print("\nExiting program.")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == "__main__":
    main()
