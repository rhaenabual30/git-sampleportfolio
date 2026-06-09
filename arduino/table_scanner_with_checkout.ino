/*
  ESP8266 + MFRC522 RFID -> Firestore + OLED Display
  "Scan Again to Cancel" + "Scan Again to Checkout" + 5s Timeout
*/

#include <SPI.h>
#include <MFRC522.h>
#include <ESP8266WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <WiFiManager.h>   // Captive portal
#include <GyverOLED.h>
#include <Wire.h>
#include <time.h>  // For NTP timestamp functionality

// RFID Pins
#define RST_PIN D3
#define SS_PIN  D4
MFRC522 rfid(SS_PIN, RST_PIN);

// Buzzer
#define BUZZER_PIN D8

// OLED (I2C SSD1306)
GyverOLED<SSH1106_128x64> oled;

// Firebase
#define API_KEY "AIzaSyAOpuKx1x0IXKZROiThWfrak1iDupk7puc"
#define FIREBASE_PROJECT_ID "senseat-42219"
#define USER_EMAIL "gabrielmendoza932@yahoo.com.ph"
#define USER_PASSWORD "Fundales_19"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Authorized UIDs
String authorizedUIDs[] = {
  "433E2738",
  "D3191A38"
};

String lastUID = "";
String lastTableDocId = "";  // Track the document ID for merged tables
unsigned long lastReadMs = 0;
const unsigned long READ_DEBOUNCE_MS = 1500;

// Cancel/Checkout mode tracking
bool waitingToCancel = false;
bool waitingToCheckout = false;
unsigned long actionStartMs = 0;
const unsigned long ACTION_TIMEOUT_MS = 5000;

// ---- Helpers ----
bool isAuthorized(const String &uid) {
  for (const String &authUID : authorizedUIDs) {
    if (uid == authUID) return true;
  }
  return false;
}

void printMemoryInfo() {
  Serial.print("Free Heap: ");
  Serial.print(ESP.getFreeHeap());
  Serial.print(" bytes, Fragmentation: ");
  Serial.print(ESP.getHeapFragmentation());
  Serial.println("%");
}

// Get current timestamp in ISO 8601 format for Firestore
String getCurrentTimestamp() {
  // Get current time since epoch in seconds
  time_t now = time(nullptr);
  struct tm* timeinfo = gmtime(&now);
  
  char timestamp[32];
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
  return String(timestamp);
}

String getCardUID() {
  String uidStr = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfid.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();
  return uidStr;
}

// ---- Buzzer Helpers ----
void initialBeep() { tone(BUZZER_PIN, 1000, 150); }
void successBeep() { tone(BUZZER_PIN, 1500, 150); }
void ultimateBeep() { tone(BUZZER_PIN, 2000, 150); }
void failBeep()    { tone(BUZZER_PIN, 500, 400); }

// ---- OLED Helper ----
void displayMessage(const String &msg) {
  // Display on OLED
  oled.clear();
  oled.setCursor(0, 0);

  int y = 0;
  int start = 0;
  for (int i = 0; i <= msg.length(); i++) {
    if (i == msg.length() || msg[i] == '\n') {
      String line = msg.substring(start, i);
      oled.setCursor(0, y);
      oled.print(line);
      y += 1;
      start = i + 1;
    }
  }
  oled.update();
  
  // Also display on Serial Monitor
  Serial.println("OLED Display:");
  Serial.println(msg);
  Serial.println("---");
}

