//우노 4번 메인
#include <Wire.h>

const int TRIG_10 = 2;
const int ECHO_10 = 3;

const int RED_10   = 8;
const int GREEN_10 = 9;

const int PARKING_DISTANCE = 20;

byte parking[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};

long getDistance() {
  digitalWrite(TRIG_10, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_10, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_10, LOW);

  long duration = pulseIn(ECHO_10, HIGH, 30000);

  if (duration == 0) {
    return 999;
  }

  return duration * 0.034 / 2;
}

void getSlaveData(byte address, int startIndex) {

  Wire.requestFrom(address, (byte)3);

  int i = 0;

  while (Wire.available() && i < 3) {
    parking[startIndex + i] = Wire.read();
    i++;
  }
}

void setup() {

  Serial.begin(9600);

  Wire.begin();

  pinMode(TRIG_10, OUTPUT);
  pinMode(ECHO_10, INPUT);

  pinMode(RED_10, OUTPUT);
  pinMode(GREEN_10, OUTPUT);

  Serial.println("주차장 시스템 시작");
}

void loop() {

  // 1~3번
  getSlaveData(0x08, 0);

  // 4~6번
  getSlaveData(0x09, 3);

  // 7~9번
  getSlaveData(0x0A, 6);

  // 10번
  long distance10 = getDistance();

  bool occupied10 =
    (distance10 != 999 && distance10 <= PARKING_DISTANCE);

  parking[9] = occupied10 ? 1 : 0;

  if (occupied10) {
    digitalWrite(RED_10, HIGH);
    digitalWrite(GREEN_10, LOW);
  } else {
    digitalWrite(RED_10, LOW);
    digitalWrite(GREEN_10, HIGH);
  }

  // 1~10번 출력
  for (int i = 0; i < 10; i++) {

    Serial.print(i + 1);
    Serial.print("번:");

    if (parking[i] == 1) {
      Serial.print("주차중");
    } else {
      Serial.print("빈자리");
    }

    if (i < 9) {
      Serial.print(" | ");
    }
  }

  Serial.println();

  delay(1000);
}