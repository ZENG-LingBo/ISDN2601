
//**************************//
// Skeleton code of LAB_2A   //
//**************************//
//Pin Config
//You can use your own pinout
#define LED_PIN         2
#define Digital_Input_1 12
#define Digital_Input_2 19
#define Button_1        34

int State = 1;  // Initialize State to 1

void setup() {
  
  //Pin Mode Config  
  pinMode(Digital_Input_1, OUTPUT); // Set Input_1 as OUTPUT
  pinMode(Digital_Input_2, OUTPUT); // Set Input_2 as OUTPUT

  pinMode(LED_PIN, OUTPUT); // Set LED_PIN as OUTPUT
  pinMode(Button_1, INPUT); // Set Button_1 as INPUT

  Serial.begin(115200);  // Set Baud rate as 115200
}

void loop() {
  //*******************
  //------LAB 2A------
  //*******************
  if (State > 4)     // Reset the State
    State = 1;

  //--For Debug--
  Serial.println(State); 

  if (State == 1) {
    // For Digital_Input_1 & 2 are 1 
    digitalWrite(Digital_Input_1, HIGH); 
    digitalWrite(Digital_Input_2, HIGH);
    Serial.println("D1:1   D2:1 "); 
    delay(500);
    Serial.print("LED OFF");
  }
  else if (State == 2) {
    // For Digital_Input_1 == 1 and Digital_Input_2 == 0
    digitalWrite(Digital_Input_1, HIGH); 
    digitalWrite(Digital_Input_2, LOW);
    Serial.println("D1:1   D2:0 "); 
    delay(500);
    Serial.print("LED OFF");
  }
  else if (State == 3) {
    // For Digital_Input_1 == 0 and Digital_Input_2 == 1 
    digitalWrite(Digital_Input_1, LOW); 
    digitalWrite(Digital_Input_2, HIGH);
    Serial.println("D1:0   D2:1 "); 
    delay(500);
    Serial.print("LED OFF");
  }
  else if (State == 4) {
    // For Digital_Input_1 == 0 and Digital_Input_2 == 0 
    digitalWrite(Digital_Input_1, LOW); 
    digitalWrite(Digital_Input_2, LOW);
    Serial.println("D1:0   D2:0 "); 
    delay(500);
    Serial.print("LED ON");
  }
  // The end of Lab_2A
  
  // Using Push-Hold Button to switch digital input
  while (digitalRead(Button_1) == HIGH) { // Enter While loop 
    digitalWrite(LED_PIN, HIGH);     // LED Lights up 
    delay(100);
    if (digitalRead(Button_1) == LOW) { // Press 
      digitalWrite(LED_PIN, LOW);      // LED turn off
      State++;                         // State change (Switching output) 
      delay(100);
      
    }
  }
}
