// ==========================================
// UNO #4 메인
// 1~9번 I2C 수신
// 10번 초음파센서 + LED
// LCD1602 I2C 표시
// ==========================================

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// LCD 주소
// 보통 0x27
LiquidCrystal_I2C lcd(0x27, 16, 2);


// ==========================================
// 10번 주차면
// ==========================================

const int TRIG_10 = 2;
const int ECHO_10 = 3;

const int RED_10   = 8;
const int GREEN_10 = 9;

const int PARKING_DISTANCE = 20;


// 1~10번 전체 주차상태
// 0 = 빈자리
// 1 = 주차중
byte parking[10] = {
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0
};


// ==========================================
// 10번 초음파 거리 측정
// ==========================================

long getDistance() {

  digitalWrite(TRIG_10, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_10, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_10, LOW);

  long duration =
    pulseIn(ECHO_10, HIGH, 30000);

  // 반사 신호가 없으면 999
  if (duration == 0) {
    return 999;
  }

  return duration * 0.034 / 2;
}


// ==========================================
// 서브 UNO 데이터 수신
// ==========================================

void getSlaveData(byte address, int startIndex) {

  Wire.requestFrom(address, (byte)3);

  int i = 0;

  while (Wire.available() && i < 3) {

    parking[startIndex + i] =
      Wire.read();

    i++;
  }
}


// ==========================================
// LCD 표시
// ==========================================

void updateLCD() {

  int occupiedCount = 0;

  // 주차중 개수 계산
  for (int i = 0; i < 10; i++) {

    if (parking[i] == 1) {
      occupiedCount++;
    }
  }

  int availableCount =
    10 - occupiedCount;


  // --------------------------
  // 첫 번째 줄 초기화
  // --------------------------

  lcd.setCursor(0, 0);
  lcd.print("                ");

  lcd.setCursor(0, 0);
  lcd.print("TOTAL:10 PARK:");
  lcd.print(occupiedCount);


  // --------------------------
  // 두 번째 줄 초기화
  // --------------------------

  lcd.setCursor(0, 1);
  lcd.print("                ");

  lcd.setCursor(0, 1);
  lcd.print("EMPTY:");
  lcd.print(availableCount);
}


// ==========================================
// SETUP
// ==========================================

void setup() {

  Serial.begin(9600);


  // I2C 시작
  Wire.begin();


  // --------------------------
  // LCD 시작
  // --------------------------

  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("PARKING SYSTEM");

  lcd.setCursor(0, 1);
  lcd.print("STARTING...");


  // --------------------------
  // 10번 센서
  // --------------------------

  pinMode(TRIG_10, OUTPUT);
  pinMode(ECHO_10, INPUT);


  // --------------------------
  // 10번 LED
  // --------------------------

  pinMode(RED_10, OUTPUT);
  pinMode(GREEN_10, OUTPUT);


  Serial.println("주차장 시스템 시작");

  delay(1500);

  lcd.clear();
}


// ==========================================
// LOOP
// ==========================================

void loop() {

  // ========================================
  // UNO #1
  // 1,2,3번
  // ========================================

  getSlaveData(0x08, 0);


  // ========================================
  // UNO #2
  // 4,5,6번
  // ========================================

  getSlaveData(0x09, 3);


  // ========================================
  // UNO #3
  // 7,8,9번
  // ========================================

  getSlaveData(0x0A, 6);


  // ========================================
  // 10번 직접 측정
  // ========================================

  long distance10 =
    getDistance();

  bool occupied10 =
    (
      distance10 != 999 &&
      distance10 <= PARKING_DISTANCE
    );

  parking[9] =
    occupied10 ? 1 : 0;


  // ========================================
  // 10번 LED
  // ========================================

  if (occupied10) {

    // 주차중
    digitalWrite(RED_10, HIGH);
    digitalWrite(GREEN_10, LOW);

  } else {

    // 빈자리
    digitalWrite(RED_10, LOW);
    digitalWrite(GREEN_10, HIGH);
  }


  // ========================================
  // 시리얼 출력
  // ========================================

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


  // ========================================
  // LCD 업데이트
  // ========================================

  updateLCD();


  delay(1000);
}