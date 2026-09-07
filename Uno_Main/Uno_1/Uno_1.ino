//주차면 1 ~ 3번
#include <Wire.h>

const int trigPins[3] = {2, 4, 6};
const int echoPins[3] = {3, 5, 7};

const int redPins[3]   = {8, 10, 12};
const int greenPins[3] = {9, 11, 13};

const int PARKING_DISTANCE = 20;

byte parkingState[3] = {0, 0, 0};

long getDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);

  if (duration == 0) {
    return 999;
  }

  return duration * 0.034 / 2;
}

void requestEvent() {
  Wire.write(parkingState, 3);
}

void setup() {
  for (int i = 0; i < 3; i++) {
    pinMode(trigPins[i], OUTPUT);
    pinMode(echoPins[i], INPUT);

    pinMode(redPins[i], OUTPUT);
    pinMode(greenPins[i], OUTPUT);
  }

  Wire.begin(0x08);
  Wire.onRequest(requestEvent);
}

void loop() {
  for (int i = 0; i < 3; i++) {

    long distance = getDistance(trigPins[i], echoPins[i]);

    bool occupied =
      (distance != 999 && distance <= PARKING_DISTANCE);

    parkingState[i] = occupied ? 1 : 0;

    if (occupied) {
      digitalWrite(redPins[i], HIGH);
      digitalWrite(greenPins[i], LOW);
    } else {
      digitalWrite(redPins[i], LOW);
      digitalWrite(greenPins[i], HIGH);
    }

    delay(60);
  }

  delay(200);
}