// ---- WiFi Setup ----
void connectWiFi() {
  WiFiManager wm;
  bool res = wm.autoConnect("ESP_Config");

  if (!res) {
    Serial.println("Failed to connect to WiFi, restarting...");
    displayMessage("WiFi Failed\n\nRestarting...");
    failBeep();
    ESP.restart();
  } else {
    Serial.println("WiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    
    // Configure NTP for accurate timestamps
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("Waiting for NTP time sync...");
    
    time_t now = time(nullptr);
    int attempts = 0;
    while (now < 1000000000 && attempts < 20) { // Wait for valid timestamp
      delay(500);
      now = time(nullptr);
      attempts++;
      Serial.print(".");
    }
    Serial.println();
    
    if (now > 1000000000) {
      Serial.println("NTP time synchronized");
    } else {
      Serial.println("Warning: NTP sync failed, timestamps may be inaccurate");
    }
    
    displayMessage("WiFi Connected.");
    successBeep();
  }
}

// ---- Firebase ----
void setupFirebase() {
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  fbdo.setResponseSize(4096); // Reduced from 8192 to save memory
  displayMessage("Firebase Ready.");
  delay(2000);
  displayMessage("Ready to Scan.");
}

// ---- Find Table Document ID by UID ----
String findTableDocumentId(const String &uid) {
  // First try direct lookup with UID as document ID
  String docPath = "tables/" + uid;
  if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", docPath.c_str())) {
    return uid; // Found document with UID as ID
  }
  
  // For merged tables, try only the most likely combinations to reduce memory usage
  // Since we only have 2 authorized UIDs, there's only one possible merge for each
  String otherUID = "";
  if (uid == "433E2738") {
    otherUID = "D3191A38";
  } else if (uid == "D3191A38") {
    otherUID = "433E2738";
  } else {
    return ""; // Unknown UID, no merge possible
  }
  
  // Try both possible merge combinations (only 2 attempts instead of potentially many)
  String mergedIds[] = {uid + "-" + otherUID, otherUID + "-" + uid};
  
  for (int i = 0; i < 2; i++) {
    String mergedPath = "tables/" + mergedIds[i];
    
    // Simple existence check first - if document doesn't exist, skip expensive parsing
    if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", mergedPath.c_str())) {
      // Quick string search in payload instead of JSON parsing to save memory
      String payload = fbdo.payload();
      
      // Look for our UID in the payload (much faster and less memory than JSON parsing)
      if (payload.indexOf("\"" + uid + "\"") >= 0) {
        return mergedIds[i];
      }
    }
    
    // Add small delay to prevent watchdog issues
    yield();
  }
  
  return ""; // Document not found
}



// ---- Get Order ID from Table ----
String getOrderIdFromTable(const String &uid) {
  String docId = findTableDocumentId(uid);
  if (docId == "") {
    return ""; // Document not found
  }
  
  yield(); // Prevent watchdog reset
  
  String docPath = "tables/" + docId;
  if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", docPath.c_str())) {
    // Use string parsing instead of JSON for better memory efficiency
    String payload = fbdo.payload();
    int orderIdStart = payload.indexOf("\"orderId\"");
    if (orderIdStart >= 0) {
      int valueStart = payload.indexOf("\"stringValue\":", orderIdStart);
      if (valueStart >= 0) {
        int quoteStart = payload.indexOf("\"", valueStart + 14);
        int quoteEnd = payload.indexOf("\"", quoteStart + 1);
        if (quoteStart >= 0 && quoteEnd >= 0) {
          return payload.substring(quoteStart + 1, quoteEnd);
        }
      }
    }
  }
  return "";
}

// ---- Get Sales ID from Order ----
String getSalesIdFromOrder(const String &orderId) {
  yield(); // Prevent watchdog reset
  
  String docPath = "orders/" + orderId;
  if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", docPath.c_str())) {
    // Use string parsing instead of JSON for better memory efficiency
    String payload = fbdo.payload();
    int salesIdStart = payload.indexOf("\"salesId\"");
    if (salesIdStart >= 0) {
      int valueStart = payload.indexOf("\"stringValue\":", salesIdStart);
      if (valueStart >= 0) {
        int quoteStart = payload.indexOf("\"", valueStart + 14);
        int quoteEnd = payload.indexOf("\"", quoteStart + 1);
        if (quoteStart >= 0 && quoteEnd >= 0) {
          return payload.substring(quoteStart + 1, quoteEnd);
        }
      }
    }
  }
  return "";
}

// ---- Update Sales Status to Complete ----
bool completeSalesRecord(const String &salesId) {
  String docPath = "sales/" + salesId;
  
  FirebaseJson content, fields, statusObj, completedAtObj, updatedAtObj;
  statusObj.set("stringValue", "complete");
  
  // Use current timestamp for both completedAt and updatedAt
  String currentTime = getCurrentTimestamp();
  Serial.println("Completing sales with timestamp: " + currentTime);
  completedAtObj.set("timestampValue", currentTime);
  updatedAtObj.set("timestampValue", currentTime);
  
  fields.set("status", statusObj);
  fields.set("completedAt", completedAtObj);
  fields.set("updatedAt", updatedAtObj);
  content.set("fields", fields);
  
  if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", docPath.c_str(), content.raw(), "status,completedAt,updatedAt")) {
    Serial.println("Sales record completed: " + salesId);
    return true;
  } else {
    Serial.print("Sales update error: ");
    Serial.println(fbdo.errorReason());
    return false;
  }
}

// ---- Firestore Delete Table ----
bool deleteTableDocument(const String &uid) {
  String docId = findTableDocumentId(uid);
  if (docId == "") {
    Serial.println("Table document not found for UID: " + uid);
    return false;
  }
  
  String docPath = "tables/" + docId;
  if (Firebase.Firestore.deleteDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", docPath.c_str())) {
    Serial.println("Table document deleted: " + docId + " (for UID: " + uid + ")");
    return true;
  } else {
    Serial.print("Delete error: ");
    Serial.println(fbdo.errorReason());
    return false;
  }
}

// ---- Process Checkout ----
bool processCheckout(const String &uid) {
  displayMessage("Processing\nCheckout...");
  yield(); // Prevent watchdog reset
  
  // Get order ID from table
  String orderId = getOrderIdFromTable(uid);
  if (orderId == "") {
    displayMessage("Checkout Error\nNo Order Found");
    failBeep();
    return false;
  }
  
  Serial.println("Found order ID: " + orderId);
  yield(); // Prevent watchdog reset
  
  // Get sales ID from order
  String salesId = getSalesIdFromOrder(orderId);
  if (salesId == "") {
    displayMessage("Checkout Error\nNo Sales Found");
    failBeep();
    return false;
  }
  
  Serial.println("Found sales ID: " + salesId);
  yield(); // Prevent watchdog reset
  
  // Update sales record to complete
  if (completeSalesRecord(salesId)) {
    // Delete the table document (like in admin-table.js checkoutTableBtn)
    if (deleteTableDocument(uid)) {
      displayMessage("Checkout Complete\nUID: " + uid);
      successBeep();
      delay(2000);
      displayMessage("Ready to Scan.");
      return true;
    } else {
      displayMessage("Checkout Warning\nTable Not Deleted");
      successBeep(); // Still success because sales was updated
      delay(2000);
      displayMessage("Ready to Scan.");
      return true;
    }
  } else {
    displayMessage("Checkout Failed\nUID: " + uid);
    failBeep();
    return false;
  }
}

// ---- Firestore Cancel (Delete) ----
bool cancelTable(const String &uid) {
  if (deleteTableDocument(uid)) {
    displayMessage("Table Cancelled\nUID: " + uid);
    successBeep();
    delay(2000);
    displayMessage("Ready to Scan.");
    return true;
  } else {
    displayMessage("Cancel Error\nUID: " + uid);
    failBeep();
    return false;
  }
}

// ---- Setup ----
void setup() {
  delay(2500);
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);

  // OLED Init
  Wire.begin();
  oled.init();
  oled.clear();
  oled.setScale(1);
  displayMessage("System Booting...");

  initialBeep();

  SPI.begin();
  rfid.PCD_Init();
  delay(50);
  rfid.PCD_DumpVersionToSerial();
  Serial.println("Scan an RFID card...");
  displayMessage("Ready to Scan.");

  connectWiFi();
  delay(2000);
  setupFirebase();
  ultimateBeep();
}

// ---- Loop ----
void loop() {
  if (!Firebase.ready()) {
    delay(50);
    return;
  }

  // Timeout check for action modes
  if ((waitingToCancel || waitingToCheckout) && (millis() - actionStartMs > ACTION_TIMEOUT_MS)) {
    waitingToCancel = false;
    waitingToCheckout = false;
    lastTableDocId = "";  // Clear table document tracking
    displayMessage("Action timeout.");
    Serial.println("Action timeout expired. Back to normal mode.");
    delay(2000);
    displayMessage("Ready to Scan.");
  }

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    initialBeep();
    String currentUID = getCardUID();

    if (currentUID == lastUID && (millis() - lastReadMs) < READ_DEBOUNCE_MS) {
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
      return;
    }
    lastUID = currentUID;
    lastReadMs = millis();

    Serial.println("Card UID: " + currentUID);
    printMemoryInfo(); // Monitor memory usage
    displayMessage("Card UID:\n" + currentUID);

    if (isAuthorized(currentUID)) {
      // Cache the table document ID to avoid repeated expensive lookups
      String currentTableDocId = findTableDocumentId(currentUID);
      String status = "";
      
      if (currentTableDocId != "") {
        // Get status from the found document
        String docPath = "tables/" + currentTableDocId;
        if (Firebase.Firestore.getDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", docPath.c_str())) {
          // Quick string search instead of JSON parsing
          String payload = fbdo.payload();
          if (payload.indexOf("\"confirming\"") >= 0) {
            status = "confirming";
          } else if (payload.indexOf("\"ordering\"") >= 0) {
            status = "ordering";
          } else if (payload.indexOf("\"checkout\"") >= 0) {
            status = "checkout";
          }
        }
      }
      
      if (status == "") {
        // New card → create table document
        String documentPath = "tables/" + currentUID;

        FirebaseJson content, fields, uidObj, tsObj, statusObj;
        uidObj.set("stringValue", currentUID);
        statusObj.set("stringValue", "confirming");
        
        // Use current timestamp in proper Firestore format
        String currentTime = getCurrentTimestamp();
        Serial.println("Creating table with timestamp: " + currentTime);
        tsObj.set("timestampValue", currentTime);

        fields.set("uid", uidObj);
        fields.set("status", statusObj);
        fields.set("timestamp", tsObj);
        content.set("fields", fields);

        if (Firebase.Firestore.createDocument(&fbdo, FIREBASE_PROJECT_ID, "(default)", documentPath.c_str(), content.raw())) {
          Serial.println("Document created: " + currentUID);
          displayMessage("Table Reserved\nUID: " + currentUID);
          successBeep();
          delay(2000);
          displayMessage("Ready to Scan.");
          // Update tracking variables for new table
          lastTableDocId = currentUID;
        } else {
          Serial.print("Firestore Error: ");
          Serial.println(fbdo.errorReason());
          displayMessage("Firebase Error\n" + currentUID + "\n\nTry Again.");
          failBeep();
        }
      }
      else if (status == "confirming" || status == "ordering") {
        // For merged tables, check if we're scanning a card from the same table document
        bool isSameTable = (waitingToCancel && (currentUID == lastUID || currentTableDocId == lastTableDocId));
        
        if (isSameTable) {
          // Second scan: cancel table
          cancelTable(currentUID);
          waitingToCancel = false;
          lastTableDocId = "";
        } else {
          // First detection of confirming table
          displayMessage("Table Confirming\nScan again to\nCancel Table");
          successBeep();
          waitingToCancel = true;
          waitingToCheckout = false;
          actionStartMs = millis();
          lastTableDocId = currentTableDocId;
        }
      }
      else if (status == "checkout") {
        // For merged tables, check if we're scanning a card from the same table document
        bool isSameTable = (waitingToCheckout && (currentUID == lastUID || currentTableDocId == lastTableDocId));
        
        if (isSameTable) {
          // Second scan: process checkout
          processCheckout(currentUID);
          waitingToCheckout = false;
          lastTableDocId = "";
        } else {
          // First detection of checkout table
          displayMessage("Table Checkout\nScan again to\nComplete Order");
          successBeep();
          waitingToCheckout = true;
          waitingToCancel = false;
          actionStartMs = millis();
          lastTableDocId = currentTableDocId;
        }
      }
      else {
        // Other statuses (ordering, etc.)
        displayMessage("Table Status:\n" + status + "\n\nNo Action");
        successBeep();
        delay(2000);
        displayMessage("Ready to Scan.");
      }
    } else {
      failBeep();
      Serial.println("Unauthorized card");
      displayMessage("Unauthorized UID:\n" + currentUID);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }
}